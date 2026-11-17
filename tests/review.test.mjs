import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
test('a lost acknowledgement retains the same write ID until the result is received',()=>{
 const RetryWrites=vm.runInNewContext(readFileSync(new URL('../retry-writes.js',import.meta.url),'utf8')+'\nRetryWrites');
 const cache=new RetryWrites();
 const a=cache.prepare({kind:'create_task',input:{changes:{title:'Connection loss test'}},operation_id:'first-attempt'});
 const b=cache.prepare({kind:'create_task',input:{changes:{title:'Connection loss test'}},operation_id:'retry-attempt'});
 assert.equal(b.body.operation_id,a.body.operation_id);
 const changed=cache.prepare({kind:'create_task',input:{changes:{title:'Different task'}},operation_id:'changed-attempt'});assert.equal(changed.body.operation_id,'changed-attempt');
 cache.acknowledge(a.key);
 assert.equal(cache.prepare({kind:'create_task',input:{changes:{title:'Connection loss test'}},operation_id:'new-task'}).body.operation_id,'new-task');
});
test('review: atomic My Day creation, date order, future starts and safe archival',async()=>{
 const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const s=workspace(db,'owner',{today:()=> '2030-01-02'});
 try{
  const p=(await s.write('create_project',{name:'Review project'},'review-project-1','test')).record;
  const a=(await s.write('create_task',{changes:{title:'Create and focus',project_id:p.id},add_to_my_day:true},'review-focus-create','test')).record;
  assert.ok((await s.focus()).includes(a.id));
  await assert.rejects(()=>s.write('create_task',{changes:{title:'Impossible dates',start_date:'2030-02-02',due_date:'2030-02-01'}},'review-invalid-dates','test'),/start date/i);
  const future=(await s.write('create_task',{changes:{title:'Not ready to start',project_id:p.id,start_date:'2030-01-03'}},'review-future-start','test')).record;
  assert.ok(!(await s.findTasks({view:'next'})).tasks.some(t=>t.id===future.id));
  await s.write('create_task',{changes:{title:'Overdue in Rome',project_id:p.id,due_date:'2030-01-01'}},'review-overdue','test');
  assert.equal((await s.summary()).overdue,1);
  const milestone=(await s.write('create_task',{changes:{title:'Referenced milestone',project_id:p.id,item_type:'Milestone'}},'review-milestone','test')).record;
  await s.write('update_task',{task_id:a.id,expected_version:1,changes:{milestone_id:milestone.id}},'review-link-milestone','test');
  await assert.rejects(()=>s.write('update_task',{task_id:milestone.id,expected_version:1,changes:{archived:true}},'review-archive-linked','test'),/linked|depend/i);
  const x=(await s.write('create_task',{changes:{title:'Unassigned one'}},'review-unassigned-1','test')).record;
  const y=(await s.write('create_task',{changes:{title:'Unassigned two'}},'review-unassigned-2','test')).record;
  await assert.rejects(()=>s.write('link_dependency',{task_id:x.id,prerequisite_id:y.id},'review-unassigned-link','test'),/project/i);
 }finally{db.close();}
});
test('actual browser request wrapper safely retries lost responses and captures edits on expired read requests',async()=>{
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const retry=readFileSync(new URL('../retry-writes.js',import.meta.url),'utf8');
 const api=src.slice(src.indexOf('async function api('),src.indexOf('const esc='));
 const sent=[];let attempt=0,captured=0,signedIn=0;
 const context=vm.createContext({sessionStorage:{getItem:()=>null,removeItem:()=>{}},location:{protocol:'http:'},fetch:async(url,options)=>{sent.push(JSON.parse(options.body));if(++attempt===1)throw Error('Connection lost after request');return {status:200,ok:true,json:async()=>({saved:true})};},captureDraft:()=>{captured++;return true;},startSignIn:async()=>{signedIn++;},Error});
 vm.runInContext(retry+'\nconst writeAttempts=new RetryWrites();\n'+api,context);
 const call=body=>vm.runInContext('api("/api/write",'+JSON.stringify(body)+')',context);
 await assert.rejects(()=>call({kind:'create_task',input:{changes:{title:'Synthetic'}},operation_id:'network-first'}),/Connection lost/);
 await call({kind:'create_task',input:{changes:{title:'Synthetic'}},operation_id:'network-retry'});
 assert.equal(sent[0].operation_id,sent[1].operation_id);
 context.location.protocol='https:';context.fetch=async()=>({status:401,ok:false,json:async()=>({error:'Expired'})});
 await assert.rejects(()=>vm.runInContext('api("/api/projects")',context),/Opening secure/);
 assert.equal(captured,1);assert.equal(signedIn,1);
});
test('actual browser draft capture restores notes without writing, checks versions and clears tab storage',async()=>{
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const functions=src.slice(src.indexOf('const draftFields='),src.indexOf("$('reconnect').onclick="));
 const storage=new Map(),elements={};
 const ids=['editor','todoEditor','title','editProject','stream','type','status','priority','due','follow','start','assignee','waiting','assigneePerson','waitingPerson','department','notes','milestone','project','query','editError'];
 for(const id of ids)elements[id]={value:'',open:false,textContent:''};
 elements.editor.open=true;elements.title.value='Unsaved title';elements.notes.value='Keep <notes> & details';
 const state={current:{id:'task-1',version:3},view:'plan'};let writes=0;
 const context=vm.createContext({refreshFormState:()=>{},state,$:id=>elements[id],document:{getElementById:()=>null},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},writeAttempts:{prepare:()=>{}},render:()=>{},projectFields:async()=>{},edit:async()=>{state.current={id:'task-1',version:4};return true;},editTodo:async()=>true,announce:()=>{},api:()=>{writes++;throw Error('No automatic writes allowed');},Date,Number,JSON,Error});
 vm.runInContext(functions,context);
 assert.equal(vm.runInContext('captureDraft({kind:"update_task",operation_id:"draft-operation"})',context),true);
 elements.title.value='';elements.notes.value='';
 await vm.runInContext('restoreDraft()',context);
 assert.equal(elements.title.value,'Unsaved title');assert.equal(elements.notes.value,'Keep <notes> & details');
 assert.equal(state.current.version,3);assert.match(elements.editError.textContent,/changed during sign-in/);
 assert.equal(storage.has('workspace.draft'),false);assert.equal(writes,0);
});
test('temporary token renewal failures keep the credential for a retry',async()=>{
 const source=readFileSync(new URL('../ux.js',import.meta.url),'utf8');
 const renewal=source.slice(source.indexOf('let sessionRenewal='),source.indexOf('function linkRowHTML'));
 const storage=new Map([['workspace.refresh','first-refresh'],['workspace.client','test-client']]);
 const context=vm.createContext({
  location:{origin:'https://workspace.example'},URLSearchParams,
  sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  fetch:async()=>new Response('Unavailable',{status:503})
 });
 vm.runInContext(renewal,context);
 const refresh=()=>vm.runInContext('refreshSession()',context);
 await assert.rejects(refresh,/temporarily unavailable/);
 assert.equal(storage.get('workspace.refresh'),'first-refresh');
 context.fetch=async()=>Response.json({access_token:'new-access',refresh_token:'new-refresh'});
 assert.equal(await refresh(),true);
 assert.equal(storage.get('workspace.refresh'),'new-refresh');
 context.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
 assert.equal(await refresh(),false);
 assert.equal(storage.has('workspace.refresh'),false);
});
test('promoting one occurrence keeps the routine running with its original title',async()=>{
 const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'owner');
 try{
  const p=(await s.write('create_project',{name:'Exceptional work'},'review-promote-project','test')).record;
  const t=(await s.write('create_todo',{changes:{title:'Monthly report',due_date:'2030-01-05'},repeat:{frequency:'monthly'}},'review-promote-todo','test')).record;
  await s.write('update_todo',{task_id:t.id,expected_version:1,changes:{title:'Investigate report exception',project_id:p.id}},'review-promote-move','test');
  const current=await s.getTask(t.id),next=await s.getTask(current.todo.next_task_id);
  assert.equal(next.title,'Monthly report');assert.equal(next.due_date,'2030-02-05');assert.equal(next.project_id,null);
  await s.write('update_task',{task_id:t.id,expected_version:2,changes:{done:true}},'review-promote-done','test');
  await s.write('update_task',{task_id:t.id,expected_version:3,changes:{done:false}},'review-promote-reopen','test');
  assert.equal((await s.todos()).length,2,'Reopening a project exception must not duplicate the routine');
 }finally{db.close();}
});
test('a repeat-metadata failure does not block the project dashboard',async()=>{
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const load=src.slice(src.indexOf('let loadGeneration='),src.indexOf('async function loadProjects('));
 let rendered=false,message='';const state={};
 const context=vm.createContext({collectRisks:async()=>[],collectTodos:async()=>{throw Error('Temporary metadata failure');},state,Promise,Array,URLSearchParams,Error,api:async url=>{if(url==='/api/todos')throw Error('Temporary metadata failure');if(url==='/api/focus')return [];return {tasks:url.includes('view=all')?[{id:'project-task'}]:[],has_more:false};},render:()=>{rendered=true;},announce:text=>{message=text;}});
 vm.runInContext(load,context);await vm.runInContext('load()',context);
 assert.equal(rendered,true);assert.equal(state.rows.length,1);assert.equal(state.todoMeta.length,0);assert.match(message,/repeat details could not load/);
});
