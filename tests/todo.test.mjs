import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
import {nextOccurrence} from '../recurrence.mjs';
test('repeat dates preserve month-end anchors and distinguish calendar from completion',()=>{
 const rule={frequency:'monthly',interval:1,basis:'scheduled',anchor_day:31};
 assert.equal(nextOccurrence(rule,'2026-01-31'),'2026-02-28');
 assert.equal(nextOccurrence(rule,'2026-02-28'),'2026-03-31');
 assert.equal(nextOccurrence({...rule,basis:'completed'},'2026-01-31','2026-02-07'),'2026-03-07');
 assert.equal(nextOccurrence({...rule,frequency:'weekly',interval:2},'2026-12-28'),'2027-01-11');
});
test('To do repeats atomically, preserves history, excludes project totals and moves the same record',async()=>{
 const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'owner');
 try{
  const input={changes:{title:'Monthly reporting',due_date:'2026-01-31',notes:'Synthetic notes'},repeat:{frequency:'monthly'}};
  const first=(await s.write('create_todo',input,'todo-create-0001','test')).record;
  assert.equal(first.assignee,'Unassigned');
  assert.equal((await s.summary()).tasks,0);
  assert.equal((await s.findTasks({view:'all'})).tasks[0].is_todo,1);
  await s.write('update_task',{task_id:first.id,expected_version:1,changes:{done:true}},'todo-complete-0001','test');
  await s.write('update_task',{task_id:first.id,expected_version:1,changes:{done:true}},'todo-complete-0001','test');
  const second=await s.getTask((await s.getTask(first.id)).todo.next_task_id);
  assert.equal(second.due_date,'2026-02-28');assert.equal(second.done,false);
  assert.equal(second.assignee,first.assignee);
  assert.equal((await s.todos()).length,2);assert.equal((await s.getTask(first.id)).done,true);
  await assert.rejects(()=>s.write('update_task',{task_id:first.id,expected_version:2,changes:{done:false}},'todo-reopen-0001','test'),/next repeating/);
  const p=(await s.write('create_project',{name:'Reporting improvement'},'todo-project-0001','test')).record;
  await s.write('update_todo',{task_id:second.id,expected_version:1,changes:{project_id:p.id}},'todo-promote-0001','test');
  assert.equal((await s.getTask(second.id)).id,second.id);assert.equal((await s.summary(p.id)).tasks,1);
  await s.write('update_task',{task_id:second.id,expected_version:2,changes:{done:true}},'todo-complete-0002','test');
  const third=await s.getTask((await s.getTask(second.id)).todo.next_task_id);
  assert.equal(third.due_date,'2026-03-31');assert.equal(third.project_id,null);assert.equal(third.todo.is_general,1);
  await s.write('update_todo',{task_id:third.id,expected_version:1,changes:{title:third.title},repeat:{frequency:'none'}},'todo-stop-repeat','test');
  await s.write('update_task',{task_id:third.id,expected_version:2,changes:{done:true}},'todo-finish-last','test');
  assert.equal((await s.todos()).length,3);assert.deepEqual(await workspace(db,'intruder').todos(),[]);
  await assert.rejects(()=>workspace(db,'intruder').write('update_todo',{task_id:third.id,expected_version:3,changes:{title:'X'}},'todo-cross-owner','test'),/not found/);
  assert.ok((await s.audit(second.id)).some(e=>e.action==='repeat_created'));
  assert.equal((await s.exportPlan()).length,1);
 }finally{db.close();}
});
