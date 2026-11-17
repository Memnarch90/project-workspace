import {digest,unpackNote} from './note-storage.mjs';
// Compose existing task/note SQL builders into one atomic transaction.
export async function noteAction(db,owner,makeService,input,operation,actor){
 if(typeof operation!=='string'||operation.length<8||operation.length>90)throw Error('Invalid operation ID.');
 const expand=async result=>{if(result.doc)return result;const rev=await db.prepare('SELECT snapshot FROM note_revisions WHERE owner_id=?1 AND page_id=?2 AND page_version=?3').bind(owner,result.note.id,result.note.version).first();if(!rev)throw Error('Saved action history missing.');return {...result,doc:(await unpackNote(db,owner,JSON.parse(rev.snapshot))).doc};};
 const fingerprint=await digest(JSON.stringify(input)),prior=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,operation).first();
 if(prior){if(prior.fingerprint!==fingerprint)throw Error('Operation ID already used.');return expand(JSON.parse(prior.result_json));}
 const statements=[],buffer={prepare:sql=>db.prepare(sql),batch:async rows=>{statements.push(...rows);return rows.map(()=>({success:true,results:[]}));}};
 const service=makeService(buffer,owner),page=await service.notes.get(input.note_id,{allowArchived:true});
 if(page.archived||page.section_archived||page.notebook_archived)throw Error('Choose an active note.');
 if(page.version!==input.expected_version)throw Error('Conflict: note changed. Reopen before creating this action.');
 const changes={title:input.title,due_date:input.due_date||null,project_id:input.project_id||null,workstream_id:input.workstream_id||null,notes:'From note: '+page.title+'\n/?note='+page.id+(input.meeting_id?'&meeting='+encodeURIComponent(input.meeting_id):'')};
 const task=await service.write(changes.project_id?'create_task':'create_todo',{changes},operation+'-task',actor);
 const doc=structuredClone(input.doc||page.doc),node={type:'systemTask',attrs:{task_id:task.record.id,label:task.record.title}};
 // Insert a reference where the command was invoked, without deleting any surrounding text.
 const index=Number.isInteger(input.block_index)?Math.max(0,Math.min(doc.content.length,input.block_index)):doc.content.length;doc.content.splice(index,0,node);
 const saved=await service.notes.write('save_note',{id:page.id,expected_version:page.version,doc,checkpoint:true},operation+'-note',actor);
 const result={task:task.record,note:saved.record,doc};
 statements.push(db.prepare('INSERT INTO operations(owner_id,operation_id,fingerprint,result_json) VALUES(?1,?2,?3,?4)').bind(owner,operation,fingerprint,JSON.stringify({task:task.record,note:saved.record})));
 try{await db.batch(statements);}catch{const retry=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,operation).first();if(retry?.fingerprint===fingerprint)return expand(JSON.parse(retry.result_json));throw Error('Conflict: nothing created. Reload the note and retry.');}return result;
}
