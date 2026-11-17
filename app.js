'use strict';
const $=id=>document.getElementById(id);
const state={projects:[],streams:[],rows:[],focus:[],view:'dashboard',current:null,busy:false,canWrite:false,status:'',todoMeta:[],todoFilter:'open',timelineOffset:0,todoCurrent:null};
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
let signingIn=false;
const writeAttempts=new RetryWrites();
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function startSignIn(){
 if(signingIn)return;signingIn=true;
 try{
 const verifier=base64(crypto.getRandomValues(new Uint8Array(32))),oauthState=crypto.randomUUID();
 const redirect=location.origin+'/app/callback';
 const registration=await fetch('/app/client',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 if(!registration.ok)throw Error('Dashboard sign-in is unavailable. Try again.');const client=await registration.json();
 sessionStorage.setItem('workspace.pending',JSON.stringify({verifier,state:oauthState,client_id:client.client_id,redirect,note:new URLSearchParams(location.search).get('note')||null,meeting:new URLSearchParams(location.search).get('meeting')||null,knowledge:new URLSearchParams(location.search).get('knowledge')||null,knowledgeProposal:new URLSearchParams(location.search).get('knowledgeProposal')||null}));
 const challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 location.assign('/authorize?'+new URLSearchParams({client_id:client.client_id,response_type:'code',redirect_uri:redirect,scope:'mcp:read workspace:write',state:oauthState,resource:location.origin,code_challenge:challenge,code_challenge_method:'S256'}));
 }catch(error){signingIn=false;$('reconnect').hidden=false;throw error;}
}
async function finishSignIn(){
 const params=new URLSearchParams(location.search);history.replaceState(null,'','/');
 const pending=JSON.parse(sessionStorage.getItem('workspace.pending')||'null');sessionStorage.removeItem('workspace.pending');
 if(!pending||params.get('state')!==pending.state||!params.get('code'))throw Error('Sign-in could not be verified. Restart from the dashboard.');
 if(typeof pending.note==='string'&&pending.note.length<=100)history.replaceState(null,'','/?note='+encodeURIComponent(pending.note)+(typeof pending.meeting==='string'&&pending.meeting.length<=100?'&meeting='+encodeURIComponent(pending.meeting):''));
 for(const key of ['knowledge','knowledgeProposal'])if(typeof pending[key]==='string'&&pending[key].length<=100)history.replaceState(null,'','/?'+key+'='+encodeURIComponent(pending[key]));
 if(params.get('remembered')==='1'){
  const remembered=await fetch('/api/session',{credentials:'same-origin'});
  if(remembered.ok){
   for(const key of ['workspace.access','workspace.refresh','workspace.client'])sessionStorage.removeItem(key);
   return;
  }
 }
 const response=await fetch('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:pending.client_id,redirect_uri:pending.redirect,code:params.get('code'),code_verifier:pending.verifier,resource:location.origin})});
 if(!response.ok)throw Error('Sign-in exchange failed. Restart from the dashboard.');const token=await response.json();
 sessionStorage.setItem('workspace.access',token.access_token);sessionStorage.setItem('workspace.client',pending.client_id);if(token.refresh_token)sessionStorage.setItem('workspace.refresh',token.refresh_token);else sessionStorage.removeItem('workspace.refresh');
}
async function api(url,body,canRefresh=true){
 const pending=body?.kind&&url==='/api/write'?writeAttempts.prepare(body):null;
 const sent=pending?.body||body,access=sessionStorage.getItem('workspace.access');
 const response=await fetch(url,{credentials:'same-origin',headers:{...(access?{Authorization:'Bearer '+access}:{}),...(sent?{'Content-Type':'application/json','X-Workspace-Notes':'note-colours-v3'}:{})},...(sent?{method:'POST',body:JSON.stringify(sent)}:{})});
 if(response.status===401&&location.protocol==='https:'){
  if(canRefresh&&typeof refreshSession==='function'&&await refreshSession())return api(url,sent,false);
  if(!captureDraft(sent))throw Error('Sign-in expired. Keep this page open and copy your edits before signing in again.');
  sessionStorage.removeItem('workspace.access');await startSignIn();throw Error('Opening secure sign-in…');
 }
 let data;try{data=await response.json();}catch{throw Error('The workspace response could not be read. Retry; your changes remain in the form.');}
 if(pending&&(response.ok||response.status<500&&response.status!==401))writeAttempts.acknowledge(pending.key);
 if(!response.ok)throw Error(data.error||'Request failed.');return data;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(select,items,empty)=>{select.replaceChildren();if(empty!==undefined)select.add(new Option(empty,''));items.forEach(i=>select.add(new Option(i.name||i.title,i.id)));};
const announce=text=>$('message').textContent=text;
const statuses=['Completed','In Progress','Waiting','Blocked','Not Started'];
const keys={'Completed':'complete','In Progress':'progress','Waiting':'waiting','Blocked':'blocked','Not Started':'idle'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const inMyDay=(task,day)=>!task.done&&(task.due_date===day||state.focus.includes(task.id));
const isOverdue=t=>!t.done&&t.due_date&&t.due_date<today();
const selectedRows=()=>scopedRows(state.rows,state.view,$('project').value,state.dayProject||'',$('query').value,activeWorkstream());
const badge=t=>`<span class="status-badge ${keys[t.action_status]}">${esc(t.action_status)}</span>${isOverdue(t)?'<span class="status-badge blocked">Overdue</span>':''}`;
const taskrow=t=>compactTaskRow(t);

function groupsFor(rows){
 const groups=new Map();for(const t of rows){const label=$('project').value?(t.workstream||'No workstream'):(t.project||'Unassigned');if(!groups.has(label))groups.set(label,[]);groups.get(label).push(t);}return [...groups].sort(([a],[b])=>a.localeCompare(b));
}
function stackSVG(list){let x=0;return `<svg class="stack-track" viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label="${esc(statuses.map(s=>s+': '+list.filter(t=>t.action_status===s).length).join('. '))}">${statuses.map(s=>{const n=list.filter(t=>t.action_status===s).length,w=list.length?n/list.length*100:0;const r=`<rect class="chart-fill-${keys[s]}" x="${x}" y="0" width="${w}" height="12"><title>${s}: ${n}</title></rect>`;x+=w;return r;}).join('')}</svg>`;}
function chartsDashboard(rows){
 const active=rows.filter(t=>!t.done),done=rows.length-active.length,pct=rows.length?Math.round(done/rows.length*100):0;
 const metrics=[['Total items',rows.length,'idle'],['Active',active.length,'progress'],['Completed',done,'complete'],['Waiting / blocked',active.filter(t=>['Waiting','Blocked'].includes(t.action_status)).length,'waiting'],['Overdue',active.filter(isOverdue).length,'blocked'],['Missing due dates',active.filter(t=>!t.due_date).length,'idle']];
 let offset=0;const circumference=2*Math.PI*66;
 const arcs=statuses.map(s=>{const n=rows.filter(t=>t.action_status===s).length,length=rows.length?n/rows.length*circumference:0;const a=`<circle class="chart-${keys[s]}" cx="90" cy="90" r="66" fill="none" stroke-width="19" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"/>`;offset+=length;return a;}).join('');
 const miles=rows.filter(t=>t.item_type==='Milestone');
 const statusChart=`<section class="graph-panel"><div class="panel-heading"><h3>Where work stands</h3><span class="sub">Select a status to see items</span></div><div class="status-layout"><div class="donut"><svg viewBox="0 0 180 180" role="img" aria-label="${pct}% of items completed">${arcs}<text x="90" y="87" text-anchor="middle" class="donut-value">${pct}%</text><text x="90" y="109" text-anchor="middle" class="donut-caption">complete</text></svg></div><div class="status-legend">${statuses.map(s=>`<button data-status="${s}" aria-pressed="${state.status===s}"><span class="swatch ${keys[s]}"></span><span>${s}</span><strong>${rows.filter(t=>t.action_status===s).length}</strong></button>`).join('')}</div></div><div class="panel-note">${miles.filter(t=>t.done).length} of ${miles.length} milestones achieved · Counts are not weighted by effort.</div></section>`;
 const grouped=groupsFor(rows);
 const workload=`<section class="graph-panel"><div class="panel-heading"><h3>${$('project').value?'Workstream':'Project'} progress</h3><span class="sub">Completed / total items</span></div>${grouped.map(([name,list])=>`<div class="workload"><div class="workload-heading"><span>${esc(name)}</span><strong>${list.filter(t=>t.done).length} / ${list.length}</strong></div>${stackSVG(list)}</div>`).join('')||'<p class="empty">No items in this project yet.</p>'}<div class="mini-legend">${statuses.map(s=>`<span><i class="swatch ${keys[s]}"></i>${s}</span>`).join('')}</div></section>`;
 const d=Date.parse(today()+'T00:00:00Z'),week=7*86400000,buckets=[['Overdue',active.filter(isOverdue).length,'blocked'],['Next 7 days',active.filter(t=>t.due_date&&Date.parse(t.due_date+'T00:00:00Z')>=d&&Date.parse(t.due_date+'T00:00:00Z')<=d+week).length,'progress'],['Later',active.filter(t=>t.due_date&&Date.parse(t.due_date+'T00:00:00Z')>d+week).length,'idle'],['No due date',active.filter(t=>!t.due_date).length,'waiting']],max=Math.max(1,...buckets.map(b=>b[1]));
 const dates=`<section class="graph-panel deadline-panel"><div class="panel-heading"><h3>Deadline outlook</h3><span class="sub">Active items · today ${today()}</span></div>${buckets.map(([label,n,key])=>`<div class="deadline-row"><span>${label}</span><svg class="deadline-track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="chart-fill-${key}" x="0" y="0" width="${100*n/max}" height="10"/></svg><strong>${n}</strong></div>`).join('')}</section>`;
 const review=state.status?rows.filter(t=>t.action_status===state.status):active.filter(t=>['Waiting','Blocked'].includes(t.action_status)||t.due_date).sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,5);
 return `<section class="stats" aria-label="Project Totals">${metrics.map(([label,n,key])=>`<div class="stat ${key}"><div class="sub">${label}</div><strong>${n}</strong></div>`).join('')}</section><div class="graph-grid">${statusChart}${workload}</div>${dates}`;
}
function renderBase(){
 $('newProjectTop').hidden=!state.canWrite||!['dashboard','plan','case'].includes(state.view);
 if(renderTools())return;
 const rows=selectedRows().filter(t=>state.view==='day'||!t.is_todo),project=state.projects.find(p=>p.id===$('project').value),names={dashboard:'Dashboard',day:'My Day',plan:'Project Plan',case:'Case View',waiting:'Waiting',completed:'Completed',next:'Ready to Work',todo:'To Do',timeline:'Timeline',export:'Export Project'};
 $('workspaceTitle').textContent=state.view==='todo'?'General Tasks':state.view==='day'?'My Day':project?.name||'All Projects';$('viewTitle').textContent=names[state.view];
 $('viewDescription').textContent=({dashboard:'Your work, at a glance',day:'Pinned work and open items due today (UK time)',plan:'Tasks, owners and dates in one place',case:'',next:'Tasks whose prerequisites are complete',waiting:'Waiting and blocked work',completed:'Completed tasks and milestones',todo:'Simple tasks and repeating work',timeline:'Your project plan over the coming weeks',export:'Download a full project plan to Excel'})[state.view];
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
 $('planFilterWrap').hidden=state.view!=='plan';$('completionFilterWrap').hidden=state.view!=='plan';$('exportPanel').hidden=state.view!=='export';$('projectFilterWrap').hidden=['todo','day'].includes(state.view);$('dayProjectWrap').hidden=state.view!=='day';$('newTask').hidden=['export','todo','case'].includes(state.view);document.querySelector('.filters .search').hidden=state.view==='export';const day=today();$('dayCount').textContent=state.rows.filter(t=>inMyDay(t,day)).length||'';
 if(state.view==='case')renderCaseView(project);
 else if(state.view==='todo')$('content').innerHTML=todoView();
 else if(state.view==='timeline')$('content').innerHTML=timelineView(rows);
 else if(state.view==='export'){$('content').innerHTML='';updateExportOptions();}
 else if(state.view==='dashboard')$('content').innerHTML=dashboard(rows)+projectList(project?[project]:state.projects);
 else if(state.view==='plan'){
  const list=pageRows(filterPlanRows(rows).filter(t=>($('planFilter').value!=='milestones'||t.item_type==='Milestone')&&($('completionFilter').value==='all'||($('completionFilter').value==='done'?t.done:!t.done))));
  const grouped=new Map();for(const t of list){const label=[!$('project').value?t.project||'Unassigned':'',t.workstream||'No workstream'].filter(Boolean).join(' / ');if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push(t);}
  const milestones=rows.filter(t=>t.item_type==='Milestone');
  $('content').innerHTML=`<div class="summary">${rows.filter(t=>t.done).length} of ${rows.length} items complete · ${milestones.filter(t=>t.done).length} of ${milestones.length} milestones achieved</div>`+[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([label,items])=>`<section class="stream"><h3>${esc(label)}</h3><div class="sub">${items.filter(t=>t.done).length}/${items.length} displayed items complete</div>${taskColumnHeaders()}${items.map(taskrow).join('')}</section>`).join('')+(list.length?'':'<p class="empty">No items in this view.</p>');
 }else{
  const list=rows.filter(t=>state.view==='day'?inMyDay(t,day):state.view==='waiting'?!t.done&&['Waiting','Blocked'].includes(t.action_status):state.view==='completed'?t.done:state.nextIds.includes(t.id));
  const items=pageRows(list).map(taskrow).join('');
  $('content').innerHTML=(items?(state.view==='day'?taskColumnHeaders():'')+items:'')||`<div class="empty"><h3>${state.view==='day'?'Choose your focus for today':'Nothing here yet'}</h3><p>${state.view==='day'?'Choose Add to My Day from a task’s ⋯ menu in To Do, Project Plan or Dashboard. Your choices follow you between PCs.':'Choose another project or view, or add a task.'}</p></div>`;
 }
 if(project&&['plan','case'].includes(state.view))void WorkspacePeople.stakeholders(project.id);
}
let loadGeneration=0;
async function load(){
 const generation=++loadGeneration;
 try{
  const collect=async view=>{const rows=[];let after='';do{const r=await api('/api/tasks?'+new URLSearchParams({view,limit:'50',after_id:after}));rows.push(...r.tasks);if(!r.has_more)return rows;announce('Loading workspace: '+rows.length+' items…');after=r.next_after_id;if(rows.length>=10000)throw Error('Workspace exceeds 10000 items; narrow the project scope.');}while(true);};
  const [rows,focus,todoMeta,riskData]=await Promise.all([collect('all'),api('/api/focus'),collectTodos().catch(error=>({error:error.message})),collectRisks().catch(error=>({error:error.message}))]);
  if(generation!==loadGeneration)return;state.risks=Array.isArray(riskData)?riskData:[];state.riskError=riskData.error||'';state.rows=rows;state.focus=focus;state.todoMeta=Array.isArray(todoMeta)?todoMeta:[];state.nextIds=rows.filter(t=>t.ready&&!t.paused).map(t=>t.id);render();announce(todoMeta.error?'Task lists loaded, but repeat details could not load. Open a task to check its repeat settings.':'');
 }catch(e){announce(e.message);}
}
async function loadProjects(){
 const selected=$('project').value;const [projects,streams]=await Promise.all([api('/api/projects'),api('/api/streams')]);state.projects=projects;state.streams=streams;options($('project'),projects,'All Projects');$('project').value=selected;options($('dayProject'),projects,'All My Work');$('dayProject').value=state.dayProject||'';
}

async function projectFields(preserve=false){
 const selected=preserve?$('stream').value:state.current?.workstream_id||'';options($('stream'),state.streams.filter(s=>s.project_id===$('editProject').value),'No workstream');$('stream').value=selected;
 const milestones={tasks:[]};if($('editProject').value){let after='';do{const q=new URLSearchParams({project_id:$('editProject').value,view:'milestones',limit:'50',after_id:after});const result=await api('/api/tasks?'+q);milestones.tasks.push(...result.tasks);if(!result.has_more)break;after=result.next_after_id;if(milestones.tasks.length>=10000)throw Error('Too many milestones to load. Narrow the project.');}while(true);}const selectedMilestone=state.current?.project_id===$('editProject').value?state.current?.milestone_id:null;
 if(selectedMilestone&&!milestones.tasks.some(t=>t.id===selectedMilestone))milestones.tasks.push(await api('/api/tasks/'+encodeURIComponent(selectedMilestone)));
 options($('milestone'),milestones.tasks.filter(t=>t.id!==state.current?.id).sort((a,b)=>a.title.localeCompare(b.title)),'No linked milestone');$('milestone').value=selectedMilestone||'';
  $('newStream').disabled=!state.canWrite||!$('editProject').value;
  $('dependencyPanel').hidden=!state.current;$('addDependency').disabled=!state.canWrite;
  if(state.current){let tasks=[],after='';for(let page=0;page<200;page++){const p=new URLSearchParams({project_id:state.current.project_id||'',view:'all',limit:'50',after_id:after});const result=await api('/api/tasks?'+p);tasks.push(...result.tasks);if(!result.has_more)break;after=result.next_after_id;if(page===199)throw Error('Too many prerequisites to load. Narrow the project.');}
   options($('prerequisite'),tasks.filter(t=>state.current.project_id&&t.project_id===state.current.project_id&&t.id!==state.current.id).sort((a,b)=>a.title.localeCompare(b.title)),'Choose a prerequisite');
   $('addDependency').disabled=!state.canWrite||!state.current.project_id;
   $('dependencyList').replaceChildren();
   for(const dependency of state.current.dependencies||[]){
    const item=node('span',(tasks.find(t=>t.id===dependency.prerequisite_id)?.title||dependency.prerequisite_id)+(dependency.done?' (completed) ':' (open) '));
    const remove=node('button','Remove link','secondary');remove.type='button';remove.disabled=!state.canWrite;
    remove.onclick=async()=>{try{await api('/api/write',{kind:'unlink_dependency',input:{task_id:state.current.id,prerequisite_id:dependency.prerequisite_id},operation_id:crypto.randomUUID()});state.current=await api('/api/tasks/'+encodeURIComponent(state.current.id));await projectFields(true);}catch(e){$('editError').textContent=e.message;}};
    item.append(remove);$('dependencyList').append(item);
   }
   if(!state.current.dependencies?.length)$('dependencyList').textContent=state.current.project_id?'No prerequisites linked.':'Choose a project before linking prerequisites.';
  }
}
async function edit(id=null){
 try{
  state.current=id?await api('/api/tasks/'+encodeURIComponent(id)):null;const t=state.current||{};$('taskId').value=id||'';$('editTitle').textContent=id?'Edit task':'Add task';
  options($('editProject'),state.projects,'Unassigned');$('editProject').value=t.project_id||$('project').value||'';
  for(const [field,key] of Object.entries({title:'title',type:'item_type',status:'action_status',priority:'priority',due:'due_date',follow:'follow_up_date',start:'start_date',assignee:'assignee',waiting:'waiting_on',department:'department',notes:'notes'}))$(field).value=t[key]||(field==='type'?'Task':field==='status'?'Not Started':'');
  if(!id){$('start').value=today();$('assignee').value=state.defaultTaskAssignee||'';}
  $('sourceNoteLink')?.remove();const source=(t.notes||'').match(/\/\?note=([a-zA-Z0-9-]{1,100})(?:&meeting=([a-zA-Z0-9-]{1,100}))?/);if(source){const a=node('a','Open Source Note');a.id='sourceNoteLink';a.href='/?note='+encodeURIComponent(source[1])+(source[2]?'&meeting='+encodeURIComponent(source[2]):'');a.target='_blank';a.rel='noopener';$('notes').after(a);}
  showCompletionDate('completedOn',t);await Promise.all([projectFields(),WorkspacePeople.taskPickers(t)]);$('flags').replaceChildren(...(t.review_flags||[]).map(flag=>node('p',flag)));$('editError').textContent='';$('audit').replaceChildren();$('history').hidden=!id;
  if(id)await loadHistory(id);
  $('addToDay').checked=false;$('addToDay').closest('label').hidden=!!id;$('advancedTask').open=false;$('save').disabled=!state.canWrite;$('editor').showModal();prepareForm($('taskForm'));$('title').focus();return true;
 }catch(e){announce(e.message);return false;}
}
$('taskForm').onsubmit=async event=>{
 event.preventDefault();if(state.busy)return;state.busy=true;$('save').disabled=true;
 try{
  const changes={title:$('title').value,project_id:$('editProject').value||null,workstream_id:$('stream').value||null,item_type:$('type').value,action_status:$('status').value,priority:$('priority').value,due_date:$('due').value||null,follow_up_date:$('follow').value||null,start_date:$('start').value||null,assignee:$('assignee').value,waiting_on:$('waiting').value,assignee_person_id:$('assigneePerson').value||null,waiting_on_person_id:$('waitingPerson').value||null,department:$('department').value,notes:$('notes').value,milestone_id:$('milestone').value||null};
  if(state.current)for(const key of Object.keys(changes))if(changes[key]===state.current[key])delete changes[key];
  if(!Object.keys(changes).length){$('editor').close();return;}
  const t=state.current;const saved=await api('/api/write',{kind:t?'update_task':'create_task',input:t?{task_id:t.id,expected_version:t.version,changes}:{changes,add_to_my_day:$('addToDay').checked},operation_id:crypto.randomUUID()});$('editor').close();await loadProjects();await load();announce('Task saved.');
 }catch(e){$('editError').textContent=e.message;}finally{state.busy=false;$('save').disabled=!state.canWrite;}
};
$('closeEditor').onclick=()=>closeDialogSafely($('editor'));$('newTask').onclick=()=>state.view==='todo'?editTodo():edit();$('editProject').onchange=()=>projectFields(false);

function showProject(projectId){
 $('project').value=projectId;
 state.view='case';
 state.status='';
 state.listLimit=50;
 render();
 $('workspaceTitle').setAttribute('tabindex','-1');
 $('workspaceTitle').focus();
}
function newProject(){
 if(!state.canWrite)return;
 const dialog=toolsDialog('New Project','<form id="newProjectForm"><label>Project name<input name="name" maxlength="180" required></label><div class="form-actions"><button type="submit" class="primary">Create project</button></div></form>');
 const form=dialog.querySelector('#newProjectForm');
 form.elements.name.focus();
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(state.busy)return;
  const name=form.elements.name.value.trim();
  if(!name){$('toolsError').textContent='Enter a project name.';return;}
  state.busy=true;
  const button=form.querySelector('[type=submit]');
  button.disabled=true;
  $('toolsError').textContent='';
  try{
   const {record}=await api('/api/write',{kind:'create_project',input:{name},operation_id:crypto.randomUUID()});
   dialog.close();
   await loadProjects();
   showProject(record.id);
   announce('Project created.');
  }catch(error){
   if(dialog.open)$('toolsError').textContent=error.message;
   else announce('Project created. Refresh to open it.');
  }finally{state.busy=false;button.disabled=false;}
 });
}
$('newProject').onclick=newProject;
$('newProjectTop').onclick=newProject;
$('newStream').onclick=async()=>{const project_id=$('editProject').value;if(!project_id)return;const name=prompt('Workstream name');if(!name?.trim())return;try{const result=await api('/api/write',{kind:'create_workstream',input:{project_id,name},operation_id:crypto.randomUUID()});state.streams=await api('/api/streams');options($('stream'),state.streams.filter(s=>s.project_id===project_id),'No workstream');$('stream').value=result.record.id;}catch(e){$('editError').textContent=e.message;}};
$('addDependency').onclick=async()=>{if(!state.current||!$('prerequisite').value)return;try{await api('/api/write',{kind:'link_dependency',input:{task_id:state.current.id,prerequisite_id:$('prerequisite').value},operation_id:crypto.randomUUID()});state.current=await api('/api/tasks/'+encodeURIComponent(state.current.id));await projectFields(true);$('editError').textContent='Prerequisite linked.';}catch(e){$('editError').textContent=e.message;}};
$('reviewButton').onclick=async()=>{
 const panel=$('reviewPanel');panel.hidden=!panel.hidden;if(panel.hidden)return;panel.replaceChildren();try{const review=await api('/api/review');panel.append(node('h3','Imported Records to Check'));for(const item of review.flags){const el=node('div',undefined,'review-item');const b=node('button',state.rows.find(t=>t.id===item.id)?.title||item.id,'secondary');b.onclick=()=>edit(item.id);el.append(b,node('p',JSON.parse(item.review_flags).join(' · ')));panel.append(el);}for(const item of review.unmatched){const raw=JSON.parse(item.raw_json);panel.append(node('div',`${item.sheet}, row ${item.row_number}: ${raw.Action||'Source item'} — retained as a source reference; not added as a duplicate task.`,'review-item'));}}catch(e){announce(e.message);}
};
$('project').onchange=()=>{state.status='';state.listLimit=50;render();};
$('content').addEventListener('click',event=>{
 const button=event.target.closest('[data-open-project]');
 if(!button)return;
 showProject(button.dataset.openProject);
});
$('query').oninput=()=>{state.listLimit=50;render();};$('planFilter').onchange=()=>render();$('completionFilter').onchange=()=>{state.taskPreset='all';state.status='';render();};
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){goView(b.dataset.view);if(state.view==='day')void load();}});
$('content').addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.edit){state.rows.find(t=>t.id===b.dataset.edit)?.is_todo?editTodo(b.dataset.edit):edit(b.dataset.edit);return;}
 if(b.dataset.convert){
  b.disabled=true;
  try{const current=await api('/api/tasks/'+encodeURIComponent(b.dataset.convert)),item_type=current.item_type==='Milestone'?'Task':'Milestone';
   await api('/api/write',{kind:'update_task',input:{task_id:current.id,expected_version:current.version,changes:{item_type}},operation_id:crypto.randomUUID()});
   await loadProjects();await load();announce('Changed to '+item_type.toLowerCase()+': '+current.title+'.');
  }catch(e){announce(e.message);b.disabled=!state.canWrite;}return;
 }
 if(b.dataset.timeline){state.timelineOffset=b.dataset.timeline==='today'?0:state.timelineOffset+Number(b.dataset.timeline);render();return;}
 if(b.dataset.status){choosePreset(b.dataset.status==='Completed'?'done':'status',b.dataset.status);return;}
 if(b.hasAttribute('data-clear-status')){state.status='';render();return;}
 if(b.dataset.focus){b.disabled=true;try{const selected=!state.focus.includes(b.dataset.focus);await api('/api/write',{kind:'set_focus',input:{task_id:b.dataset.focus,selected},operation_id:crypto.randomUUID()});await load();const dueToday=state.rows.some(t=>t.id===b.dataset.focus&&!t.done&&t.due_date===today());announce(selected?'Added to My Day.':dueToday?'Unpinned. This item still shows in My Day because it is due today.':'Removed from My Day.');}catch(e){announce(e.message);b.disabled=!state.canWrite;}}
});
$('content').addEventListener('change',async e=>{
 if(e.target.id==='todoFilter'){state.todoFilter=e.target.value;render();return;}
 const check=e.target.closest('[data-complete]');if(!check)return;const t=state.rows.find(t=>t.id===check.dataset.complete);check.disabled=true;
 try{await api('/api/write',{kind:'update_task',input:{task_id:t.id,expected_version:t.version,changes:{done:check.checked}},operation_id:crypto.randomUUID()});await loadProjects();await load();completionFeedback(t,check.checked);}catch(e){await load();announce(e.message);}
});
$('exportPlan').onclick=exportWorkspacePlan;
const repeatLabel=id=>{const r=state.todoMeta.find(x=>x.task_id===id);return r&&r.frequency!=='none'?' · Repeats '+r.frequency+(r.interval_count>1?' (every '+r.interval_count+')':''):'';};
function todoView(){
 let list=selectedRows().filter(t=>t.is_todo);
 list=list.filter(t=>state.todoFilter==='all'||(state.todoFilter==='paused'?t.paused:state.todoFilter==='done'?t.done:state.todoFilter==='upcoming'?!t.done&&t.due_date&&t.due_date>today():!t.done));
 list.sort((a,b)=>Number(a.done)-Number(b.done)||(a.due_date||'9999').localeCompare(b.due_date||'9999'));
 const groups=new Map();for(const t of list){const label=t.done?'Completed':t.paused?'Paused':!t.due_date?'No date':t.due_date<today()?'Overdue':t.due_date===today()?'Today':'Upcoming';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(t);}
 const ordered=['Overdue','Today','Upcoming','No date','Paused','Completed'];
 return `<section class="todo-workspace"><form id="quickTodo" class="quick-todo todo-capture"><div class="todo-capture-line"><label class="quick-title">Add a task<input name="title" placeholder="What needs doing?" required maxlength="500" ${!state.canWrite?'disabled':''}></label><button class="primary" ${!state.canWrite?'disabled':''}>＋ Add task</button></div><details class="todo-schedule"><summary>Schedule & repeat <span>Optional</span></summary><div class="todo-schedule-fields"><label>Due date<input name="due" type="date" ${!state.canWrite?'disabled':''}></label><label>Repeat<select name="repeat" ${!state.canWrite?'disabled':''}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div><p>Repeating tasks need a due date. Each completed run is kept in history.</p></details></form><div class="todo-toolbar"><div><h3>Your tasks <span class="todo-count">${list.length}</span></h3><p class="sub">Select a task name to preview it. Use the pencil to rename it.</p></div><label>Show<select id="todoFilter">${[['open','Open tasks'],['upcoming','Upcoming'],['paused','Paused'],['done','Completed'],['all','All tasks']].map(([v,n])=>`<option value="${v}" ${state.todoFilter===v?'selected':''}>${n}</option>`).join('')}</select></label></div>${list.length?`<div class="todo-list">${taskColumnHeaders()}${ordered.filter(k=>groups.has(k)).map(k=>`<section class="todo-group ${k==='Overdue'?'todo-group-overdue':''}" aria-label="${k}"><h4>${k}<span>${groups.get(k).length}</span></h4>${groups.get(k).map(todoTaskRow).join('')}</section>`).join('')}</div>`:'<div class="empty"><h3>Nothing here yet</h3><p>Add a task above. You can set a date or repeat whenever you need it.</p></div>'}</section>`;
}
async function editTodo(id=null){
 try{const t=id?await api('/api/tasks/'+encodeURIComponent(id)):null;state.todoCurrent=t;
 $('todoTitle').value=t?.title||'';$('todoDue').value=t?.due_date||'';showCompletionDate('todoCompletedOn',t);$('todoNotes').value=t?.notes||'';$('todoAssignee').value=t?t.assignee:state.defaultTaskAssignee||'';
 $('todoWaiting').value=t?.waiting_on||'';await WorkspacePeople.taskPickers(t,{assignee_person_id:'todoAssigneePerson',waiting_on_person_id:'todoWaitingPerson'});
 $('todoRepeat').value=t?.todo?.frequency||'none';$('todoInterval').value=t?.todo?.interval_count||1;$('todoBasis').value=t?.todo?.basis||'scheduled';
 options($('todoProject'),state.projects,'Keep in To Do');$('todoError').textContent='';$('saveTodo').disabled=!state.canWrite;$('todoEditor').showModal();prepareForm($('todoForm'));$('todoTitle').focus();return true;
 }catch(e){announce(e.message);return false;}
}
$('closeTodo').onclick=()=>closeDialogSafely($('todoEditor'));
$('todoForm').onsubmit=async e=>{
 e.preventDefault();if(state.busy)return;state.busy=true;$('saveTodo').disabled=true;
 try{const t=state.todoCurrent,changes={title:$('todoTitle').value.trim(),due_date:$('todoDue').value||null,notes:$('todoNotes').value,assignee:$('todoAssignee').value,waiting_on:$('todoWaiting').value,assignee_person_id:$('todoAssigneePerson').value||null,waiting_on_person_id:$('todoWaitingPerson').value||null};
 if($('todoProject').value)changes.project_id=$('todoProject').value;
 const repeat={frequency:$('todoRepeat').value,interval:Number($('todoInterval').value),basis:$('todoBasis').value};
 const unchanged=t?.todo&&repeat.frequency===t.todo.frequency&&repeat.interval===t.todo.interval_count&&repeat.basis===t.todo.basis;
 if(t){for(const key of Object.keys(changes))if(changes[key]===t[key])delete changes[key];if(!Object.keys(changes).length){if(unchanged){$('todoEditor').close();return;}changes.title=t.title;}}
 const input=t?{task_id:t.id,expected_version:t.version,changes,...(!unchanged?{repeat}:{})}:{changes,repeat};
 await api('/api/write',{kind:t?'update_todo':'create_todo',input,operation_id:crypto.randomUUID()});$('todoEditor').close();await loadProjects();await load();announce(changes.project_id?'Moved to the project. Future repeats stay in To Do.':'To Do saved.');
 }catch(error){$('todoError').textContent=error.message;}finally{state.busy=false;$('saveTodo').disabled=!state.canWrite;}
};
$('content').addEventListener('change',e=>{
 const form=e.target.closest('#quickTodo');
 if(form&&e.target.name==='repeat')form.elements.due.required=e.target.value!=='none';
});
$('content').addEventListener('submit',async e=>{
 if(e.target.id!=='quickTodo')return;e.preventDefault();if(state.busy)return;state.busy=true;const f=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;
 try{await api('/api/write',{kind:'create_todo',input:{changes:{title:String(f.get('title')).trim(),due_date:f.get('due')||null},repeat:{frequency:f.get('repeat')}},operation_id:crypto.randomUUID()});await load();announce('To Do added.');}
 catch(error){announce(error.message);button.disabled=!state.canWrite;}finally{state.busy=false;}
});
const dateNumber=s=>Date.parse(s+'T00:00:00Z')/86400000;
const isoDay=n=>new Date(n*86400000).toISOString().slice(0,10);
function timelineView(rows){
 rows=rows.filter(t=>state.timelineCompletion==='all'||!t.done);
 const nowDay=dateNumber(today()),dayOfWeek=new Date(nowDay*86400000).getUTCDay(),start=nowDay-((dayOfWeek+6)%7)+state.timelineOffset*7,end=start+56;
 const color=id=>{const i=state.projects.findIndex(p=>p.id===id);return 'project-color-'+(i<0?12:i%12);};
 const dated=rows.filter(t=>t.start_date||t.due_date),unscheduled=rows.filter(t=>!t.start_date&&!t.due_date);
 const visible=dated.filter(t=>t.item_type==='Milestone'?(dateNumber(t.due_date||t.start_date)>=start&&dateNumber(t.due_date||t.start_date)<end):(dateNumber(t.due_date||t.start_date)>=start&&dateNumber(t.start_date||t.due_date)<end)).sort((a,b)=>(a.project||'').localeCompare(b.project||'')||(a.start_date||a.due_date).localeCompare(b.start_date||b.due_date));
 const x=n=>(n-start)/56*800;
 const grid=()=>Array.from({length:9},(_,i)=>`<line x1="${i*100}" x2="${i*100}" y1="0" y2="40" class="timeline-grid"/>`).join('');
 const currentLine=nowDay>=start&&nowDay<end?`<line x1="${x(nowDay)}" x2="${x(nowDay)}" y1="0" y2="40" class="timeline-today"/>`:'';
 const legend=[...new Map(visible.map(t=>[t.project_id,{name:t.project||'Unassigned',id:t.project_id}])).values()];
 return `<div class="timeline-toolbar"><label>Show<select id="timelineCompletion"><option value="open" ${state.timelineCompletion!=='all'?'selected':''}>Open Items</option><option value="all" ${state.timelineCompletion==='all'?'selected':''}>All Items, Including Completed</option></select></label><div><strong>${isoDay(start)} — ${isoDay(end-1)}</strong><p class="sub">Eight weeks · Monday–Sunday · Start and due dates are editable</p></div><div class="actions"><button data-timeline="-4">← Previous 4 weeks</button><button data-timeline="today">This week</button><button data-timeline="4">Next 4 weeks →</button></div></div><div class="timeline-legend">${legend.map(p=>`<span><i class="project-dot ${color(p.id)}"></i>${esc(p.name)}</span>`).join('')}</div><div class="shape-legend" aria-label="Timeline Shape Legend"><span><i class="legend-bar" aria-hidden="true"></i> Bar: Start-to-End Range</span><span><i class="legend-dot" aria-hidden="true"></i> Dot: One Date Only</span><span><i class="legend-diamond" aria-hidden="true"></i> Diamond: Milestone</span><span>Faded: Completed</span></div><div class="timeline-scroll"><div class="timeline-board"><div class="timeline-row timeline-heading"><strong>Task / Milestone</strong><svg viewBox="0 0 800 40" preserveAspectRatio="none" role="img" aria-label="Weeks beginning ${Array.from({length:8},(_,i)=>isoDay(start+i*7)).join(', ')}">${Array.from({length:8},(_,i)=>`<text x="${i*100+7}" y="23">${isoDay(start+i*7)}</text>`).join('')}</svg></div>${pageRows(visible).map(t=>{
 const a=dateNumber(t.start_date||t.due_date),b=dateNumber(t.due_date||t.start_date),point=dateNumber(t.due_date||t.start_date),px=Math.max(5,Math.min(795,x(point))),invalid=b<a;
 const shape=t.item_type==='Milestone'?`<polygon points="${px},9 ${px+7},20 ${px},31 ${px-7},20"/>`:t.start_date&&t.due_date&&!invalid?`<rect x="${Math.max(0,x(a))}" y="12" width="${Math.max(5,Math.min(800,x(b+1))-Math.max(0,x(a)))}" height="16" rx="5"/>`:`<circle cx="${px}" cy="20" r="6"/>`;
 return `<div class="timeline-row"><div class="timeline-label"><button class="task-title" data-edit="${esc(t.id)}">${t.item_type==='Milestone'?'◇ ':''}${esc(t.title)}</button><button class="secondary timeline-date-button" data-dates="${esc(t.id)}">Edit Dates</button><small>${esc(t.project||'Unassigned')} · ${esc(t.start_date&&t.due_date?t.start_date+' → '+t.due_date:t.start_date?'Starts '+t.start_date:'Due '+t.due_date)}${invalid?' · Check date order':''}</small></div><svg class="${color(t.project_id)} ${t.done?'timeline-complete':''}" viewBox="0 0 800 40" preserveAspectRatio="none" role="img" aria-label="${esc(t.title)}: ${esc(t.start_date||t.due_date)} to ${esc(t.due_date||t.start_date)}"><title>${esc(t.title)} · ${esc(t.action_status)} · ${esc(t.start_date||t.due_date)} to ${esc(t.due_date||t.start_date)}</title>${grid()}${currentLine}<g class="timeline-mark">${shape}</g></svg></div>`;
 }).join('')}</div></div>${!visible.length?'<p class="empty">No dated tasks in these weeks. Browse earlier or later weeks, or set dates on an unscheduled task below.</p>':''}<p class="sub">${dated.length-visible.length} dated items outside these weeks</p><details class="unscheduled"><summary>Unscheduled Tasks (${unscheduled.length})</summary><p class="sub">Set a Start date, Due date or both below, then choose Save Dates. Adding either date places the task on the Timeline.</p>${pageRows(unscheduled).map(t=>'<section class="unscheduled-item">'+taskrow(t)+'<details class="quick-date-edit"><summary>Add Dates</summary>'+dateForm(t)+'</details></section>').join('')||'<p>Everything has a date.</p>'}</details>`;
}

