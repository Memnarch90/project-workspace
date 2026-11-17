import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
const setup=()=>{const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'delete-qa');return {db,s,write:(kind,input,op=crypto.randomUUID())=>s.write(kind,input,op,'test')};};

test('Recoverable task/To Do deletion preserves completion, details, focus and repeat history',async()=>{
 const {db,s,write}=setup();try{
  const project=(await write('create_project',{name:'Delete QA'})).record;
  const regular=(await write('create_task',{changes:{title:'Regular task',project_id:project.id,notes:'Keep these notes',action_status:'In Progress'}})).record;
  const repeating=(await write('create_todo',{changes:{title:'Repeating To Do',due_date:'2026-11-10',notes:'Keep repeat notes'},repeat:{frequency:'daily'}})).record;
  const completed=(await write('create_task',{changes:{title:'Already completed',project_id:project.id,done:true}})).record;
  for(const t of [regular,repeating,completed]){
   await write('set_focus',{task_id:t.id,selected:true});
   await write('save_document',{id:t.id,kind:'task',expected_version:0,body:{checklist:[{id:'step',text:'Retained step',done:false}],links:[],paused:t.id===repeating.id}});
   const before=await s.getTask(t.id),snapshot=await s.tools.backup(),operation=crypto.randomUUID();
   const input={task_id:t.id,expected_version:before.version,changes:{archived:true}};
   const removed=await write('update_task',input,operation);assert.deepEqual(await write('update_task',input,operation),removed);
   const hidden=await s.getTask(t.id);assert.equal(hidden.archived,true);assert.equal(hidden.done,before.done);assert.equal(hidden.action_status,before.action_status);assert.equal(hidden.completed_on,before.completed_on);assert.equal(hidden.notes,before.notes);assert.deepEqual(hidden.todo,before.todo);assert.deepEqual(hidden.details,before.details);
   assert.equal((await s.findTasks({view:'all'})).tasks.some(x=>x.id===t.id),false);assert.equal((await s.focus()).includes(t.id),false);assert.equal((await s.tools.backup()).data.tasks.length,snapshot.data.tasks.length);
   await write('update_task',{task_id:t.id,expected_version:hidden.version,changes:{archived:false}});const restored=await s.getTask(t.id);assert.equal(restored.archived,false);assert.equal(restored.done,before.done);assert.deepEqual(restored.todo,before.todo);assert.deepEqual(restored.details,before.details);assert.ok((await s.focus()).includes(t.id));
  }
 }finally{db.close();}
});

test('Deletion rejects stale versions and active prerequisite links without altering either task',async()=>{
 const {db,s,write}=setup();try{const project=(await write('create_project',{name:'Linked QA'})).record;
  const a=(await write('create_task',{changes:{title:'Prerequisite',project_id:project.id}})).record,b=(await write('create_task',{changes:{title:'Dependent',project_id:project.id}})).record;
  await write('link_dependency',{task_id:b.id,prerequisite_id:a.id});const before=await s.getTask(a.id);
  await assert.rejects(()=>write('update_task',{task_id:a.id,expected_version:before.version,changes:{archived:true}}),/depend/);assert.deepEqual(await s.getTask(a.id),before);
  await write('update_task',{task_id:b.id,expected_version:b.version,changes:{notes:'Concurrent edit'}});
  await assert.rejects(()=>write('update_task',{task_id:b.id,expected_version:b.version,changes:{archived:true}}),/Conflict/);assert.equal((await s.getTask(b.id)).archived,false);assert.equal((await s.getTask(b.id)).notes,'Concurrent edit');
 }finally{db.close();}
});
