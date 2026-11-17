export const SECTION_COLORS=['','#8b5cf6','#3b82f6','#14b8a6','#22c55e','#f59e0b','#ef4444','#ec4899','#64748b'];
export async function changeNoteLayout(db,owner,kind,input,op,actor){
 if(typeof op!=='string'||op.length<8||op.length>100)throw Error('Invalid operation ID.');
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([kind,input])))),b=>b.toString(16).padStart(2,'0')).join('');
 const prior=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(prior){if(prior.fingerprint!==fingerprint)throw Error('Operation ID already used.');return JSON.parse(prior.result_json);}
 const type=input.item_type;if(!['section','page'].includes(type))throw Error('Choose a page or section.');const table=type==='page'?'note_pages':'note_folders',parentColumn=type==='page'?'section_id':'parent_id';
 const item=await db.prepare(`SELECT * FROM ${table} WHERE owner_id=?1 AND id=?2`).bind(owner,input.id).first();if(!item||item.archived||type==='section'&&item.kind!=='section')throw Error('Active note item not found.');
 const activeFolder=async(id,expected)=>{const r=await db.prepare('SELECT * FROM note_folders WHERE owner_id=?1 AND id=?2').bind(owner,id).first();if(!r||r.kind!==expected||r.archived)throw Error('Choose an active '+expected+'.');if(r.parent_id){const p=await db.prepare('SELECT archived FROM note_folders WHERE owner_id=?1 AND id=?2').bind(owner,r.parent_id).first();if(!p||p.archived)throw Error('Notebook is archived.');}return r;};
 await activeFolder(item[parentColumn],type==='page'?'section':'notebook');
 const layout=await db.prepare('SELECT * FROM note_layout WHERE owner_id=?1 AND id=?2').bind(owner,item.id).first();const version=layout?.version||0;if(input.expected_layout_version!==version)throw Error('Conflict: note order or colour changed. Refresh and retry.');
 const stmts=[],at=new Date().toISOString();let parent=item[parentColumn];
 stmts.push(db.prepare("INSERT INTO note_layout(owner_id,id,color,rank,version) VALUES(?1,?2,'',0,0) ON CONFLICT(owner_id,id) DO UPDATE SET version=CASE WHEN note_layout.version=?3 THEN note_layout.version ELSE NULL END").bind(owner,item.id,version));
 if(kind==='set_note_color'){
  if(type!=='section'||!SECTION_COLORS.includes(input.color))throw Error('Choose a section colour.');stmts.push(db.prepare('UPDATE note_layout SET color=?1,version=version+1 WHERE owner_id=?2 AND id=?3').bind(input.color,owner,item.id));
 }else if(kind==='move_note_item'){
  parent=input.parent_id||parent;await activeFolder(parent,type==='page'?'section':'notebook');
  const siblings=(await db.prepare(`SELECT n.id FROM ${table} n LEFT JOIN note_layout l ON l.owner_id=n.owner_id AND l.id=n.id WHERE n.owner_id=?1 AND n.${parentColumn}=?2 AND n.archived=0 ${type==='section'?"AND n.kind='section'":''} ORDER BY COALESCE(l.rank,0),${type==='section'?'n.title,':''}n.id`).bind(owner,parent).all()).results.map(x=>x.id).filter(id=>id!==item.id);
  let index=siblings.length;if(input.before_id){index=siblings.indexOf(input.before_id);if(index<0)throw Error('Drop destination changed. Refresh and retry.');if(input.after)index++;}siblings.splice(index,0,item.id);
  if(parent!==item[parentColumn]){
   if(input.expected_version!==item.version)throw Error('Conflict: note changed. Save and retry the move.');
   if(type==='page')stmts.push(db.prepare("INSERT OR IGNORE INTO note_revisions(id,owner_id,page_id,page_version,snapshot,saved_at,reason) VALUES(?1,?2,?3,?4,?5,?6,'Before Move')").bind(at+'-'+crypto.randomUUID(),owner,item.id,item.version,JSON.stringify(item),at));
   stmts.push(db.prepare(`UPDATE ${table} SET ${parentColumn}=?1,version=CASE WHEN version=?2 THEN version+1 ELSE NULL END,updated_at=?3 WHERE owner_id=?4 AND id=?5`).bind(parent,item.version,at,owner,item.id));
  }
  const order=siblings.map((id,index)=>({id,rank:index+1}));stmts.push(db.prepare("INSERT INTO note_layout(owner_id,id,color,rank,version) SELECT ?1,json_extract(value,'$.id'),'',json_extract(value,'$.rank'),1 FROM json_each(?2) WHERE 1 ON CONFLICT(owner_id,id) DO UPDATE SET rank=excluded.rank,version=note_layout.version+1").bind(owner,JSON.stringify(order)));
 }else throw Error('Unknown note layout operation.');
 const result={entity:'note_layout',record:{id:item.id,parent_id:parent,layout_version:version+1,version:item.version+(parent!==item[parentColumn]?1:0)}};
 stmts.push(db.prepare('INSERT INTO operations(owner_id,operation_id,fingerprint,result_json) VALUES(?1,?2,?3,?4)').bind(owner,op,fingerprint,JSON.stringify(result)));
 stmts.push(db.prepare('INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,after_json,operation_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(owner,'note_layout',item.id,kind,actor,at,JSON.stringify(result.record),op));
 try{await db.batch(stmts);}catch{const retry=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(retry?.fingerprint===fingerprint)return JSON.parse(retry.result_json);throw Error('Conflict: nothing moved. Refresh and retry.');}return result;
}
