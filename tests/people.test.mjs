import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
import {dueCatchUp} from '../people.mjs';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0012-people.sql',import.meta.url),'utf8');
const day='2026-11-17';

function setup(t,sql=schema) {
  const db=sqliteAdapter(':memory:');
  db.exec(sql);
  t.after(()=>db.close());
  const service=workspace(db,'owner',{today:()=>day});
  const write=(kind,input,operation_id=crypto.randomUUID())=>service.write(kind,input,operation_id,'test');
  const record=async(...args)=>(await write(...args)).record;
  const add=(name,changes={})=>record('create_person',{changes:{name,type:'Internal',...changes}});
  return {db,service,write,record,add};
}

test('People migration preserves legacy task text and backup shape, and creates empty tables',async t=>{
  const legacy=schema.slice(0,schema.indexOf('CREATE TABLE IF NOT EXISTS people('));
  const {db,service,record,add}=setup(t,legacy);
  db.prepare(`INSERT INTO tasks(id,owner_id,title,action_status,done,assignee,waiting_on,updated_at)
    VALUES('old-task','owner','Legacy work','Waiting',0,'Legacy owner','Legacy dependency','2026-11-16')`).run();
  const before=await db.prepare('SELECT * FROM tasks').first();
  db.exec(migration);
  db.exec(migration);
  assert.deepEqual(await db.prepare('SELECT * FROM tasks').first(),before);
  assert.deepEqual((await service.people.find()).items,[]);
  const backup=await service.tools.backup();
  const person=await add('Fictional contact');
  await record('link_task_person',{task_id:'old-task',role:'assignee',person_id:person.id,expected_version:1});
  await record('restore_backup',{backup,expected_cursor:await service.tools.revision()});
  const task=await service.getTask('old-task');
  assert.equal(task.assignee,before.assignee);
  assert.equal(task.waiting_on,before.waiting_on);
  assert.equal(task.assignee_person_id,person.id);
  assert.equal((await service.tools.backup()).data.people,undefined);
});

test('People validates work record shape, owner links, pagination, versions, archive and atomic retries',async t=>{
  const {db,service,write,record,add}=setup(t);
  const foreign=workspace(db,'foreign');
  const otherProject=(await foreign.write('create_project',{name:'Foreign project'},crypto.randomUUID(),'test')).record;
  const project=await record('create_project',{name:'Fictional project'});
  await assert.rejects(add('Invalid',{project_ids:[otherProject.id]}),/Project not found/);
  await assert.rejects(add('Invalid',{next_touchpoint_date:'2026-02-30'}));
  await assert.rejects(add('Invalid',{keep_warm_weeks:0}));
  await assert.rejects(add('Invalid',{type:'Unknown'}));
  await assert.rejects(add('Invalid',{home_address:'Disallowed field'}));
  const op=crypto.randomUUID(),input={changes:{name:'Avery Sample',type:'Internal',role:'Lead',relationship:'Sponsor',influence:'High',project_ids:[project.id,project.id]}};
  const [a,b]=await Promise.all([write('create_person',input,op),write('create_person',input,op)]);
  assert.deepEqual(a,b);
  const first=a.record;
  assert.deepEqual(first.project_ids,[project.id]);
  assert.equal(first.created_at,first.updated_at);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE operation_id=?').bind(op).first()).n,1);
  await assert.rejects(write('create_person',{changes:{...input.changes,name:'Different'}},op),/different changes/);
  const second=await add('Bailey Sample',{influence:'Low'});
  const one=await service.people.find({query:'SAMPLE',limit:1});
  assert.equal(one.next_after_id,first.id);
  assert.equal((await service.people.find({query:'sample',limit:1,after_id:one.next_after_id})).items[0].id,second.id);
  assert.equal((await service.people.find({type:'Internal',influence:'High',relationship:'Sponsor',project_id:project.id})).items[0].id,first.id);
  await assert.rejects(foreign.people.get({person_id:first.id}),/Person not found/);
  const edits=await Promise.allSettled(['One','Two'].map(role=>record('update_person',{person_id:first.id,expected_version:1,changes:{role}})));
  assert.equal(edits.filter(result=>result.status==='fulfilled').length,1);
  assert.match(edits.find(result=>result.status==='rejected').reason.message,/Conflict/);
  await record('update_person',{person_id:first.id,expected_version:2,changes:{archived:true}});
  assert.equal((await service.people.find({archived:true})).items[0].id,first.id);
  assert.deepEqual((await service.people.find()).items.map(p=>p.id),[second.id]);
  assert.equal((await service.people.get({person_id:first.id})).person.version,3);
});

