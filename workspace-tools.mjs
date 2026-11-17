import {SECTION_COLORS} from './note-layout-store.mjs';
import {validateImage} from './notes.mjs';
import {digest} from './note-storage.mjs';
import {NOTE_TABLES,NOTE_EXTRA_TABLES,validateNoteBackup} from './notes-model.mjs';
import {validateRisk} from './risks.mjs';
import {validatePatch} from './store.mjs';
import {projectInformation} from './project-information.mjs';
const tables={projects:'id owner_id name description status version',workstreams:'id project_id name',tasks:'id owner_id project_id workstream_id title item_type action_status done previous_action_status priority due_date follow_up_date start_date created_on completed_on waiting_on notes assignee department milestone_id version review_flags archived updated_at',dependencies:'task_id prerequisite_id',task_focus:'owner_id task_id selected',todo_items:'task_id owner_id is_general frequency interval_count basis anchor_day scheduled_date next_task_id',workspace_documents:'owner_id id kind version body',risks:'id owner_id project_id workstream_id reference date_raised function assignee description issue_date likelihood impact mitigation status comments reviewed_on archived version updated_at'};
Object.assign(tables,NOTE_TABLES,NOTE_EXTRA_TABLES);
tables.project_information='owner_id id body';
const text=(x,max=500)=>{if(typeof x!=='string'||x.length>max||x.includes('\0'))throw Error('Invalid text.');return x.trim();};
export function workspaceTools(db,owner){
 const document=async (id,includeTaskNotes=false)=>{const r=await db.prepare('SELECT * FROM workspace_documents WHERE owner_id=?1 AND id=?2').bind(owner,id).first();if(!r)return null;
  const body=JSON.parse(r.body);
  if(!includeTaskNotes){
   delete body.taskNotes;
   delete body.legacyNoteDate;
  }
  return {...r,body};};
 function validateTaskNotes(notes){
  if(!Array.isArray(notes)||notes.length>50)throw Error('Use up to 50 dated notes per item.');
  const ids=new Set();
  for(const note of notes){
   if(!text(note.id,100)||ids.has(note.id)||!text(note.text,4000))throw Error('Invalid task note.');
   ids.add(note.id);
   for(const date of [note.createdAt,note.editedAt].filter(d=>d!==null)){
    const time=new Date(date);
    if(typeof date!=='string'||!Number.isFinite(time.getTime())||time.toISOString()!==date)throw Error('Invalid task note timestamp.');
   }
   if(!note.createdAt||note.editedAt&&note.editedAt<note.createdAt)throw Error('Invalid task note timestamp.');
  }
  return notes;
 }
 function validateDocument(kind,b){
  if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Invalid details.');
  const checklist=(b.checklist||[]).map(c=>({id:text(c.id,100),text:text(c.text),done:c.done===true}));
  if(checklist.length>100||checklist.some(c=>!c.id||!c.text)||new Set(checklist.map(c=>c.id)).size!==checklist.length)throw Error('Use up to 100 distinct checklist steps.');
  const links=(b.links||[]).map(l=>{const url=new URL(text(l.url,2000));if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use a web link without embedded credentials.');return {title:text(l.title)||url.hostname,url:url.href};});
  if(links.length>30)throw Error('Use up to 30 links.');
  if(kind==='template'){const title=text(b.title);if(!title)throw Error('Template title required.');return {title,notes:text(b.notes||'',16000),checklist:checklist.map(c=>({...c,done:false})),links,archived:b.archived===true};}
  return {checklist,links,paused:b.paused===true,skipped:b.skipped===true};
 }
 async function backup(){
  const storage=await db.prepare('SELECT (SELECT COALESCE(SUM(length(data)),0) FROM note_images WHERE owner_id=?1)+(SELECT COALESCE(SUM(length(body)),0) FROM note_blobs WHERE owner_id=?1) AS bytes').bind(owner).first();if(storage.bytes>30000000)throw Error('Notes and screenshots exceed the full-workspace backup size. Export individual page archives to include their screenshots.');
  const queries=Object.keys(tables).map(t=>db.prepare(t==='workstreams'?'SELECT w.* FROM workstreams w JOIN projects p ON p.id=w.project_id WHERE p.owner_id=?1':t==='dependencies'?'SELECT d.* FROM dependencies d JOIN tasks t ON t.id=d.task_id WHERE t.owner_id=?1':`SELECT * FROM ${t} WHERE owner_id=?1`).bind(owner));
  queries.push(db.prepare('SELECT COALESCE(MAX(seq),0) AS cursor FROM audit_events WHERE owner_id=?1').bind(owner));
  const results=await db.batch(queries),cursor=results.pop().results[0].cursor;
  const data=Object.fromEntries(Object.keys(tables).map((t,i)=>[t,results[i].results]));
  const body={format:'project-workspace-backup',version:5,owner,created_at:new Date().toISOString(),cursor,data};
  const bytes=new TextEncoder().encode(JSON.stringify(body));
  return {...body,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')};
 }
 async function validateBackup(b){
  if(new TextEncoder().encode(JSON.stringify(b)).length>1500000)throw Error('Backup exceeds the 1.5 MB restore limit. Use administrator recovery for a larger workspace.');
  if(b?.format!=='project-workspace-backup'||![1,2,3,4,5].includes(b.version)||b.owner!==owner)throw Error('Use a backup from this workspace and owner.');
  const {sha256,...body}=b;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==sha256)throw Error('Backup is damaged or has been edited.');
  for(const [table,cols] of Object.entries(tables)){if(b.version<3&&table in NOTE_TABLES||b.version<4&&table in NOTE_EXTRA_TABLES||b.version<5&&table==='note_layout'||table==='project_information'&&!Object.hasOwn(b.data||{},table))continue;const rows=table==='risks'&&b.version===1&&!b.data?.risks?[]:b.data?.[table];if(!Array.isArray(rows)||rows.length>20000)throw Error('Invalid backup table.');for(const r of rows){if(Object.keys(r).sort().join(' ')!==cols.split(' ').sort().join(' ')||('owner_id'in r&&r.owner_id!==owner))throw Error('Invalid backup fields or owner.');if(Object.values(r).some(v=>typeof v==='object'&&v!==null))throw Error('Invalid backup values.');}}
  if(b.version>=4){for(const blob of b.data.note_blobs){if(typeof blob.body!=='string'||new TextEncoder().encode(blob.body).length>32000||await digest(blob.body)!==blob.id)throw Error('Invalid page chunk.');}for(const image of b.data.note_images){validateImage(image.mime,image.data);if(!b.data.note_pages.some(p=>p.id===image.page_id))throw Error('Invalid screenshot page.');}}
  if(b.version>=5){const ids=new Set([...b.data.note_folders,...b.data.note_pages].map(n=>n.id));for(const r of b.data.note_layout)if(!ids.has(r.id)||!SECTION_COLORS.includes(r.color)||!Number.isFinite(r.rank)||r.rank<0||!Number.isInteger(r.version)||r.version<1)throw Error('Invalid note layout.');}
  if(b.version>=3){validateNoteBackup(b.data,owner);for(const table of Object.keys(NOTE_TABLES)){const foreign=await db.prepare(`SELECT id FROM ${table} WHERE owner_id<>?1 AND id IN(SELECT json_extract(value,'$.id') FROM json_each(?2)) LIMIT 1`).bind(owner,JSON.stringify(b.data[table])).first();if(foreign)throw Error('Note IDs belong to another owner.');}}
  const ids=t=>new Set(b.data[t].map(r=>r.id));const taskIds=ids('tasks'),projectIds=ids('projects'),streamIds=ids('workstreams');
  for(const r of b.data.project_information||[]){
   if(!projectIds.has(r.id))throw Error('Missing backup project for project information.');
   projectInformation.parse(JSON.parse(r.body));
  }
  for(const t of b.data.tasks){validatePatch(Object.fromEntries(['title','project_id','workstream_id','item_type','action_status','priority','due_date','follow_up_date','start_date','waiting_on','notes','assignee','department','milestone_id'].map(k=>[k,t[k]])));if(t.project_id&&!projectIds.has(t.project_id)||t.workstream_id&&!streamIds.has(t.workstream_id)||t.milestone_id&&!taskIds.has(t.milestone_id)||![0,1].includes(t.done)||![0,1].includes(t.archived)||!Number.isInteger(t.version)||t.version<1)throw Error('Invalid backup task or link.');}
  for(const t of b.data.tasks){const flags=JSON.parse(t.review_flags);if(!Array.isArray(flags)||flags.some(f=>typeof f!=='string')||Boolean(t.done)!==(t.action_status==='Completed'))throw Error('Invalid backup status or source flags.');}
  for(const d of b.data.dependencies)if(!taskIds.has(d.task_id)||!taskIds.has(d.prerequisite_id))throw Error('Missing backup prerequisite.');
  for(const r of b.data.workstreams)if(!projectIds.has(r.project_id))throw Error('Missing backup project.');
  for(const r of [...b.data.task_focus,...b.data.todo_items])if(!taskIds.has(r.task_id)||r.next_task_id&&!taskIds.has(r.next_task_id))throw Error('Missing backup task.');
  for(const r of b.data.workspace_documents){if(!['task','template'].includes(r.kind)||r.kind==='task'&&!taskIds.has(r.id))throw Error('Invalid backup details.');const body=JSON.parse(r.body);validateDocument(r.kind,body);if(r.kind==='task'&&body.taskNotes!==undefined)validateTaskNotes(body.taskNotes);
   if(body.legacyNoteDate!==undefined){
    const date=new Date(body.legacyNoteDate+'T00:00:00Z');
    if(r.kind!=='task'||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==body.legacyNoteDate)throw Error('Invalid assigned note date.');
   }}
  for(const r of b.data.risks||[]){validateRisk(Object.fromEntries(Object.keys(r).filter(k=>!['id','owner_id','reference','version','updated_at'].includes(k)).map(k=>[k,k==='archived'?!!r[k]:r[k]])));if(![0,1].includes(r.archived)||!Number.isInteger(r.version)||r.version<1||!projectIds.has(r.project_id)||r.workstream_id&&!b.data.workstreams.some(w=>w.id===r.workstream_id&&w.project_id===r.project_id))throw Error('Invalid backup risk link.');}
  for(const table of ['projects','tasks','risks']){const foreign=await db.prepare(`SELECT id FROM ${table} WHERE owner_id<>?1 AND id IN(SELECT json_extract(value,'$.id') FROM json_each(?2)) LIMIT 1`).bind(owner,JSON.stringify(b.data[table]||[])).first();if(foreign)throw Error('Backup IDs belong to another owner.');}
  const foreignStreams=await db.prepare("SELECT w.id FROM workstreams w JOIN projects p ON p.id=w.project_id WHERE p.owner_id<>?1 AND w.id IN(SELECT json_extract(value,'$.id') FROM json_each(?2)) LIMIT 1").bind(owner,JSON.stringify(b.data.workstreams)).first();if(foreignStreams)throw Error('Backup IDs belong to another owner.');
  return {created_at:b.created_at,tasks:b.data.tasks.filter(t=>!t.archived).length,projects:b.data.projects.length};
 }
 async function write(kind,input,op,actor){
  text(op,100);if(op.length<8)throw Error('Invalid operation ID.');const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([kind,input])))),v=>v.toString(16).padStart(2,'0')).join('');
  const prior=await db.prepare('SELECT * FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(prior){if(prior.fingerprint!==fingerprint)throw Error('Operation ID already used.');return JSON.parse(prior.result_json);}
  const stmts=[];let record;
  const noteChange=kind==='save_task_note'||kind==='delete_task_note';
  if(kind==='save_document'||noteChange){
   const id=text(input.id,100),k=noteChange?'task':input.kind;if(!id||!['task','template'].includes(k))throw Error('Invalid details type.');
   if(k==='task'&&!await db.prepare('SELECT id FROM tasks WHERE id=?1 AND owner_id=?2 AND archived=0').bind(id,owner).first())throw Error('Task not found.');
   const before=await document(id,true);if(before?.kind&&before.kind!==k)throw Error('Details type conflict.');if((before?.version||0)!==input.expected_version)throw Error('Conflict: details changed. Reopen before saving.');
   const body=validateDocument(k,noteChange?(before?.body||{}):input.body);
   const notes=before?.body.taskNotes||[];
   if(kind==='save_task_note'){
    const noteId=text(input.note_id,100),value=text(input.text,4000);
    if(!noteId||!value)throw Error('Enter a note.');
    const existing=notes.find(note=>note.id===noteId),now=new Date().toISOString();
    if(Boolean(existing)!==Boolean(input.edit))throw Error('Conflict: the note changed. Reopen it before saving.');
    const note={id:noteId,text:value,createdAt:existing?.createdAt||now,editedAt:existing?now:null};
    body.taskNotes=validateTaskNotes(existing?notes.map(n=>n.id===noteId?note:n):[...notes,note]);
   }else if(kind==='delete_task_note'){
    if(!notes.some(note=>note.id===input.note_id))throw Error('Conflict: the note has already changed. Reopen the panel.');
    body.taskNotes=notes.filter(note=>note.id!==input.note_id);
   }else if(k==='task'&&notes.length)body.taskNotes=notes;
   if(k==='task'&&before?.body.legacyNoteDate)body.legacyNoteDate=before.body.legacyNoteDate;
   if(k==='task'&&body.paused){const r=await db.prepare("SELECT task_id FROM todo_items WHERE task_id=?1 AND owner_id=?2 AND frequency<>'none' AND next_task_id IS NULL").bind(id,owner).first();if(!r)throw Error('Only the current repeating routine can be paused.');}
   record={id,kind:k,version:(before?.version||0)+1,body:{...body}};
   delete record.body.taskNotes;
   delete record.body.legacyNoteDate;
   if(kind==='save_task_note'){
    const {id,createdAt,editedAt}=body.taskNotes.find(note=>note.id===input.note_id.trim());
    record.note={id,createdAt,editedAt};
   }
   if(before)stmts.push(db.prepare('UPDATE workspace_documents SET body=?1,version=CASE WHEN version=?2 THEN version+1 ELSE NULL END WHERE owner_id=?3 AND id=?4').bind(JSON.stringify(body),before.version,owner,id));else stmts.push(db.prepare('INSERT INTO workspace_documents(owner_id,id,kind,version,body) VALUES(?1,?2,?3,1,?4)').bind(owner,id,k,JSON.stringify(body)));
  }else if(kind==='restore_backup'){
   await validateBackup(input.backup);const current=await backup();if(new TextEncoder().encode(JSON.stringify(current)).length>1500000)throw Error('Current workspace exceeds the 1.5 MB recovery limit. Nothing was changed.');if(input.expected_cursor!==current.cursor)throw Error('Conflict: workspace changed. Preview the restore again.');
   // Guard and recovery snapshot participate in the same atomic batch as restoration.
   const recovery=crypto.randomUUID();stmts.push(db.prepare('INSERT INTO workspace_recovery(owner_id,id,created_at,snapshot) VALUES(?1,?2,?3,CASE WHEN (SELECT COALESCE(MAX(seq),0) FROM audit_events WHERE owner_id=?1)=?4 THEN ?5 ELSE NULL END)').bind(owner,recovery,new Date().toISOString(),input.expected_cursor,JSON.stringify(current)));
   const data=structuredClone(input.backup.data);data.risks||=[];
   if(data.project_information)stmts.push(db.prepare("DELETE FROM project_information WHERE owner_id=?1 AND id IN(SELECT json_extract(value,'$.id') FROM json_each(?2))").bind(owner,JSON.stringify(data.projects)));
   for(const r of data.workspace_documents){const old=current.data.workspace_documents.find(c=>c.id===r.id);r.version=Math.max(r.version,old?.version||0)+1;}
   stmts.push(db.prepare("UPDATE projects SET status='On Hold',version=version+1 WHERE owner_id=?1").bind(owner));
   // Retain records added after the backup; archive them instead of deleting history.
   stmts.push(db.prepare('UPDATE tasks SET archived=1,version=version+1 WHERE owner_id=?1').bind(owner));
   stmts.push(db.prepare('UPDATE risks SET archived=1,version=version+1 WHERE owner_id=?1').bind(owner));
   stmts.push(db.prepare('DELETE FROM dependencies WHERE task_id IN(SELECT id FROM tasks WHERE owner_id=?1)').bind(owner));
   for(const table of ['task_focus','todo_items','workspace_documents'])stmts.push(db.prepare(`DELETE FROM ${table} WHERE owner_id=?1`).bind(owner));
   if(input.backup.version>=3){
    for(const table of ['note_folders','note_pages']){for(const r of data[table]){const old=current.data[table].find(c=>c.id===r.id);r.version=Math.max(r.version,old?.version||0)+1;}stmts.push(db.prepare(`UPDATE ${table} SET archived=1,version=version+1 WHERE owner_id=?1`).bind(owner));}
   }
   for(const [table,cols] of Object.entries(tables)){
    if(input.backup.version<3&&table in NOTE_TABLES||input.backup.version<4&&table in NOTE_EXTRA_TABLES||input.backup.version<5&&table==='note_layout'||table==='project_information'&&!data[table])continue;
    const columns=cols.split(' '),primary=table==='dependencies'?['task_id','prerequisite_id']:table==='task_focus'?['owner_id','task_id']:table==='todo_items'?['task_id']:['workspace_documents','note_blobs','note_meetings','note_layout','project_information'].includes(table)?['owner_id','id']:['id'];
    const updates=columns.filter(c=>!primary.includes(c)).map(c=>`${c}=${c==='version'?`${table}.version+1`:'excluded.'+c}`);
    stmts.push(db.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?1) WHERE 1 ON CONFLICT(${primary.join(',')}) DO ${updates.length?'UPDATE SET '+updates.join(','):'NOTHING'}`).bind(JSON.stringify(data[table])));
   }
   if(input.backup.version===3){stmts.push(db.prepare('DELETE FROM note_meetings WHERE owner_id=?1').bind(owner));stmts.push(db.prepare(`INSERT OR IGNORE INTO note_meetings(id,owner_id,page_id,block_index,topic,meeting_when,participants,project_id,workstream_id,plain_text,text_refs) SELECT id,owner_id,id,0,json_extract(doc_json,'$.content[0].attrs.topic'),json_extract(doc_json,'$.content[0].attrs.when'),json_extract(doc_json,'$.content[0].attrs.participants'),project_id,workstream_id,plain_text,'[]' FROM note_pages WHERE owner_id=?1 AND json_extract(doc_json,'$.content[0].type')='meetingMeta'`).bind(owner));}
   record={id:recovery,recovery_id:recovery,restored:true};
  }else throw Error('Unsupported workspace operation.');
  const entity=noteChange?'task':kind==='save_document'?(input.kind==='task'?'task':'template'):'workspace';const result={entity,record};stmts.unshift(db.prepare('INSERT INTO operations(owner_id,operation_id,fingerprint,result_json) VALUES(?1,?2,?3,?4)').bind(owner,op,fingerprint,JSON.stringify(result)));
  stmts.push(db.prepare("INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,after_json,operation_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)").bind(owner,entity,record.id,kind,actor,new Date().toISOString(),JSON.stringify(record),op));
  try{await db.batch(stmts);}catch(e){const retry=await db.prepare('SELECT * FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(retry?.fingerprint===fingerprint)return JSON.parse(retry.result_json);throw Error('Conflict: the workspace changed. Reopen or refresh and retry.');}return result;
 }
 async function projectTaskNotes(projectId,limit){
  if(!text(projectId??'',100))throw Error('Choose a project.');
  const size=Number(limit||25);
  if(!Number.isInteger(size)||size<1||size>250)throw Error('Invalid note list size.');
  const rows=(await db.prepare(`WITH project_tasks AS (
   SELECT t.id,t.title,t.notes,d.body
   FROM tasks t LEFT JOIN workspace_documents d ON d.owner_id=t.owner_id AND d.id=t.id AND d.kind='task'
   WHERE t.owner_id=?1 AND t.project_id=?2 AND t.archived=0
  ), notes AS (
   SELECT id AS task_id,title,'legacy' AS note_id,json_extract(body,'$.legacyNoteDate') AS date,1 AS legacy,substr(notes,1,220) AS excerpt
   FROM project_tasks WHERE length(trim(notes))>0
   UNION ALL
   SELECT t.id,t.title,json_extract(n.value,'$.id'),json_extract(n.value,'$.createdAt'),0,substr(json_extract(n.value,'$.text'),1,220)
   FROM project_tasks t JOIN json_each(t.body,'$.taskNotes') n
  )
  SELECT * FROM notes ORDER BY date DESC,task_id,note_id LIMIT ?3`).bind(owner,projectId,size+1).all()).results;
  return {items:rows.slice(0,size),has_more:rows.length>size};
 }
 return {document,projectTaskNotes,validateDocument,backup,validateBackup,write,documents:async()=> (await db.prepare("SELECT * FROM workspace_documents WHERE owner_id=?1 AND kind='template' ORDER BY id").bind(owner).all()).results.map(r=>({...r,body:JSON.parse(r.body)})),revision:async()=> (await db.prepare('SELECT COALESCE(MAX(seq),0) AS cursor FROM audit_events WHERE owner_id=?1').bind(owner).first()).cursor,recoveries:async()=> (await db.prepare('SELECT id,created_at FROM workspace_recovery WHERE owner_id=?1 ORDER BY created_at DESC LIMIT 10').bind(owner).all()).results,recovery:async id=>{const r=await db.prepare('SELECT snapshot FROM workspace_recovery WHERE owner_id=?1 AND id=?2').bind(owner,id).first();if(!r)throw Error('Recovery not found.');return JSON.parse(r.snapshot);}};
}
