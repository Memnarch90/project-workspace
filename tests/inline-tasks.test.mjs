import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
const setup=()=>{const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'inline-qa');return {db,s,w:(kind,input,op=crypto.randomUUID())=>s.write(kind,input,op,'test')};};
test('Quick title, due date and status patches retain task context, details and focus',async()=>{
 const {db,s,w}=setup();try{
  const project=(await w('create_project',{name:'Fictional inline project'})).record;
  const task=(await w('create_task',{changes:{title:'Original',project_id:project.id,start_date:'2026-11-10',due_date:'2026-11-20',priority:'High',assignee:'Fictional owner',notes:'Retain original notes'}})).record;
  await w('save_document',{id:task.id,kind:'task',expected_version:0,body:{checklist:[{id:'step',text:'Preserved',done:false}],links:[],paused:false}});await w('set_focus',{task_id:task.id,selected:true});
  for(const changes of [{title:'Renamed'},{due_date:'2026-11-25'},{action_status:'Waiting'},{due_date:null}]){
   const before=await s.getTask(task.id);await w('update_task',{task_id:task.id,expected_version:before.version,changes});const after=await s.getTask(task.id);
   for(const key of ['project_id','start_date','priority','assignee','notes','details','todo'])assert.deepEqual(after[key],before[key],key);
   for(const [key,value]of Object.entries(changes))assert.equal(after[key],value);assert.ok((await s.focus()).includes(task.id));
  }
  const before=await s.getTask(task.id);await assert.rejects(w('update_task',{task_id:task.id,expected_version:before.version,changes:{due_date:'2026-11-01'}}),/start date/);assert.deepEqual(await s.getTask(task.id),before);
 }finally{db.close();}
});
test('Quick status completion is repeat-safe and preserves recurrence safeguards',async()=>{
 const {db,s,w}=setup();try{
  const task=(await w('create_todo',{changes:{title:'Routine',due_date:'2026-11-10'},repeat:{frequency:'daily'}})).record;
  await w('update_task',{task_id:task.id,expected_version:1,changes:{title:'Renamed routine'}});const before=await s.getTask(task.id);
  const input={task_id:task.id,expected_version:before.version,changes:{action_status:'Completed'}},op=crypto.randomUUID();const saved=await w('update_task',input,op);assert.deepEqual(await w('update_task',input,op),saved);
  const done=await s.getTask(task.id);assert.equal(done.done,true);assert.equal((await s.findTasks({view:'all'})).tasks.length,2);assert.ok(done.todo.next_task_id);
  await assert.rejects(w('update_task',{task_id:task.id,expected_version:done.version,changes:{action_status:'Not Started'}}),/next repeating task/);
  const next=await s.getTask(done.todo.next_task_id);await assert.rejects(w('update_task',{task_id:next.id,expected_version:next.version,changes:{due_date:null}}),/need a due date/);
  await assert.rejects(w('update_task',{task_id:task.id,expected_version:1,changes:{title:'Stale'}}),/Conflict/);
 }finally{db.close();}
});
test('Completion feedback creates no persistent bar or completion announcement',()=>{
 const source=readFileSync(new URL('../ux.js',import.meta.url),'utf8'),from=source.indexOf('function completionFeedback('),to=source.indexOf('\n',from),calls=[];
 const context=vm.createContext({offerUndo:()=>calls.push('bar'),announce:()=>calls.push('notice')});vm.runInContext(source.slice(from,to),context);context.completionFeedback({},true);context.completionFeedback({},false);assert.deepEqual(calls,[]);
});

test('Dated task notes survive checklist changes and backups, with no connector, audit or recurrence copy',async()=>{
 const {db,s,w}=setup();try{
  const task=(await w('create_todo',{changes:{title:'Daily check',notes:'Original instructions',due_date:'2026-11-10'},repeat:{frequency:'daily'}})).record;
  const params={id:task.id,note_id:'first',edit:false,expected_version:0,text:'Private dated entry'};
  const operation=crypto.randomUUID();
  const created=await w('save_task_note',params,operation);
  assert.deepEqual(await w('save_task_note',params,operation),created);
  await w('save_document',{id:task.id,kind:'task',expected_version:1,body:{checklist:[{id:'check',text:'Check results',done:true}]}});
  await assert.rejects(w('save_task_note',{...params,edit:true,expected_version:1}),/Conflict/);
  await w('save_task_note',{...params,edit:true,expected_version:2,text:'Updated private entry'});
  const visible=await s.tools.document(task.id,true);
  const note=visible.body.taskNotes[0];
  assert.equal(note.createdAt,created.record.note.createdAt);
  assert.ok(note.editedAt);
  assert.equal(note.text,'Updated private entry');
  assert.ok(visible.body.checklist[0].done);
  assert.equal((await s.getTask(task.id)).details.body.taskNotes,undefined);
  assert.doesNotMatch(JSON.stringify(await s.audit(task.id)),/private entry|Private dated entry/);
  assert.doesNotMatch(JSON.stringify(await s.exportPlan()),/private entry/);
  const backup=await s.tools.backup();
  assert.equal(JSON.parse(backup.data.workspace_documents[0].body).taskNotes[0].text,note.text);
  await s.tools.validateBackup(backup);
  await w('update_task',{task_id:task.id,expected_version:task.version,changes:{done:true}});
  const completed=await s.getTask(task.id);
  const successor=await s.tools.document(completed.todo.next_task_id,true);
  assert.equal(successor.body.taskNotes,undefined);
  assert.equal(successor.body.checklist[0].done,false);
  assert.equal((await s.getTask(completed.todo.next_task_id)).notes,'Original instructions');
 }finally{db.close();}
});
