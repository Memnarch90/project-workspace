import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
function fixture(){const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));return {db,s:workspace(db,'owner',{today:()=> '2026-11-07'})};}
let op=0;const write=(s,k,input)=>s.write(k,input,'tools-test-'+(++op),'test');
const details={checklist:[{id:'step1',text:'Check report',done:true}],links:[{title:'Reference',url:'https://example.com/report'}]};
test('checklists, template validation, isolated owners and routine pause / resume / skip',async()=>{const {db,s}=fixture();try{
 const t=(await write(s,'create_todo',{changes:{title:'Monthly report',due_date:'2026-11-30'},repeat:{frequency:'monthly'},details})).record;
 const doc=await s.tools.document(t.id);assert.equal(doc.body.checklist[0].done,true);
 await write(s,'save_document',{id:t.id,kind:'task',expected_version:1,body:{...doc.body,paused:true}});
 await assert.rejects(()=>write(s,'update_task',{task_id:t.id,expected_version:1,changes:{done:true}}),/Resume/);
 await assert.rejects(()=>write(s,'skip_todo',{task_id:t.id,expected_version:1}),/Resume/);
 await assert.rejects(()=>write(s,'save_document',{id:t.id,kind:'task',expected_version:1,body:details}),/Conflict/);
 await write(s,'save_document',{id:t.id,kind:'task',expected_version:2,body:{...details,paused:false}});
 await s.write('skip_todo',{task_id:t.id,expected_version:1},'tools-fixed-skip','test');
 await s.write('skip_todo',{task_id:t.id,expected_version:1},'tools-fixed-skip','test');
 const done=await s.getTask(t.id),next=await s.getTask(done.todo.next_task_id);assert.equal(next.due_date,'2026-12-30');assert.equal((await s.tools.document(t.id)).body.skipped,true);assert.equal((await s.tools.document(next.id)).body.checklist[0].done,false);
 assert.equal((await s.todos()).length,2);assert.equal(await workspace(db,'other').tools.document(t.id),null);
 await assert.rejects(()=>write(workspace(db,'other'),'save_document',{id:t.id,kind:'task',expected_version:0,body:details}),/not found/);
 await assert.rejects(()=>write(s,'save_document',{id:'bad-link',kind:'template',expected_version:0,body:{title:'Bad',links:[{title:'x',url:'javascript:alert(1)'}]}}),/web link/);
 const template=(await write(s,'save_document',{id:'template1',kind:'template',expected_version:0,body:{title:'Report template',...details}})).record;assert.equal(template.body.checklist[0].done,false);assert.equal((await s.tools.documents()).length,1);
 }finally{db.close();}});
test('backup restore is atomic, recoverable, version-safe and rejects damage / stale previews',async()=>{const {db,s}=fixture();try{
 const p=(await write(s,'create_project',{name:'Project'})).record;
 const m=(await write(s,'create_task',{changes:{title:'Milestone',project_id:p.id,item_type:'Milestone'}})).record;
 const t=(await write(s,'create_task',{changes:{title:'Original',project_id:p.id,milestone_id:m.id},details})).record;
 await write(s,'link_dependency',{task_id:t.id,prerequisite_id:m.id});
 await write(s,'update_project',{project_id:p.id,expected_version:1,changes:{information:{purpose:'Original fictional purpose'}}});
 const b=await s.tools.backup();assert.equal((await s.tools.validateBackup(b)).tasks,2);
 await write(s,'update_project',{project_id:p.id,expected_version:2,changes:{information:{purpose:'Revised purpose'}}});
 await write(s,'update_task',{task_id:t.id,expected_version:1,changes:{title:'Edited'}});
 const newer=(await write(s,'create_todo',{changes:{title:'Newer task'}})).record;
 await assert.rejects(()=>write(s,'restore_backup',{backup:b,expected_cursor:b.cursor}),/Conflict/);
 const current=await s.tools.revision(),r=await s.write('restore_backup',{backup:b,expected_cursor:current},'tools-fixed-restore','test');
 assert.equal((await s.getTask(t.id)).title,'Original');assert.ok((await s.getTask(t.id)).version>2);assert.equal((await s.getTask(newer.id)).archived,true);assert.equal((await s.getTask(t.id)).dependencies.length,1);assert.equal((await s.tools.document(t.id)).body.checklist.length,1);
 assert.equal((await s.getProject(p.id)).information.purpose,'Original fictional purpose');
 assert.deepEqual(await s.write('restore_backup',{backup:b,expected_cursor:current},'tools-fixed-restore','test'),r);
 const recovery=await s.tools.recovery(r.record.recovery_id);assert.equal(recovery.data.tasks.find(x=>x.id===t.id).title,'Edited');assert.equal((await s.tools.recoveries()).length,1);
 await write(s,'restore_backup',{backup:recovery,expected_cursor:await s.tools.revision()});assert.equal((await s.getTask(newer.id)).archived,false);assert.equal((await s.getTask(t.id)).title,'Edited');
 assert.equal((await s.getProject(p.id)).information.purpose,'Revised purpose');
 const bad=structuredClone(b);bad.data.tasks[0].title='Tampered';await assert.rejects(async()=>write(s,'restore_backup',{backup:bad,expected_cursor:await s.tools.revision()}),/damaged/);
 await assert.rejects(()=>workspace(db,'other').tools.validateBackup(b),/owner/);
 }finally{db.close();}});
