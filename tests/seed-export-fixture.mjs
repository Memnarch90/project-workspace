// Seed additional synthetic data into the explicitly supplied disposable browser fixture only.
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
if(!process.argv[2]?.includes('project-workspace-browser-'))throw Error('Disposable fixture path required.');
const db=sqliteAdapter(process.argv[2]),s=workspace(db,'browser-test');
try{const p=(await s.projects()).find(p=>p.name==='Synthetic test project');if(!p)throw Error('Synthetic project missing.');
 const reporting=(await s.write('create_workstream',{project_id:p.id,name:'Reporting'},'export-fixture-stream1','test-fixture')).record,governance=(await s.write('create_workstream',{project_id:p.id,name:'Governance'},'export-fixture-stream2','test-fixture')).record;
 for(const [title,stream] of [['Synthetic first task',reporting.id],['Synthetic milestone',governance.id]]){const task=(await s.findTasks({view:'all',query:title})).tasks.find(t=>t.title===title);await s.write('update_task',{task_id:task.id,expected_version:task.version,changes:{workstream_id:stream}},'export-fixture-assign-'+stream,'test-fixture');}
 await s.write('create_risk',{changes:{project_id:p.id,workstream_id:reporting.id,description:'Synthetic reporting-only risk',likelihood:2,impact:4,status:'Open',mitigation:'Review reporting inputs'}},'export-fixture-risk1','test-fixture');
 console.log('Seeded two synthetic workstreams and a scoped risk.');
}finally{db.close();}
