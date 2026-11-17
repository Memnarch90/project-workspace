import {changeNoteLayout} from './note-layout-store.mjs';
import {noteAction} from './note-actions.mjs';
import {peopleInputs,peopleStore,taskPersonFields,taskPersonColumns} from './people.mjs';
import {noteStore} from './notes.mjs';
import {auditSummary} from './audit.mjs';
import {riskStore} from './risks.mjs';
import {workspaceTools} from './workspace-tools.mjs';
import {repeatRule,nextOccurrence,ukToday} from './recurrence.mjs';
import {projectInformation} from './project-information.mjs';
// Shared SQL service: Cloudflare D1-compatible, with the local SQLite adapter for staging.
export const STATUSES=['Not Started','In Progress','Waiting','Blocked','Completed'];
export const PROJECT_STATUSES=['Active','On Hold','Completed'];
export const DEFAULT_TASK_ASSIGNEE='Unassigned';
const EDITABLE=['title','project_id','workstream_id','item_type','action_status','done','priority','due_date','follow_up_date','start_date','waiting_on','notes','assignee','department','milestone_id','archived',...Object.keys(taskPersonFields)];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const json=value=>JSON.stringify(value);
const now=()=>new Date().toISOString();
function requireText(value,max,label,blank=true){if(typeof value!=='string'||value.length>max||(!blank&&!value.trim())||value.includes('\0'))throw Error(`Invalid ${label}.`);return value.trim();}
export function validatePatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw Error('Provide changed fields.');
 for(const [key,value] of Object.entries(patch)){
  if(!EDITABLE.includes(key))throw Error(`Field cannot be changed: ${key}`);
  if((['project_id','workstream_id','milestone_id'].includes(key)||Object.hasOwn(taskPersonFields,key))){if(value!==null)requireText(value,100,key,false);}
  else if(['done','archived'].includes(key)){if(typeof value!=='boolean')throw Error(`${key} must be true or false.`);}
  else if(key==='action_status'){if(!STATUSES.includes(value))throw Error('Unsupported status.');}
  else if(key==='item_type'){if(!['Task','Milestone'].includes(value))throw Error('Unsupported item type.');}
  else if(key==='priority'){if(!['','High','Medium','Low'].includes(value))throw Error('Unsupported priority.');}
  else if(['due_date','follow_up_date','start_date'].includes(key)){
   if(value!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('Use YYYY-MM-DD or null.');
  }else requireText(value,key==='notes'?16000:key==='title'?500:500,key,key!=='title');
 }
 if(Object.hasOwn(patch,'done')&&Object.hasOwn(patch,'action_status')&&patch.done!==(patch.action_status==='Completed'))throw Error('Done and Action Status must agree when both are explicitly changed.');
 return patch;
}
export function workspace(db,owner,{today=ukToday}={}){
 const notes=noteStore(db,owner),tools=workspaceTools(db,owner),risks=riskStore(db,owner,{today});
 const people=peopleStore(db,owner,notes,today);
 const projectRow=id=>db.prepare('SELECT p.*,i.body AS information_json FROM projects p LEFT JOIN project_information i ON i.owner_id=p.owner_id AND i.id=p.id WHERE p.owner_id=?1 AND p.id=?2').bind(owner,id);
 const decodeProject=({information_json,...row})=>({...row,...(information_json?{information:JSON.parse(information_json)}:{})});
 const getProject=async id=>{
  const row=await projectRow(id).first();
  if(!row)throw Error('Project not found.');
  return decodeProject(row);
 };
 const ownedTask=async id=>{const r=await db.prepare(`SELECT t.*,${taskPersonColumns} FROM tasks t WHERE t.owner_id=?1 AND t.id=?2`).bind(owner,id).first();if(!r)throw Error('Task not found.');return {...r,done:!!r.done,archived:!!r.archived,review_flags:JSON.parse(r.review_flags)};};
 const checkLinks=async data=>{
  if(data.project_id&&!await db.prepare('SELECT id FROM projects WHERE id=?1 AND owner_id=?2').bind(data.project_id,owner).first())throw Error('Project not found.');
  if(data.workstream_id&&!await db.prepare('SELECT w.id FROM workstreams w JOIN projects p ON p.id=w.project_id WHERE w.id=?1 AND w.project_id=?2 AND p.owner_id=?3').bind(data.workstream_id,data.project_id,owner).first())throw Error('Workstream does not belong to the selected project.');
  if(data.milestone_id){const m=await ownedTask(data.milestone_id);if(m.id===data.id||m.item_type!=='Milestone'||m.archived||m.project_id!==data.project_id)throw Error('Choose a different milestone in this project.');}
 };
 async function write(kind,input,op,actor){
  if(['set_note_color','move_note_item'].includes(kind))return changeNoteLayout(db,owner,kind,input,op,actor);
  if(kind==='create_note_action')return noteAction(db,owner,workspace,input,op,actor);
  if(['save_note','save_note_folder','restore_note_revision','save_note_image','save_note_blob'].includes(kind))return notes.write(kind,input,op,actor);
  if(['create_risk','update_risk'].includes(kind))return risks.write(kind,input,op,actor);
  if(['save_document','save_task_note','delete_task_note','restore_backup'].includes(kind))return tools.write(kind,input,op,actor);
  requireText(op,100,'operation_id',false);if(op.length<8)throw Error('operation_id must be at least 8 characters.');
  const fingerprint=json(stable([kind,input]));
  const previous=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();
  if(previous){if(previous.fingerprint!==fingerprint)throw Error('operation_id was used for different changes.');return JSON.parse(previous.result_json);}
  let before=null,after,entity='task',action=kind;
  const stmts=[];
  if(['create_person','update_person','log_interaction','update_interaction','link_meeting_person'].includes(kind)){
   const change=await people.prepareWrite(kind,input,now());
   ({before,after,entity}=change);
   stmts.push(change.stmt);
  }else if(kind==='create_project'){
   const name=requireText(input.name,180,'project name',false);entity='project';
   after={id:crypto.randomUUID(),owner_id:owner,name,description:requireText(input.description||'',4000,'description'),status:'Active',version:1};
   stmts.push(db.prepare('INSERT INTO projects(id,owner_id,name,description,status,version) VALUES(?1,?2,?3,?4,?5,?6)').bind(...Object.values(after)));
  }else if(kind==='update_project'){
   entity='project';
   const projectId=requireText(input.project_id,100,'project ID',false);
   if(!Number.isSafeInteger(input.expected_version)||input.expected_version<1)throw Error('Read the project and provide expected_version.');
   const changes=input.changes;
   const fields=Object.keys(changes||{});
   if(!fields.length||fields.some(field=>!['name','description','status','information'].includes(field)))throw Error('Provide a project name, description, status or information to change.');
   before=await getProject(projectId);
   if(before.version!==input.expected_version)throw Error('Conflict: project changed. Read it again before saving.');
   const name=Object.hasOwn(changes,'name')?requireText(changes.name,180,'project name',false):before.name;
   const description=Object.hasOwn(changes,'description')?requireText(changes.description,4000,'description'):before.description;
   const status=Object.hasOwn(changes,'status')?changes.status:before.status;
   if(!PROJECT_STATUSES.includes(status))throw Error('Unsupported project status.');
   if(name!==before.name&&await db.prepare('SELECT id FROM projects WHERE owner_id=?1 AND name=?2').bind(owner,name).first())throw Error('A project with that name already exists.');
   after={...before,name,description,status,version:before.version+1};
   stmts.push(db.prepare('UPDATE projects SET name=?1,description=?2,status=?3,version=CASE WHEN version=?4 THEN version+1 ELSE NULL END WHERE id=?5 AND owner_id=?6').bind(name,description,status,before.version,projectId,owner));
   if(Object.hasOwn(changes,'information')){
    const patch=projectInformation.parse(changes.information);
    if(!Object.keys(patch).length)throw Error('Provide a project information field to change.');
    const information=Object.fromEntries(Object.entries({...before.information,...patch}).filter(([,value])=>value.length));
    if(Object.keys(information).length){
     after.information=information;
     stmts.push(db.prepare('INSERT INTO project_information(owner_id,id,body) VALUES(?1,?2,?3) ON CONFLICT(owner_id,id) DO UPDATE SET body=excluded.body').bind(owner,projectId,json(information)));
    }else{
     delete after.information;
     stmts.push(db.prepare('DELETE FROM project_information WHERE owner_id=?1 AND id=?2').bind(owner,projectId));
    }
   }
  }else if(kind==='create_workstream'){
   requireText(input.project_id,100,'project',false);
   if(!await db.prepare('SELECT id FROM projects WHERE id=?1 AND owner_id=?2').bind(input.project_id,owner).first())throw Error('Project not found.');
   after={id:crypto.randomUUID(),project_id:input.project_id,name:requireText(input.name,180,'workstream name',false)};entity='workstream';
   stmts.push(db.prepare('INSERT INTO workstreams(id,project_id,name) VALUES(?1,?2,?3)').bind(...Object.values(after)));
  }else if(['create_task','update_task','create_todo','update_todo','skip_todo','link_task_person'].includes(kind)){
   if(kind==='skip_todo')input={...input,changes:{done:true}};
   if(kind==='link_task_person'){
    const link=peopleInputs.link_task_person.parse(input);
    input={...link,changes:{[link.role+'_person_id']:link.person_id}};
   }
   const patch=validatePatch(input.changes);
   if(kind==='update_task'||kind==='update_todo'||kind==='skip_todo'||kind==='link_task_person'){
    if(!Number.isInteger(input.expected_version)||input.expected_version<1)throw Error('Read the task and provide expected_version.');
    before=await ownedTask(input.task_id);if(before.version!==input.expected_version)throw Error('Conflict: task changed. Read it again before saving.');
    if(kind==='link_task_person'&&before.archived)throw Error('Choose an active task.');
    after={...before,...patch,version:before.version+1,updated_at:now()};
   }else{
    if(!patch.title)throw Error('Task title is required.');
    after={id:crypto.randomUUID(),owner_id:owner,project_id:null,workstream_id:null,title:'',item_type:'Task',action_status:'Not Started',done:false,previous_action_status:'Not Started',priority:'',due_date:null,follow_up_date:null,start_date:null,created_on:now(),completed_on:null,waiting_on:'',notes:'',assignee:DEFAULT_TASK_ASSIGNEE,department:'',milestone_id:null,version:1,review_flags:[],archived:false,updated_at:now(),...patch};
   }
   if(Object.hasOwn(patch,'done')||Object.hasOwn(patch,'action_status')){
    if(patch.done===true||patch.action_status==='Completed'){
     after.previous_action_status=before?.action_status!=='Completed'?before?.action_status||'Not Started':before?.previous_action_status||'Not Started';
     after.done=true;after.action_status='Completed';after.completed_on=before?.done?before.completed_on:now();
    }else if(patch.done===false&&before?.done){after.action_status=patch.action_status||before.previous_action_status||'Not Started';if(after.action_status==='Completed')after.action_status='Not Started';after.completed_on=null;}
    else if(Object.hasOwn(patch,'action_status')){after.done=false;after.completed_on=null;}
   }
   if((!before||Object.hasOwn(patch,'start_date')||Object.hasOwn(patch,'due_date'))&&after.start_date&&after.due_date&&after.start_date>after.due_date)throw Error('The start date must be on or before the due date.');
   if(after.item_type==='Milestone'&&after.milestone_id)throw Error('A milestone cannot be assigned to another milestone. Use a prerequisite instead.');
   if(before&&(after.project_id!==before.project_id||after.item_type!==before.item_type)){
    const linked=await db.prepare('SELECT id FROM tasks WHERE milestone_id=?1 LIMIT 1').bind(before.id).first();
    if(linked&&(after.project_id!==before.project_id||after.item_type!=='Milestone'))throw Error('Other tasks use this milestone. Remove their milestone links before changing its project or type.');
    if(after.project_id!==before.project_id&&await db.prepare('SELECT task_id FROM dependencies WHERE task_id=?1 OR prerequisite_id=?1 LIMIT 1').bind(before.id).first())throw Error('This task has prerequisites or dependants. Keep it in its project while those links exist.');
   }
   if(before&&!before.archived&&after.archived){
    const usedMilestone=await db.prepare('SELECT id FROM tasks WHERE milestone_id=?1 AND archived=0 LIMIT 1').bind(before.id).first();
    const usedPrerequisite=await db.prepare('SELECT t.id FROM dependencies d JOIN tasks t ON t.id=d.task_id WHERE d.prerequisite_id=?1 AND t.archived=0 LIMIT 1').bind(before.id).first();
    if(usedMilestone||usedPrerequisite)throw Error('Other tasks are linked to this item or depend on it. Remove those links before archiving.');
   }
   const todo=before?await db.prepare('SELECT * FROM todo_items WHERE task_id=?1 AND owner_id=?2').bind(before.id,owner).first():null;
   const detail=await tools.document(after.id);
   if(detail?.body.paused&&after.done&&!before?.done)throw Error('Resume this routine before completing or skipping it.');
   if(kind==='skip_todo'){if(!todo?.is_general||todo.frequency==='none'||before.done||todo.next_task_id)throw Error('Only an active repeating To do can be skipped.');stmts.push(db.prepare("INSERT INTO workspace_documents(owner_id,id,kind,version,body) VALUES(?1,?2,'task',1,?3) ON CONFLICT(owner_id,id) DO UPDATE SET body=json_set(workspace_documents.body,'$.skipped',json('true')),version=workspace_documents.version+1").bind(owner,after.id,JSON.stringify({...detail?.body,skipped:true})));}
   if(input.details&& !before){const body=tools.validateDocument('task',input.details);stmts.push(db.prepare("INSERT INTO workspace_documents(owner_id,id,kind,version,body) VALUES(?1,?2,'task',1,?3)").bind(owner,after.id,JSON.stringify(body)));}
   if(kind==='update_todo'&&!todo)throw Error('To do item not found.');
   if(kind==='create_todo'&&(after.project_id||after.item_type!=='Task'))throw Error('Create a simple To do without a project first.');
   if(todo?.is_general&&todo.next_task_id&&before.done&&!after.done)throw Error('The next repeating task already exists. Use that occurrence instead of reopening this one.');
   await checkLinks(after);
   const values=Object.fromEntries(Object.entries(after).filter(([key])=>!Object.hasOwn(taskPersonFields,key)).map(([k,v])=>[k,k==='review_flags'?json(v):['done','archived'].includes(k)?Number(v):v]));
   if(kind==='create_task'||kind==='create_todo')stmts.push(db.prepare(`INSERT INTO tasks(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map((_,i)=>'?'+(i+1)).join(',')})`).bind(...Object.values(values)));
   else{
    const columns=Object.keys(values).filter(k=>!['id','owner_id','version'].includes(k));
    stmts.push(db.prepare(`UPDATE tasks SET ${columns.map((k,i)=>`${k}=?${i+1}`).join(',')},version=CASE WHEN version=?${columns.length+1} THEN version+1 ELSE NULL END WHERE id=?${columns.length+2} AND owner_id=?${columns.length+3}`).bind(...columns.map(k=>values[k]),before.version,before.id,owner));
   }
   for(const [field,role] of Object.entries(taskPersonFields)){
    const selected=after[field]??null;
    if(selected===(before?.[field]??null))continue;
    if(selected){
     await people.active(selected);
     stmts.push(db.prepare(`INSERT INTO task_people(owner_id,task_id,role,person_id) VALUES(?1,?2,?3,?4)
       ON CONFLICT(owner_id,task_id,role) DO UPDATE SET person_id=excluded.person_id`).bind(owner,after.id,role,selected));
    }else stmts.push(db.prepare('DELETE FROM task_people WHERE owner_id=?1 AND task_id=?2 AND role=?3').bind(owner,after.id,role));
   }
   if(before?.notes&&!after.notes){
    stmts.push(db.prepare("UPDATE workspace_documents SET body=json_remove(body,'$.legacyNoteDate'),version=version+1 WHERE owner_id=?1 AND id=?2 AND json_type(body,'$.legacyNoteDate') IS NOT NULL").bind(owner,after.id));
   }
   if((kind==='create_task'||kind==='create_todo')&&input.add_to_my_day===true)
    stmts.push(db.prepare('INSERT INTO task_focus(owner_id,task_id,selected) VALUES(?1,?2,1)').bind(owner,after.id));
   let rule=todo?{frequency:todo.frequency,interval:todo.interval_count,basis:todo.basis,anchor_day:todo.anchor_day}:null;
   if(kind==='create_todo'||(kind==='update_todo'&&input.repeat)){
    rule=repeatRule(input.repeat,after.due_date);
    const scheduled=after.due_date;
    stmts.push(db.prepare('INSERT INTO todo_items(task_id,owner_id,is_general,frequency,interval_count,basis,anchor_day,scheduled_date) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(task_id) DO UPDATE SET frequency=excluded.frequency,interval_count=excluded.interval_count,basis=excluded.basis,anchor_day=excluded.anchor_day,scheduled_date=excluded.scheduled_date').bind(after.id,owner,Number(!after.project_id),rule.frequency,rule.interval,rule.basis,rule.anchor_day,scheduled));
   }
   if(todo&&after.project_id)stmts.push(db.prepare('UPDATE todo_items SET is_general=0 WHERE task_id=?1 AND owner_id=?2').bind(after.id,owner));
   if(rule&&rule.frequency!=='none'&&!after.due_date)throw Error('Repeating tasks need a due date.');
   const promoted=todo?.is_general&&!before.project_id&&!!after.project_id;
   if(rule&&rule.frequency!=='none'&&((after.done&&!before?.done)||promoted)&&!todo?.next_task_id){
    const nextDate=nextOccurrence(rule,input.repeat?after.due_date:todo?.scheduled_date||after.due_date,today());
    const next={...(promoted?before:after),id:crypto.randomUUID(),project_id:null,workstream_id:null,milestone_id:null,item_type:'Task',action_status:'Not Started',done:false,previous_action_status:'Not Started',due_date:nextDate,follow_up_date:null,start_date:null,created_on:now(),completed_on:null,version:1,review_flags:[],archived:false,updated_at:now()};
    for(const field of Object.keys(taskPersonFields))if(next[field]&&(await people.person(next[field])).archived)next[field]=null;
    const v=Object.fromEntries(Object.entries(next).filter(([key])=>!Object.hasOwn(taskPersonFields,key)).map(([k,v])=>[k,k==='review_flags'?json(v):['done','archived'].includes(k)?Number(v):v]));
    stmts.push(db.prepare(`INSERT INTO tasks(${Object.keys(v).join(',')}) VALUES(${Object.keys(v).map((_,i)=>'?'+(i+1)).join(',')})`).bind(...Object.values(v)));
    for(const [field,role] of Object.entries(taskPersonFields))if(next[field]){
     stmts.push(db.prepare('INSERT INTO task_people(owner_id,task_id,role,person_id) VALUES(?1,?2,?3,?4)').bind(owner,next.id,role,next[field]));
    }
    if(detail){const body={...detail.body,paused:false,skipped:false,checklist:(detail.body.checklist||[]).map(c=>({...c,done:false}))};stmts.push(db.prepare("INSERT INTO workspace_documents(owner_id,id,kind,version,body) VALUES(?1,?2,'task',1,?3)").bind(owner,next.id,JSON.stringify(body)));}
    stmts.push(db.prepare('INSERT INTO todo_items(task_id,owner_id,is_general,frequency,interval_count,basis,anchor_day,scheduled_date) VALUES(?1,?2,1,?3,?4,?5,?6,?7)').bind(next.id,owner,rule.frequency,rule.interval,rule.basis,rule.anchor_day,nextDate));
    stmts.push(db.prepare('UPDATE todo_items SET next_task_id=?1 WHERE task_id=?2 AND owner_id=?3').bind(next.id,after.id,owner));
    stmts.push(db.prepare("INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,before_json,after_json,operation_id) VALUES(?1,'task',?2,'repeat_created',?3,?4,NULL,?5,?6)").bind(owner,next.id,actor,now(),json(next),op));
   }
  }else if(kind==='set_focus'){
   await ownedTask(input.task_id);
   if(typeof input.selected!=='boolean')throw Error('selected must be true or false.');
   entity='focus';after={task_id:input.task_id,selected:input.selected};
   stmts.push(db.prepare('INSERT INTO task_focus(owner_id,task_id,selected) VALUES(?1,?2,?3) ON CONFLICT(owner_id,task_id) DO UPDATE SET selected=excluded.selected').bind(owner,input.task_id,Number(input.selected)));
  }else if(kind==='unlink_dependency'){
   await ownedTask(input.task_id);await ownedTask(input.prerequisite_id);
   before={task_id:input.task_id,prerequisite_id:input.prerequisite_id,linked:true};after={...before,linked:false};entity='dependency';
   stmts.push(db.prepare('DELETE FROM dependencies WHERE task_id=?1 AND prerequisite_id=?2').bind(input.task_id,input.prerequisite_id));
  }else if(kind==='link_dependency'){
   const task=await ownedTask(input.task_id),prerequisite=await ownedTask(input.prerequisite_id);
   if(!task.project_id||task.archived||prerequisite.archived||task.id===prerequisite.id||task.project_id!==prerequisite.project_id)throw Error('Dependencies must link different tasks in the same project.');
   const cycle=await db.prepare('WITH RECURSIVE chain(id) AS (SELECT prerequisite_id FROM dependencies WHERE task_id=?1 UNION SELECT d.prerequisite_id FROM dependencies d JOIN chain c ON d.task_id=c.id) SELECT id FROM chain WHERE id=?2 LIMIT 1').bind(prerequisite.id,task.id).first();
   if(cycle)throw Error('Dependency would create a cycle.');
   after={task_id:task.id,prerequisite_id:prerequisite.id};entity='dependency';
   stmts.push(db.prepare('INSERT OR IGNORE INTO dependencies(task_id,prerequisite_id) VALUES(?1,?2)').bind(task.id,prerequisite.id));
  }else throw Error('Unsupported operation.');
  const result={entity,record:after};
  // Operation, mutation and audit are one transaction. An optimistic-version mismatch aborts all.
  const id=after.id||after.task_id||after.meeting_id;
  stmts.unshift(db.prepare('INSERT INTO operations(owner_id,operation_id,fingerprint,result_json) VALUES(?1,?2,?3,?4)').bind(owner,op,fingerprint,json(result)));
  stmts.push(db.prepare('INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,before_json,after_json,operation_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind(owner,entity,id,action,actor,now(),before?json(before):null,json(after),op));
  if(kind==='update_project')stmts.push(projectRow(id));
  try{
   const saved=await db.batch(stmts);
   if(kind==='update_project')result.record=decodeProject(saved.at(-1).results[0]);
  }catch{
   const retry=await db.prepare('SELECT fingerprint,result_json FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();
   if(retry?.fingerprint===fingerprint)return JSON.parse(retry.result_json);
   if(retry)throw Error('operation_id was used for different changes.');
   throw Error('Conflict: write failed or the link changed. Refresh before retrying.');
  }
  return result;
 }
 return {
  tools,risks,notes,people,
  todoPage:async(after='')=>{const rows=(await db.prepare('SELECT ti.* FROM todo_items ti JOIN tasks t ON t.id=ti.task_id WHERE ti.owner_id=?1 AND t.owner_id=?1 AND t.archived=0 AND ti.task_id>?2 ORDER BY ti.task_id LIMIT 51').bind(owner,after).all()).results;return {items:rows.slice(0,50),has_more:rows.length>50,next_after_id:rows.slice(0,50).at(-1)?.task_id||after};},
  todos:async()=>{
   const rows=(await db.prepare('SELECT ti.*,t.title,t.done,t.due_date,t.version FROM todo_items ti JOIN tasks t ON t.id=ti.task_id WHERE ti.owner_id=?1 AND t.owner_id=?1 AND t.archived=0 ORDER BY t.done,t.due_date,t.id LIMIT 1001').bind(owner).all()).results;
   if(rows.length>1000)throw Error('To do history exceeds 1000 items. Archive older completed items.');return rows;
  },
  focus:async()=> (await db.prepare('SELECT f.task_id FROM task_focus f JOIN tasks t ON t.id=f.task_id WHERE f.owner_id=?1 AND t.owner_id=?1 AND t.archived=0 AND f.selected=1').bind(owner).all()).results.map(r=>r.task_id),
  exportPlan:async projectId=>{
   const rows=(await db.prepare(`SELECT t.*,p.name AS project,w.name AS workstream FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN workstreams w ON w.id=t.workstream_id WHERE t.owner_id=?1 AND t.archived=0 AND NOT EXISTS(SELECT 1 FROM todo_items ti WHERE ti.task_id=t.id AND ti.is_general=1)${projectId?' AND t.project_id=?2':''} ORDER BY p.name,w.name,t.id LIMIT 10001`).bind(...(projectId?[owner,projectId]:[owner])).all()).results;
   if(rows.length>10000)throw Error('Export exceeds 10000 items. Select a smaller project.');
   return rows;
  },
  getTask:async id=>{const task=await ownedTask(id);const dependencies=(await db.prepare('SELECT d.prerequisite_id,t.done FROM dependencies d JOIN tasks t ON t.id=d.prerequisite_id WHERE d.task_id=?1 AND t.owner_id=?2').bind(id,owner).all()).results;const todo=await db.prepare('SELECT * FROM todo_items WHERE task_id=?1 AND owner_id=?2').bind(id,owner).first();return {...task,dependencies,todo,details:await tools.document(id)};},
  getProject,
  projects:async({includeInformation=false}={})=> (await db.prepare(`SELECT p.*,COUNT(t.id) AS task_count,SUM(CASE WHEN t.done=1 THEN 1 ELSE 0 END) AS completed_count,
   ${includeInformation?'(SELECT i.body FROM project_information i WHERE i.owner_id=p.owner_id AND i.id=p.id) AS information_json,':''}
   (SELECT json_object('title',m.title,'due_date',m.due_date) FROM tasks m
    WHERE m.owner_id=p.owner_id AND m.project_id=p.id AND m.item_type='Milestone' AND m.done=0 AND m.archived=0 AND m.due_date IS NOT NULL
    ORDER BY m.due_date,m.id LIMIT 1) AS next_milestone
   FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.archived=0 WHERE p.owner_id=?1 GROUP BY p.id ORDER BY p.name`).bind(owner).all()).results
   .map(project=>({...decodeProject(project),...(includeInformation&&!project.information_json?{information:{}}:{}),next_milestone:JSON.parse(project.next_milestone)})),
  streams:async(projectId=null)=> (await db.prepare('SELECT w.* FROM workstreams w JOIN projects p ON p.id=w.project_id WHERE p.owner_id=?1 AND (?2 IS NULL OR w.project_id=?2) ORDER BY w.name').bind(owner,projectId).all()).results,
  summary:async projectId=>{
   const filter=projectId?' AND project_id=?3':'';
   const stmt=db.prepare(`SELECT COUNT(*) AS tasks,COALESCE(SUM(done),0) AS completed,COALESCE(SUM(CASE WHEN item_type='Milestone' THEN 1 ELSE 0 END),0) AS milestones,COALESCE(SUM(CASE WHEN done=0 AND action_status IN ('Waiting','Blocked') THEN 1 ELSE 0 END),0) AS waiting,COALESCE(SUM(CASE WHEN done=0 AND due_date<?2 THEN 1 ELSE 0 END),0) AS overdue FROM tasks WHERE owner_id=?1 AND archived=0 AND NOT EXISTS(SELECT 1 FROM todo_items ti WHERE ti.task_id=tasks.id AND ti.is_general=1)${filter}`);
   return stmt.bind(...(projectId?[owner,today(),projectId]:[owner,today()])).first();
  },
  findTasks:async({project_id,status,query='',view='active',after_id='',limit=30}={})=>{
   if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Limit must be 1-50.');
   const conditions=['t.owner_id=?','t.archived=0','t.id>?'],args=[owner,after_id];
   if(project_id){conditions.push('t.project_id=?');args.push(project_id);}
   if(status){if(!STATUSES.includes(status))throw Error('Unsupported status.');conditions.push('t.action_status=?');args.push(status);}
   if(query){requireText(query,180,'query');conditions.push("t.title LIKE ? ESCAPE '\\'");args.push('%'+query.replace(/[\\%_]/g,'\\$&')+'%');}
   if(view==='active')conditions.push('t.done=0');
   else if(view==='completed')conditions.push('t.done=1');
   else if(view==='waiting')conditions.push("t.done=0 AND t.action_status IN ('Waiting','Blocked')");
   else if(view==='milestones')conditions.push("t.item_type='Milestone'");
   else if(view==='next'){conditions.push("NOT EXISTS(SELECT 1 FROM workspace_documents wd WHERE wd.id=t.id AND wd.owner_id=t.owner_id AND json_extract(wd.body,'$.paused')=1)");conditions.push('(t.start_date IS NULL OR t.start_date<=?)');args.push(today());conditions.push("t.done=0 AND t.action_status IN ('Not Started','In Progress') AND NOT EXISTS(SELECT 1 FROM dependencies d JOIN tasks p ON p.id=d.prerequisite_id WHERE d.task_id=t.id AND p.done=0)");}
   else if(view!=='all')throw Error('Unsupported view.');
   const rows=(await db.prepare(`SELECT CASE WHEN t.done=0 AND t.action_status IN ('Not Started','In Progress') AND (t.start_date IS NULL OR t.start_date<=?) AND NOT EXISTS(SELECT 1 FROM dependencies d JOIN tasks dp ON dp.id=d.prerequisite_id WHERE d.task_id=t.id AND dp.done=0) THEN 1 ELSE 0 END AS ready,EXISTS(SELECT 1 FROM todo_items ti WHERE ti.task_id=t.id AND ti.is_general=1) AS is_todo,t.id,t.version,t.title,t.project_id,p.name AS project,t.workstream_id,w.name AS workstream,t.item_type,t.action_status,t.done,t.priority,t.assignee,t.waiting_on,${taskPersonColumns},t.completed_on,t.start_date,t.due_date,t.follow_up_date,t.review_flags,COALESCE(json_extract(wd.body,'$.paused'),0) AS paused,COALESCE(json_extract(wd.body,'$.skipped'),0) AS skipped,COALESCE(json_array_length(wd.body,'$.checklist'),0) AS step_count,(SELECT COUNT(*) FROM json_each(wd.body,'$.checklist') WHERE json_extract(value,'$.done')=1) AS step_done FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN workstreams w ON w.id=t.workstream_id LEFT JOIN workspace_documents wd ON wd.id=t.id AND wd.owner_id=t.owner_id WHERE ${conditions.join(' AND ')} ORDER BY t.id LIMIT ?`).bind(today(),...args,limit+1).all()).results;
   return {tasks:rows.slice(0,limit).map(r=>({...r,done:!!r.done,review_flags:JSON.parse(r.review_flags)})),has_more:rows.length>limit,next_after_id:rows.slice(0,limit).at(-1)?.id||after_id};
  },
  changes:async(cursor=0,limit=30)=>{
   if(!Number.isInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid cursor or limit.');
   const rows=(await db.prepare('SELECT seq,entity_type,entity_id,action,at FROM audit_events WHERE owner_id=?1 AND seq>?2 ORDER BY seq LIMIT ?3').bind(owner,cursor,limit+1).all()).results;
   return {changes:rows.slice(0,limit),cursor:rows.slice(0,limit).at(-1)?.seq||cursor,has_more:rows.length>limit};
  },
  auditPage:async(id,before=Number.MAX_SAFE_INTEGER)=>{await ownedTask(id);if(!Number.isSafeInteger(before)||before<1)throw Error('Invalid history cursor.');const rows=(await db.prepare("SELECT seq,action,actor,at,before_json,after_json FROM audit_events WHERE owner_id=?1 AND entity_type='task' AND entity_id=?2 AND seq<?3 ORDER BY seq DESC LIMIT 26").bind(owner,id,before).all()).results;return {items:rows.slice(0,25).map(r=>({seq:r.seq,action:r.action,actor:r.actor,at:r.at,summary:auditSummary(r)})),has_more:rows.length>25,next_before:rows.slice(0,25).at(-1)?.seq||before};},
  audit:async id=>(await db.prepare('SELECT seq,action,actor,at,before_json,after_json FROM audit_events WHERE owner_id=?1 AND entity_type=\'task\' AND entity_id=?2 ORDER BY seq DESC LIMIT 50').bind(owner,id).all()).results,
  review:async()=>({flags:(await db.prepare("SELECT id,review_flags FROM tasks WHERE owner_id=?1 AND archived=0 AND review_flags<>'[]' ORDER BY id").bind(owner).all()).results,unmatched:(await db.prepare("SELECT s.sheet,s.row_number,s.raw_json FROM source_records s JOIN source_files f ON f.sha256=s.source_sha256 WHERE s.disposition='unmatched-plan-row-review' ORDER BY s.sheet,s.row_number").all()).results}),
  write,
 };
}