test('paginated routine metadata and history do not truncate long lists',async()=>{const {db,s}=fixture();try{
 for(let i=0;i<55;i++)await write(s,'create_todo',{changes:{title:'Task '+i}});
 const page=await s.todoPage();assert.equal(page.items.length,50);assert.equal(page.has_more,true);assert.equal((await s.todoPage(page.next_after_id)).items.length,5);
 const t=(await s.findTasks({view:'all'})).tasks[0];let version=1;for(let i=0;i<30;i++){await write(s,'update_task',{task_id:t.id,expected_version:version++,changes:{title:'Revision '+i}});}
 const history=await s.auditPage(t.id);assert.equal(history.items.length,25);assert.equal(history.has_more,true);assert.equal((await s.auditPage(t.id,history.next_before)).items.length,6);
 }finally{db.close();}});

import vm from 'node:vm';
test('background refresh respects open editors and unsaved quick capture',async()=>{const src=readFileSync(new URL('../workspace-ui.js',import.meta.url),'utf8');const fn=src.slice(src.indexOf('async function refreshIfChanged('),src.indexOf('function initWorkspaceTools('));let loaded=0,calls=0,open=false,title='';const state={busy:false};const c=vm.createContext({state,document:{hidden:false,querySelector:()=>open},$:()=>({elements:{title:{get value(){return title;}}}}),api:async()=>{calls++;return {cursor:2};},loadProjects:async()=>{},load:async()=>{loaded++;},announce:()=>{},signingIn:false});vm.runInContext('let refreshRunning=false,toolRevision=1;'+fn,c);await vm.runInContext('refreshIfChanged()',c);assert.equal(loaded,1);open=true;await vm.runInContext('refreshIfChanged()',c);assert.equal(calls,1);open=false;title='Unsaved capture';await vm.runInContext('refreshIfChanged()',c);assert.equal(calls,1);});
test('weekly export includes every matching item, ignores skipped work and uses UK completion dates',()=>{const src=readFileSync(new URL('../workspace-ui.js',import.meta.url),'utf8');const fn=src.slice(src.indexOf('function completionDay('),src.indexOf('function captureToolDraft('));const c=vm.createContext({state:{projects:[],streams:[]},activeWorkstream:()=>'',$:()=>({value:''}),today:()=> '2026-11-07',dateNumber:s=>Date.parse(s+'T00:00:00Z')/86400000,isoDay:n=>new Date(n*86400000).toISOString().slice(0,10),isOverdue:t=>!t.done&&t.due_date<'2026-11-07',Intl,Date});vm.runInContext(fn,c);c.rows=Array.from({length:61},(_,i)=>({title:'Report '+i,done:false,due_date:'2026-11-08',action_status:'Not Started'}));assert.match(vm.runInContext('weeklyText(rows)',c),/Report 60/);assert.equal(vm.runInContext("completionDay('2026-11-06T23:30:00Z')",c),'2026-11-06');});