const draftFields={editor:['title','editProject','stream','type','status','priority','due','follow','start','assignee','waiting','assigneePerson','waitingPerson','department','notes','milestone'],todo:['todoTitle','todoDue','todoRepeat','todoInterval','todoBasis','todoNotes','todoProject','todoAssignee','todoWaiting','todoAssigneePerson','todoWaitingPerson']};
function captureDraft(pendingWrite){
 if($('peopleEditor')?.open){$('reconnect').hidden=false;return false;}
 if($('caseTaskDialog')?.open&&!$('toolsDialog')?.open)return captureCaseTaskDraft(pendingWrite);
 if((typeof TaskQuickEdit!=='undefined'&&TaskQuickEdit.hasPending()))return TaskQuickEdit.captureDraft(pendingWrite);
 if(typeof captureToolDraft==='function'&&document.getElementById('toolsDialog')?.open)return captureToolDraft(pendingWrite);
 let kind=$('editor').open?'editor':$('todoEditor').open?'todo':null,values;
 if(kind)values=Object.fromEntries(draftFields[kind].map(id=>[id,$(id).value]));
 else{const f=document.getElementById('quickTodo');if(f&&f.elements.title.value.trim()){kind='quick';values={title:f.elements.title.value,due:f.elements.due.value,repeat:f.elements.repeat.value};}}
 if(!kind)return true;
 const current=kind==='editor'?state.current:kind==='todo'?state.todoCurrent:null;
 try{sessionStorage.setItem('workspace.draft',JSON.stringify({kind,values,taskId:current?.id||null,version:current?.version||null,addToDay:$('addToDay')?.checked||false,view:state.view,project:$('project').value,query:$('query').value,pendingWrite,at:Date.now()}));return true;}
 catch{$('reconnect').hidden=false;return false;}
}
async function restoreDraft(){
 let draft;try{draft=JSON.parse(sessionStorage.getItem('workspace.draft')||'null');}catch{sessionStorage.removeItem('workspace.draft');return;}
 if(!draft)return;
 if(draft.kind==='case-task'){await restoreCaseTaskDraft(draft);return;}
 if(draft.kind==='inline'&&typeof TaskQuickEdit!=='undefined'){if(!Number.isFinite(draft.at)||Date.now()-draft.at>3600000){sessionStorage.removeItem('workspace.draft');return;}await TaskQuickEdit.restoreDraft(draft);return;}
 if(draft.kind==='tools'&&typeof restoreToolDraft==='function'){if(!Number.isFinite(draft.at)||Date.now()-draft.at>3600000){sessionStorage.removeItem('workspace.draft');return;}await restoreToolDraft(draft);return;}
 if(!['editor','todo','quick'].includes(draft.kind)||!draft.values||!Number.isFinite(draft.at)||Date.now()-draft.at>3600000){sessionStorage.removeItem('workspace.draft');return;}
 if(draft.pendingWrite)writeAttempts.prepare(draft.pendingWrite);
 const views=['dashboard','day','plan','case','todo','timeline','export','next','waiting','completed'];
 state.view=draft.kind==='quick'?'todo':views.includes(draft.view)?draft.view:'plan';$('project').value=draft.project||'';$('query').value=String(draft.query||'').slice(0,180);render();
 if(draft.kind==='quick'){
  const f=$('quickTodo');for(const id of ['title','due','repeat'])f.elements[id].value=draft.values[id]||'';
 }else if(draft.kind==='editor'){
  if(!await edit(draft.taskId))throw Error('Your draft is kept in this tab. Reload to try restoring it again.');for(const id of draftFields.editor)if(Object.hasOwn(draft.values,id)&&!['stream','milestone'].includes(id))$(id).value=draft.values[id]??'';
  await projectFields();if($('addToDay'))$('addToDay').checked=draft.addToDay===true;$('stream').value=draft.values.stream||'';$('milestone').value=draft.values.milestone||'';
  if(state.current&&draft.version){if(state.current.version!==draft.version)$('editError').textContent='This task changed during sign-in. Your draft is restored; saving will check for a conflict.';state.current.version=draft.version;}
 }else{
  if(!await editTodo(draft.taskId))throw Error('Your draft is kept in this tab. Reload to try restoring it again.');for(const id of draftFields.todo)if(Object.hasOwn(draft.values,id))$(id).value=draft.values[id]??'';
  if(state.todoCurrent&&draft.version){if(state.todoCurrent.version!==draft.version)$('todoError').textContent='This task changed during sign-in. Your draft is restored; saving will check for a conflict.';state.todoCurrent.version=draft.version;}
 }
 sessionStorage.removeItem('workspace.draft');refreshFormState($(draft.kind==='editor'?'taskForm':draft.kind==='todo'?'todoForm':'quickTodo'));announce('Your unsaved task has been restored. Review it and save when ready.');
}
$('reconnect').onclick=()=>startSignIn().catch(e=>announce(e.message));