test('Task links coexist with free text, follow task versions and can be cleared independently',async t=>{
  const {service,record,add}=setup(t);
  const p=await add('Fictional assignable person');
  const task=await record('create_task',{changes:{title:'Task with link',assignee:'Existing owner',waiting_on:'Existing dependency',assignee_person_id:p.id}});
  await record('link_task_person',{task_id:task.id,expected_version:1,role:'waiting_on',person_id:p.id});
  await assert.rejects(record('link_task_person',{task_id:task.id,expected_version:1,role:'waiting_on',person_id:null}),/Conflict/);
  const linked=await service.getTask(task.id);
  assert.equal(linked.assignee_person_id,p.id);
  assert.equal(linked.waiting_on_person_id,p.id);
  assert.equal(linked.assignee,'Existing owner');
  assert.equal(linked.waiting_on,'Existing dependency');
  assert.equal((await service.findTasks({view:'all'})).tasks[0].waiting_on_person_id,p.id);
  assert.deepEqual((await service.people.get({person_id:p.id})).open_tasks[0].roles,['assignee','waiting_on']);
  await record('link_task_person',{task_id:task.id,expected_version:2,role:'waiting_on',person_id:null});
  assert.deepEqual((await service.people.get({person_id:p.id})).open_tasks[0].roles,['assignee']);
  const todo=await record('create_todo',{changes:{title:'Repeat work',due_date:day,assignee_person_id:p.id},repeat:{frequency:'weekly'}});
  await record('update_task',{task_id:todo.id,expected_version:1,changes:{done:true}});
  const next=(await service.getTask(todo.id)).todo.next_task_id;
  assert.equal((await service.getTask(next)).assignee_person_id,p.id);
  await record('update_task',{task_id:task.id,expected_version:3,changes:{archived:true}});
  assert.deepEqual((await service.people.get({person_id:p.id})).open_tasks.map(t=>t.id),[next]);
  await record('update_person',{person_id:p.id,expected_version:1,changes:{archived:true}});
  await assert.rejects(record('link_task_person',{task_id:next,expected_version:1,role:'waiting_on',person_id:p.id}),/active person/);
  const edits=await record('update_task',{task_id:next,expected_version:1,changes:{title:'Edit still works'}});
  assert.equal(edits.assignee_person_id,p.id);
});

test('Catch-up uses the UK calendar, a strict elapsed interval and active logged or derived interactions',async t=>{
  const {db,service,record,write,add}=setup(t);
  assert.equal(dueCatchUp({keep_warm_weeks:1},'2026-11-10',day),false);
  assert.equal(dueCatchUp({keep_warm_weeks:1},'2026-11-09',day),true);
  assert.equal(dueCatchUp({keep_warm_weeks:1},null,day),false);
  assert.equal(dueCatchUp({next_touchpoint_date:day},null,day),true);
  assert.equal(dueCatchUp({next_touchpoint_date:day,archived:true},null,day),false);
  const p=await add('Fictional Avery',{keep_warm_weeks:1});
  const b=await add('Fictional Bailey',{next_touchpoint_date:day});
  const c=await add('Fictional Casey',{keep_warm_weeks:1});
  const historical=await record('log_interaction',{person_id:p.id,changes:{date:'2026-11-02',summary:'Planning call',channel:'Call',i_owe_them:'Send draft'}});
  await assert.rejects(record('log_interaction',{person_id:p.id,changes:{date:day,summary:'First line\nSecond line',channel:'Call'}}));
  await record('log_interaction',{person_id:p.id,changes:{date:'2026-11-19',summary:'Future check-in',channel:'Call'}});
  const due=async()=>(await service.people.find({due_catch_up:true})).items.map(p=>p.id);
  assert.deepEqual(await due(),[p.id,b.id]);
  const book=await record('save_note_folder',{kind:'notebook',title:'Work notes'});
  const section=await record('save_note_folder',{kind:'section',parent_id:book.id,title:'Journal'});
  const doc={type:'doc',content:[
    {type:'meetingMeta',attrs:{meeting_id:'meeting-1',topic:'Planning review',participants:' fictional  AVERY; No match, Fictional Avery',when:'2026-11-16T00:15',timezone:'Europe/Rome'}},
    {type:'paragraph'}
  ]};
  const page=await record('save_note',{section_id:section.id,title:'November meetings',doc});
  const [meeting]=await service.people.decorateMeetings((await service.notes.searchMeetings()).items);
  assert.deepEqual(meeting.people_participants.map(p=>p.person_id),[p.id,null]);
  assert.deepEqual(await due(),[b.id]);
  const link={meeting_id:'meeting-1',expected_version:1,expected_link_version:0,participant:'No match',person_id:c.id};
  const op=crypto.randomUUID();
  const linkResult=await write('link_meeting_person',link,op);
  assert.deepEqual(await write('link_meeting_person',link,op),linkResult);
  const linkAudit=(await service.changes()).changes.find(event=>event.action==='link_meeting_person');
  assert.equal(linkAudit.entity_id,'meeting-1');
  await assert.rejects(write('link_meeting_person',{...link,person_id:b.id}),/participant link changed/);
  const profile=await service.people.get({person_id:p.id,limit:1,offset:1});
  assert.equal(profile.interactions[0].source,'meeting');
  assert.equal(profile.interactions[0].date,'2026-11-15');
  assert.equal(profile.next_offset,2);
  assert.equal(profile.commitments[0].i_owe_them,'Send draft');
  assert.equal((await service.people.get({person_id:c.id})).interactions[0].summary,'Planning review');
  assert.equal((await service.people.get({person_id:c.id},{connector:true})).interactions[0].summary,'Meeting Journal entry');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM people_interactions').first()).n,2);
  await record('save_note',{id:page.id,expected_version:1,archived:true});
  await assert.rejects(record('link_meeting_person',link),/Conflict/);
  assert.deepEqual((await service.people.get({person_id:c.id})).interactions,[]);
  assert.deepEqual(await due(),[p.id,b.id]);
  await record('update_interaction',{interaction_id:historical.id,expected_version:1,changes:{archived:true}});
  assert.deepEqual(await due(),[b.id]);
  assert.equal((await service.people.get({person_id:p.id})).commitments.length,0);
});
