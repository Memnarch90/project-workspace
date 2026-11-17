import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
const source=readFileSync(new URL('../ux.js',import.meta.url),'utf8');
const extract=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
test('To Do ignores a previous project filter while My Day uses its own visible scope',()=>{const c=vm.createContext({});vm.runInContext(extract('function scopedRows(','function goView('),c);const rows=[{id:'g',project_id:null,title:'General report',assignee:'Alex'},{id:'p',project_id:'project1',title:'Project action'},{id:'q',project_id:'project2',title:'Other action'}];assert.equal(c.scopedRows(rows,'todo','project1','','').length,3,'Project filtering is ignored before the To Do-only filter');assert.equal(c.scopedRows(rows,'todo','project1','','report').length,1);assert.equal(c.scopedRows(rows,'day','project1','','').length,3);assert.equal(c.scopedRows(rows,'day','project1','project2','').length,1);assert.equal(c.scopedRows(rows,'plan','project1','','').length,1);});
test('Dashboard priorities do not turn undated tasks into overdue work or closed risks into current warnings',()=>{const c=vm.createContext({isoDay:n=>new Date(n*86400000).toISOString().slice(0,10),dateNumber:s=>Date.parse(s+'T00:00:00Z')/86400000});vm.runInContext(extract('function attentionData(','function dashboard('),c);const r=c.attentionData([{id:'a',done:false,due_date:null},{id:'b',done:false,due_date:'2026-11-07'},{id:'c',done:false,due_date:'2026-11-08'},{id:'d',done:false,due_date:'2026-11-01',paused:true},{id:'e',done:true,due_date:'2026-11-01'}],[{status:'Closed',severity:25},{status:'Open',severity:15},{status:'Open',severity:null}],'2026-11-08');assert.equal(r.overdue.length,1);assert.equal(r.dates.length,1);assert.equal(r.risks.length,1);});
test('Session renewal coalesces concurrent expired requests and keeps credentials in the tab',async()=>{const storage=new Map([['workspace.refresh','synthetic-refresh'],['workspace.client','synthetic-client']]);let calls=0;const c=vm.createContext({sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{origin:'https://workspace.example'},URLSearchParams,fetch:async()=>{calls++;await Promise.resolve();return {ok:true,json:async()=>({access_token:'synthetic-access',refresh_token:'synthetic-rotated'})};}});vm.runInContext(extract('let sessionRenewal=null;','function linkRowHTML('),c);const results=await Promise.all([c.refreshSession(),c.refreshSession(),c.refreshSession()]);assert.equal(calls,1);assert.ok(results.every(Boolean));assert.equal(storage.get('workspace.access'),'synthetic-access');assert.equal(storage.get('workspace.refresh'),'synthetic-rotated');});
test('Archived risks are recoverable and compact task reads include owner and waiting-on context',async()=>{const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'owner');try{const p=(await s.write('create_project',{name:'UX test'},'ux-project-0001','test')).record;const t=(await s.write('create_task',{changes:{title:'Task',project_id:p.id,assignee:'Synthetic Owner',waiting_on:'Synthetic Team'}},'ux-task-0001','test')).record;const rows=await s.findTasks({view:'all'});assert.equal(rows.tasks[0].assignee,'Synthetic Owner');assert.equal(rows.tasks[0].waiting_on,'Synthetic Team');const r=(await s.write('create_risk',{changes:{project_id:p.id,description:'Synthetic risk'}},'ux-risk-0001','test')).record;await s.write('update_risk',{risk_id:r.id,expected_version:1,changes:{archived:true}},'ux-risk-archive','test');assert.equal((await s.risks.list()).items.length,0);assert.equal((await s.risks.list({archived:'1'})).items.length,1);await s.write('update_risk',{risk_id:r.id,expected_version:2,changes:{archived:false}},'ux-risk-restore','test');assert.equal((await s.risks.list()).items.length,1);assert.equal((await s.risks.list({archived:'1'})).items.length,0);assert.equal((await s.getTask(t.id)).done,false);}finally{db.close();}});

test('Workstream scope separates task counts, retains project-wide risks and never hides general To Dos',()=>{
 const c=vm.createContext({});vm.runInContext(extract('function scopedRows(','function goView('),c);
 const rows=[{id:'a',project_id:'p',workstream_id:'s1'},{id:'b',project_id:'p',workstream_id:'s2'},{id:'c',project_id:'p',workstream_id:null},{id:'d',project_id:'q',workstream_id:'s3'}];
 for(const view of ['dashboard','plan','timeline','weekly','reminders','waiting','completed','next'])assert.deepEqual(Array.from(c.scopedRows(rows,view,'p','','','s1'),r=>r.id),['a']);
 assert.equal(c.scopedRows(rows,'todo','p','','','s1').length,4);
 assert.deepEqual(Array.from(c.scopedRows(rows,'plan','p','','','__general'),r=>r.id),['c']);
 const streams=[{id:'s1',project_id:'p'}];
 assert.equal(c.riskMatchesWorkstream({project_id:'p',workstream_id:null},'s1',streams),true);
 assert.equal(c.riskMatchesWorkstream({project_id:'q',workstream_id:null},'s1',streams),false);
 assert.equal(c.riskMatchesWorkstream({project_id:'p',workstream_id:'s2'},'s1',streams),false);
});

test('Completion dates use the UK calendar date and preserve unknown historical dates',()=>{
 const c=vm.createContext({Intl,Date});vm.runInContext(extract('function completionDate(','function showCompletionDate('),c);
 assert.equal(c.completionDate('2026-11-09T23:30:00Z'),'2026-11-09');
 assert.equal(c.completionDate('2026-07-09T23:30:00Z'),'2026-07-10');
 assert.equal(c.completionDate('2026-11-09'),'2026-11-09');
 assert.equal(c.completionDate(null),'');assert.equal(c.completionDate('bad'),'');
 const input={value:'',placeholder:''};c.$=()=>input;vm.runInContext(extract('function showCompletionDate(',"document.addEventListener('change',e=>{if(e.target.id==='status')"),c);
 c.showCompletionDate('field',{done:true,completed_on:null});assert.equal(input.value,'');assert.equal(input.placeholder,'Date not recorded');
 c.showCompletionDate('field',{done:false,completed_on:'2026-11-09T20:00:00Z'});assert.equal(input.value,'');assert.equal(input.placeholder,'Not completed');
});