$('signOut').onclick=async()=>{
 const button=$('signOut');
 button.disabled=true;
 try{
  const notes=window.WorkspaceNotes;
  if(notes?.hasPending()&&!await notes.flush(true)){
   throw Error('Finish saving your note before signing out.');
  }
  signingIn=true;
  const refresh=sessionStorage.getItem('workspace.refresh');
  const token=refresh||sessionStorage.getItem('workspace.access');
  const client=sessionStorage.getItem('workspace.client');
  if(token&&client){
   const revoked=await fetch('/oauth/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:client,token,token_type_hint:refresh?'refresh_token':'access_token'})
   });
   if(!revoked.ok)throw Error('Sign-out could not be completed. Please try again.');
  }
  const response=await fetch('/app/sign-out',{method:'POST',credentials:'same-origin'});
  if(!response.ok)throw Error('Sign-out could not be completed. Please try again.');
  for(const key of ['workspace.access','workspace.refresh','workspace.client','workspace.pending','workspace.draft','workspace.note-draft'])sessionStorage.removeItem(key);
  notes?.detach();
  document.querySelector('.shell').hidden=true;
  location.replace('/?signedOut=1');
 }catch(error){signingIn=false;announce(error.message);$('mode').textContent=error.message;button.disabled=false;}
};
(async()=>{
 if(location.pathname==='/app/callback')await finishSignIn();
 if(new URLSearchParams(location.search).get('signedOut')==='1'){
  document.querySelector('.shell').hidden=true;
  $('mode').textContent='Signed out';
  $('workspaceTitle').textContent='Project Workspace';
  $('reconnect').textContent='Sign in';
  $('reconnect').hidden=false;
  $('reconnect').onclick=()=>startSignIn().catch(error=>{$('mode').textContent=error.message;});
  return;
 }
 const session=await api('/api/session');state.canWrite=session.can_write;state.defaultTaskAssignee=session.default_task_assignee;
 $('mode').textContent=session.mode==='local'?'Local data':state.canWrite?'Private workspace':'Read-only workspace';
 $('signOut').hidden=session.mode==='local';$('newTask').disabled=!state.canWrite;$('newProject').disabled=!state.canWrite;
 document.querySelector('.footnote').textContent=session.mode==='cloud'?'Saved in your private cloud workspace · Excel originals unchanged · Exports contain your entered data':session.cloud_origin?'Read-only migration snapshot · Open '+session.cloud_origin+' for your current working copy':'Local test workspace · Changes stay in this test database';
 await loadProjects();restorePreferences();const destination=new URLSearchParams(location.search);if(destination.has('note'))state.view='notes';if(destination.has('knowledge')||destination.has('knowledgeProposal'))state.view='knowledge';await load();await restoreDraft();initWorkspaceTools();initUX();
})().catch(e=>announce(e.message));
