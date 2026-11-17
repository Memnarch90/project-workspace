// Disposable synthetic browser test. Never imports or opens real workbooks.
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=mkdtempSync(path.join(tmpdir(),'project-workspace-browser-'));
const dbpath=path.join(dir,'test.sqlite3'), db=sqliteAdapter(dbpath);db.exec(readFileSync(path.join(root,'schema.sql'),'utf8'));
const s=workspace(db,'browser-test');
const p=(await s.write('create_project',{name:'Synthetic test project'},'fixture-project','test-fixture')).record;
await s.write('create_task',{changes:{title:'Synthetic first task',project_id:p.id,notes:'Synthetic note only.',start_date:'2026-11-04',due_date:'2026-11-13'}},'fixture-task-1','test-fixture');
await s.write('create_task',{changes:{title:'Synthetic milestone',project_id:p.id,item_type:'Milestone',due_date:'2026-11-20'}},'fixture-task-2','test-fixture');
const p2=(await s.write('create_project',{name:'Second synthetic project'},'fixture-project-2','test-fixture')).record;
await s.write('create_task',{changes:{title:'Second project action',project_id:p2.id,start_date:'2026-11-10',due_date:'2026-11-24'}},'fixture-task-3','test-fixture');
if(process.env.REVIEW_WORKSTREAMS==='1'){
 const a=(await s.write('create_workstream',{project_id:p.id,name:'Reporting'},'fixture-stream-a','test')).record;
 const b=(await s.write('create_workstream',{project_id:p.id,name:'Governance'},'fixture-stream-b','test')).record;
 await s.write('create_task',{changes:{title:'Reporting action',project_id:p.id,workstream_id:a.id}},'fixture-report-task','test');
 await s.write('create_task',{changes:{title:'Governance action',project_id:p.id,workstream_id:b.id}},'fixture-govern-task','test');
 for(const [id,stream,description] of [['a',a.id,'Reporting risk'],['b',b.id,'Governance risk'],['c',null,'Project-wide risk']])await s.write('create_risk',{changes:{project_id:p.id,workstream_id:stream,description,likelihood:5,impact:5}},'fixture-risk-'+id,'test');
}
if(process.env.REVIEW_LARGE_CHOICES==='1'){
 for(let i=0;i<55;i++)await s.write('create_task',{changes:{title:'Choice milestone '+String(i+1).padStart(2,'0'),project_id:p.id,item_type:'Milestone'}},'fixture-review-mile-'+i,'test-fixture');
}
db.close();console.log('Synthetic browser database: '+dbpath);
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,WORKSPACE_PORT:process.env.TEST_BROWSER_PORT||'8768',WORKSPACE_DB:dbpath,WORKSPACE_OWNER:'browser-test'},stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
