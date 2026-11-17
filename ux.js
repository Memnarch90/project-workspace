'use strict';

const workspaceIconPaths={
 dashboard:'M3 3h7v8H3z M14 3h7v5h-7z M3 15h7v6H3z M14 12h7v9h-7z',
 day:'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
 todo:'M4 4h16v16H4z M8 12l3 3 5-6',
 notes:'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
 people:'M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 20v-2a4 4 0 0 0-3-3.9 M16 4.1a3 3 0 0 1 0 5.8',
 knowledge:'M12 5v15 M12 6C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1z',
 plan:'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
 case:'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3h6',
 timeline:'M4 4v16h16 M7 8h6 M11 13h6 M15 17h5',
 risks:'M12 3 2.5 20h19z M12 9v4 M12 16h.01',
 edit:'M12 5H5v14h14v-7 M11 13l1-4 7-7 3 3-7 7z',
 more:'M5 12h.01 M12 12h.01 M19 12h.01',
 pin:'M12 2l3 6 7 .9-5 4.8 1.2 6.8L12 17.3l-6.2 3.2L7 13.7l-5-4.8L9 8z',
 close:'M6 6l12 12 M18 6 6 18'
};
function workspaceIcon(name){
 const path=workspaceIconPaths[name];
 return path?`<svg class="workspace-icon workspace-icon-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`:'';
}
function addNavigationIcons(){
 document.querySelectorAll('#workspaceNav > [data-view]').forEach(button=>{
  const icon=workspaceIcon(button.dataset.view);
  if(icon)button.insertAdjacentHTML('afterbegin',icon);
 });
}
// Presentation and interaction helpers. All changes still use the shared audited API.
function scopedRows(rows,view,project,dayProject,query='',workstream=''){
 const scope=view==='todo'?'':view==='day'?dayProject:project,q=query.trim().toLocaleLowerCase();
 return rows.filter(t=>(!scope||t.project_id===scope)&&(view==='todo'||!workstream||(workstream==='__general'?!t.workstream_id:t.workstream_id===workstream))&&(!q||[t.title,t.assignee,t.waiting_on].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)));
}
function activeWorkstream(){return state.view==='todo'?'':state.view==='day'?state.dayWorkstream||'':state.workstream||'';}
function riskMatchesWorkstream(r,streamId,streams){if(!streamId)return true;if(streamId==='__general')return !r.workstream_id;const stream=streams.find(s=>s.id===streamId);return !!stream&&r.project_id===stream.project_id&&(!r.workstream_id||r.workstream_id===streamId);}
function prepareWorkstreamFilter(){
 const shown=['dashboard','day','plan','waiting','completed','next','timeline','risks','weekly','reminders'].includes(state.view);
 let wrap=$('workstreamFilterWrap');if(!wrap){wrap=document.createElement('label');wrap.id='workstreamFilterWrap';wrap.append('Workstream');const select=document.createElement('select');select.id='workstreamFilter';wrap.append(select);$('projectFilterWrap').after(wrap);select.onchange=()=>{state[state.view==='day'?'dayWorkstream':'workstream']=select.value;state.listLimit=50;render();};}
 wrap.hidden=!shown;if(!shown)return;
 const project=state.view==='day'?state.dayProject||'':$('project').value,key=state.view==='day'?'dayWorkstream':'workstream';
 const streams=state.streams.filter(s=>!project||s.project_id===project).map(s=>({...s,name:(project?'':(state.projects.find(p=>p.id===s.project_id)?.name||'')+' / ')+s.name})).sort((a,b)=>a.name.localeCompare(b.name));
 if(state[key]&&state[key]!=='__general'&&!streams.some(s=>s.id===state[key]))state[key]='';
 options($('workstreamFilter'),streams,'All Workstreams');$('workstreamFilter').add(new Option('No Workstream / Project-wide','__general'));$('workstreamFilter').value=state[key]||'';
}
function goView(view,{query}={}){if(state.view==='notes'&&window.WorkspaceNotes?.needsReview()){announce('Open Review changes to choose what to keep before leaving.');return;}if(state.view==='notes'&&window.WorkspaceNotes?.hasPending()){window.WorkspaceNotes.flush(true).then(ok=>{if(ok)goView(view,{query});});return;}if(state.view==='notes')window.WorkspaceNotes?.checkpoint();state.searches||={};state.searches[state.view]=$('query').value;if(state.view==='knowledge'&&view!=='knowledge'){const url=new URL(location.href);url.searchParams.delete('knowledge');url.searchParams.delete('knowledgeProposal');history.replaceState(null,'',url.pathname+url.search);}state.view=view;$('query').value=query??state.searches[view]??'';state.listLimit=50;state.status='';document.querySelector('.shell').classList.remove('menu-open');$('mobileMenu').setAttribute('aria-expanded','false');render();}
function choosePreset(preset,status=''){state.taskPreset=preset;state.status=status;$('planFilter').value=preset==='milestones'?'milestones':'all';$('completionFilter').value=preset==='done'?'done':preset==='all'?'all':'open';goView('plan',{query:$('query').value});state.status=status;render();}
function filterPlanRows(rows){const preset=state.taskPreset||'open';return rows.filter(t=>preset==='open'?!t.done:preset==='done'?t.done:preset==='waiting'?['Waiting','Blocked'].includes(t.action_status)&&!t.done:preset==='ready'?!!t.ready&&!t.paused&&!t.done:preset==='overdue'?isOverdue(t):preset==='follow'?!!t.follow_up_date&&t.follow_up_date<=today()&&!t.done:preset==='dates'?!t.due_date&&!t.done:preset==='status'?t.action_status===state.status:true);}
function completionDate(value){if(!value)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function showCompletionDate(id,t){const input=$(id);if(!input)return;input.value=t?.done?completionDate(t.completed_on):'';input.placeholder=t?.done?'Date not recorded':'Not completed';}
document.addEventListener('change',e=>{if(e.target.id==='status'){const done=e.target.value==='Completed';showCompletionDate('completedOn',done&&state.current?.done?state.current:null);if(done&&!state.current?.done)$('completedOn').placeholder='Recorded when saved';}});
const taskListViews=['todo','plan','dashboard','day'];
function taskColumnHeaders(){
 return '<div class="task-column-headings aligned-task-columns"><span></span><span>Task</span><span>Owner</span><span>Status</span><span>Due date</span><span>Actions</span></div>';
}
function myDayMenuAction(t){const selected=state.focus.includes(t.id);if(state.view==='day'&&!t.done&&t.due_date===today()&&!selected)return '<span class="sub">Shown automatically because it is due today</span>';return !t.done||selected?`<button data-focus="${esc(t.id)}" aria-pressed="${selected}" ${!state.canWrite?'disabled':''}>${selected?'Remove from My Day':'Add to My Day'}</button>`:'';}
function quickTaskField(t,field,content,className=''){
 const label={title:'title',assignee:'owner',due_date:'due date',action_status:'status'}[field];
 return `<span class="task-quick-cell" data-quick-cell><button type="button" class="task-quick-value ${className}" data-quick-field="${field}" data-quick-task="${esc(t.id)}" aria-label="${field==='title'?'Rename task':'Edit '+label}: ${esc(t.title)}" title="${field==='title'?'Rename task':'Edit '+label}" ${!state.canWrite?'disabled':''}>${content}</button></span>`;
}
// One quick field at a time; keep its version and failed input until resolved.
window.TaskQuickEdit=(()=>{
 let active=null;
 const labels={title:'Task title',assignee:'Owner',due_date:'Due date',action_status:'Status'};
 const changed=()=>active&&active.control.value!==active.initial;
 function close(){if(!active)return;const a=active;active=null;if(a.host.isConnected){a.host.innerHTML=a.original;a.host.querySelector('button')?.focus();}}
 function message(text){if(active)active.form.querySelector('[data-quick-error]').textContent=text;announce(text);}
 function open(button,draft){
  if(!state.canWrite||!taskListViews.includes(state.view))return;
  const task=state.rows.find(t=>t.id===button.dataset.quickTask),field=button.dataset.quickField;
  if(!task||!Object.hasOwn(labels,field))return;
  const host=button.closest('[data-quick-cell]'),original=host.innerHTML,value=task[field]||'';
  host.innerHTML=`<form class="task-quick-form ${field==='title'?'quick-title-form':''}" aria-label="Edit ${esc(labels[field].toLowerCase())}" novalidate><label>${labels[field]}${field==='action_status'?`<select name="value" aria-label="Status">${statuses.map(s=>`<option ${value===s?'selected':''}>${s}</option>`).join('')}</select>`:`<input name="value" aria-label="${labels[field]}" type="${field==='due_date'?'date':'text'}" ${field==='title'?'required maxlength="500"':field==='assignee'?'maxlength="500"':''} value="${esc(value)}">`}</label><div class="quick-field-actions"><button type="submit">Save</button><button type="button" data-quick-cancel>Cancel</button></div><p data-quick-error role="status" aria-live="polite"></p></form>`;
  const form=host.querySelector('form'),control=form.elements.value;
  if(field!=='title'){
   const bounds=form.getBoundingClientRect();
   const lowerEdge=Math.min(innerHeight,$('workspace').getBoundingClientRect().bottom);
   if(bounds.bottom>lowerEdge-12&&bounds.top>bounds.height)form.classList.add('quick-open-up');
  }
  active={host,original,form,control,field,task:{...task},initial:value,saving:false};
  if(draft){control.value=draft.value;active.task.version=draft.version;if(draft.pendingWrite)writeAttempts.prepare(draft.pendingWrite);}
  control.focus();if(field==='title')control.select();
 }
 document.addEventListener('click',e=>{
  if(active&&!active.form.contains(e.target)){
   if(active.saving||changed()){e.preventDefault();e.stopImmediatePropagation();message('Save or cancel this quick edit first.');active.control.focus();return;}
   const next=e.target.closest('[data-quick-field]');close();if(next){e.preventDefault();e.stopImmediatePropagation();const b=[...document.querySelectorAll('[data-quick-field]')].find(b=>b.dataset.quickTask===next.dataset.quickTask&&b.dataset.quickField===next.dataset.quickField);if(b)open(b);return;}
  }
  const b=e.target.closest('[data-quick-field]');if(b){e.preventDefault();e.stopImmediatePropagation();open(b);}
  if(e.target.closest('[data-quick-cancel]')&&active&&!active.saving){e.preventDefault();e.stopImmediatePropagation();close();render();}
 },true);
 document.addEventListener('focusin',e=>{if(active&&!active.form.contains(e.target)){if(changed()||active.saving){active.control.focus();message('Save or cancel this quick edit first.');}else close();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active&&!active.saving){e.preventDefault();e.stopImmediatePropagation();close();render();}},true);
 document.addEventListener('submit',async e=>{
  if(!active||e.target!==active.form)return;e.preventDefault();e.stopImmediatePropagation();const a=active;if(a.saving)return;
  if(!state.canWrite){message('This workspace is read-only.');return;}
  const value=a.control.value.trim();
  if(a.field==='title'&&!value){message('Enter a task title.');a.control.focus();return;}
  if(!a.control.validity.valid){message('Enter a valid '+labels[a.field].toLowerCase()+'.');return;}
  if(value===(a.task[a.field]||'')){close();return;}
  const changes={[a.field]:a.field==='due_date'?value||null:value};
  a.saving=true;a.form.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  try{
   await api('/api/write',{kind:'update_task',input:{task_id:a.task.id,expected_version:a.task.version,changes},operation_id:crypto.randomUUID()});
   await loadProjects();await load();close();announce(labels[a.field]+' saved.');
  }catch(error){
   // Refresh the underlying row without replacing the rejected input. A retry
   // still uses its original version/receipt; Cancel reveals the latest record.
   try{const latest=await api('/api/tasks/'+encodeURIComponent(a.task.id));state.rows=state.rows.map(t=>t.id===latest.id?{...t,...latest}:t);}catch{}
   if(active===a)message(error.message+' Your edit is kept here. Cancel to show the latest saved task.');
  }
  finally{a.saving=false;if(active===a){a.form.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);a.control.focus();}}
 },true);
 window.addEventListener('beforeunload',e=>{if(!signingIn&&(changed()||active?.saving)){e.preventDefault();e.returnValue='';}});
 return {
  hasPending:()=>!!active,
  captureDraft(pendingWrite){if(!active)return true;const a=active;try{sessionStorage.setItem('workspace.draft',JSON.stringify({kind:'inline',taskId:a.task.id,field:a.field,value:a.control.value,version:a.task.version,pendingWrite,view:state.view,project:$('project').value,query:$('query').value,at:Date.now()}));return true;}catch{return false;}},
  async restoreDraft(draft){
   state.view=taskListViews.includes(draft.view)?draft.view:'plan';$('project').value=draft.project||'';$('query').value='';state.taskPreset='all';state.todoFilter='all';$('completionFilter').value='all';render();
   const findButton=()=>[...document.querySelectorAll('[data-quick-field]')].find(b=>b.dataset.quickTask===draft.taskId&&b.dataset.quickField===draft.field);
   let button=findButton();
   const task=state.rows.find(t=>t.id===draft.taskId);
   if(!button&&task){
    state.view=task.is_todo?'todo':'plan';
    $('project').value='';$('planFilter').value='all';state.workstream='';
    state.listLimit=Math.max(50,state.rows.length);
    render();button=findButton();
   }
   if(!button)throw Error('Your quick-edit draft is retained in this tab. Show the task to restore it.');open(button,draft);sessionStorage.removeItem('workspace.draft');message('Your unsaved quick edit was restored. Review and save it.');
  }
 };
})();
function todoTaskRow(t){return compactTaskRow(t,true);}
function compactTaskRow(t,todo=false){
 const readOnly=state.view==='weekly';
 const quick=taskListViews.includes(state.view);
 const title=(t.item_type==='Milestone'?'<span class="diamond" aria-label="Milestone">◇</span> ':'')+esc(t.title);
 const titleClass='task-title '+(t.done?'done':'');
 const taskId=esc(t.id);
 const name=quick
  ?`<div class="task-name-line"><button type="button" class="${titleClass}" data-task-preview="${taskId}" aria-expanded="false" aria-controls="task-preview-${taskId}">${title}</button>${taskNoteButton(t)}${state.canWrite?quickTaskField(t,'title',workspaceIcon('edit'),'task-rename'):''}</div>`
  :`<button class="${titleClass}" data-edit="${taskId}">${title}</button>`;
 const project=state.view!=='plan'||!$('project').value?t.project||(!t.is_todo?'No Project':''):'';
 const context=[project,state.view!=='plan'?t.workstream:''].filter(Boolean).join(' · ');
 const repeat=repeatLabel(t.id);
 const owner=esc(t.assignee||'No Owner');
 const due=esc(t.due_date||'No Due Date');
 const status=quick?quickTaskField(t,'action_status',esc(t.action_status),'status-badge '+keys[t.action_status])+(isOverdue(t)?'<span class="status-badge blocked">Overdue</span>':''):badge(t);
 const selected=state.focus.includes(t.id);
 const focus=todo?`<button class="todo-focus" data-focus="${taskId}" aria-pressed="${selected}" aria-label="${selected?'Remove from':'Add to'} My Day: ${esc(t.title)}" ${!state.canWrite?'disabled':''}>${workspaceIcon('pin')}</button>`:'';
 return `<article class="row compact-row ${quick?'aligned-task-row':''} ${todo?'todo-task-row':''} ${readOnly?'review-row':''}">
 ${!readOnly?`<input type="checkbox" data-complete="${taskId}" aria-label="Complete ${esc(t.title)}" ${t.done?'checked':''} ${!state.canWrite||t.paused?'disabled':''}>`:''}
 <div class="task-main">${name}
 ${quick?taskStepControl(t):''}
 ${context?`<div class="sub row-context">${esc(context)}</div>`:''}
 ${t.review_flags?.length?`<button class="needs-checking" data-edit="${taskId}" title="${esc('Imported information: '+t.review_flags.join('; '))}">Needs Checking</button>`:''}
 ${t.is_todo&&(!todo||repeat)?`<div class="sub row-context todo-context">${todo?esc(repeat.slice(3)):'General To Do'+esc(repeat)}</div>`:''}
 </div>
 <div class="task-meta">
 <div class="task-owner"><span class="mobile-field-label">Owner</span>${quick?quickTaskField(t,'assignee',owner):owner}</div>
 <div class="task-state">${quick?'<span class="mobile-field-label">Status</span>':''}${status}${t.paused?'<span class="status-badge waiting">Paused</span>':''}${t.skipped?'<span class="status-badge idle">Skipped</span>':''}</div>
 <div class="task-date ${isOverdue(t)?'date-overdue':''}"><span class="mobile-field-label">Due date</span>${quick?quickTaskField(t,'due_date',due):due}${state.view==='waiting'&&t.waiting_on?`<small>Waiting on ${esc(t.waiting_on)}</small>`:''}${state.view==='waiting'&&t.follow_up_date?`<small>Follow-up ${esc(t.follow_up_date)}</small>`:''}</div>
 </div>
 ${!readOnly?`<div class="task-row-actions">${focus}<details class="row-more">
 <summary aria-label="Options for task ${esc(t.title)}" title="Task options">${workspaceIcon('more')}</summary>
 <div class="row-menu">
 <button data-edit="${taskId}">Edit task</button>
 <button data-details="${taskId}">Checklist & links</button>
 ${t.is_todo?`<button data-edit="${taskId}">Move to project / repeat</button>`:`<button data-convert="${taskId}" ${!state.canWrite?'disabled':''}>${t.item_type==='Milestone'?'Make Task':'Make Milestone'}</button>`}
 ${myDayMenuAction(t)}
 <button data-delete-task="${taskId}" ${!state.canWrite?'disabled':''}>Delete ${t.is_todo?'To Do':t.item_type==='Milestone'?'milestone':'task'}</button>
 </div></details></div>`:''}
 ${quick?`<section id="task-preview-${taskId}" class="task-preview" aria-label="Task preview" aria-live="polite" hidden></section>`:''}
 </article>`;
}
let taskPreviewRequest=0;
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-task-preview]');
 if(!button)return;
 const panel=document.getElementById(button.getAttribute('aria-controls'));
 if(!panel)return;
 const open=panel.hidden;
 const request=++taskPreviewRequest;
 for(const other of document.querySelectorAll('[data-task-preview][aria-expanded="true"]')){
  other.setAttribute('aria-expanded','false');
  document.getElementById(other.getAttribute('aria-controls')).hidden=true;
 }
 if(!open)return;
 button.setAttribute('aria-expanded','true');
 panel.hidden=false;
 panel.textContent='Loading task…';
 try{
  const task=await api('/api/tasks/'+encodeURIComponent(button.dataset.taskPreview));
  if(request!==taskPreviewRequest||!panel.isConnected)return;
  const details=task.details?.body||{};
  const checklist=details.checklist||[];
  const links=(details.links||[]).filter(link=>/^https?:\/\/[^/]/i.test(link.url));
  panel.innerHTML=`${task.notes?`<div class="task-preview-notes">${esc(task.notes)}</div>`:''}
  ${task.waiting_on?`<p><strong>Waiting on</strong> ${esc(task.waiting_on)}</p>`:''}
  ${checklist.length?`<h4>Checklist</h4><ul class="task-preview-checklist">${checklist.map(step=>`<li><span aria-label="${step.done?'Complete':'Open'}">${step.done?'☑':'☐'}</span> ${esc(step.text)}</li>`).join('')}</ul>`:''}
  ${links.length?`<h4>Links</h4><ul>${linksHTML(links)}</ul>`:''}
  ${!task.notes&&!task.waiting_on&&!checklist.length&&!links.length?'<p>No notes, checklist or links yet.</p>':''}`;
 }catch(error){
  if(request===taskPreviewRequest&&panel.isConnected)panel.textContent=error.message;
 }
});
function attentionData(rows,risks,day){const active=rows.filter(t=>!t.done&&!t.paused),week=isoDay(dateNumber(day)+7);return {overdue:active.filter(t=>t.due_date&&t.due_date<day),follow:active.filter(t=>t.follow_up_date&&t.follow_up_date<=day),waiting:active.filter(t=>['Waiting','Blocked'].includes(t.action_status)),dates:active.filter(t=>!t.due_date),milestones:active.filter(t=>t.item_type==='Milestone'&&t.due_date&&t.due_date>=day&&t.due_date<=week),risks:risks.filter(r=>r.status==='Open'&&r.severity>14)};}
function dashboard(rows){
 const scoped=selectedRows(),risks=(state.risks||[]).filter(r=>(!$('project').value||r.project_id===$('project').value)&&riskMatchesWorkstream(r,activeWorkstream(),state.streams)),a=attentionData(scoped,risks,today());
 const ranked=[...a.overdue,...a.follow,...a.waiting,...a.milestones,...a.dates],seen=new Set(),list=ranked.filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;}).slice(0,5);
 const cards=[['overdue','Overdue',a.overdue.length],['follow','Follow-ups Due',a.follow.length],['waiting','Waiting / Blocked',a.waiting.length],['risks','High Risks',state.riskError?'Unavailable':a.risks.length],['dates','Need Due Dates',a.dates.length],['milestones','Milestones This Week',a.milestones.length]];
 return `<section class="attention-panel"><div class="panel-heading"><h3>Needs Attention</h3><span class="sub">${today()} · ${activeWorkstream()?'Selected workstream · project-wide risks included':$('project').value?'This project':'All work, including general To Dos'}</span></div><div class="attention-cards">${cards.map(([key,label,count])=>`<button data-attention="${key}" ${key==='risks'&&state.riskError?'disabled':''}><strong>${count}</strong><span>${label}</span></button>`).join('')}</div><p class="sub">Overdue counts cover dated work. ${a.dates.length?a.dates.length+' open items still need a due date.':'All open items have due dates.'}</p><h3>Your Next Steps</h3>${list.length?taskColumnHeaders()+list.map(taskrow).join(''):'<p class="empty">No open work needs attention here. Choose another project or add a task.</p>'}${a.risks.slice(0,2).map(r=>`<button class="risk-attention" data-edit-risk="${esc(r.id)}">High Risk: ${esc(r.description)} · Severity ${r.severity}</button>`).join('')}</section><details class="dashboard-progress"><summary>Project Progress and Charts</summary><p class="sub">${rows.filter(t=>t.done).length} of ${rows.length} project items completed. Item counts include tasks and Milestones; they are not weighted by effort.</p>${chartsDashboard(rows)}</details>`;
}
function updateUX(){
 if(state.view==='export')updateExportPreview();
 const daily=['todo','day'].includes(state.view),project=daily?(state.view==='day'?state.dayProject||'':''):$('project').value;
 if(daily)$('workspaceTitle').textContent=state.view==='todo'?'General Tasks':'My Day';
 $('dayProjectWrap').hidden=state.view!=='day';if(state.view==='day'){$('projectFilterWrap').hidden=true;$('dayProject').value=state.dayProject||'';}
 $('savedViews').hidden=!['plan','waiting','next','completed'].includes(state.view);
 if(!$('savedViews').hidden){const presets=[['open','Open'],['all','All Items'],['done','Completed'],['waiting','Waiting'],['ready','Ready to Work'],['overdue','Overdue'],['dates','Need Dates']];$('savedViews').innerHTML=presets.map(([key,label])=>`<button data-preset="${key}" aria-pressed="${(state.taskPreset||'open')===key&&state.view==='plan'}">${label}</button>`).join('');}
 const chips=[];if(!$('workstreamFilterWrap').hidden&&activeWorkstream())chips.push('Workstream: '+(state.streams.find(s=>s.id===activeWorkstream())?.name||'No Workstream / Project-wide'));if(project)chips.push('Project: '+(state.projects.find(p=>p.id===project)?.name||project));if($('query').value.trim())chips.push('Search: '+$('query').value.trim());
 if(state.view==='plan'){if($('completionFilter').value!=='all')chips.push($('completionFilter').value==='open'?'Open Items':'Completed');if($('planFilter').value==='milestones')chips.push('Milestones Only');if(['waiting','ready','overdue','follow','dates','status'].includes(state.taskPreset))chips.push(({waiting:'Waiting',ready:'Ready to Work',overdue:'Overdue',follow:'Follow-ups Due',dates:'Need Due Dates',status:state.status})[state.taskPreset]);}
 $('filterContext').hidden=['notes','people'].includes(state.view)||!chips.length;$('filterContext').innerHTML=chips.map(s=>`<span>${esc(s)}</span>`).join('')+'<button data-clear-filters>Clear Filters</button>';
 document.querySelectorAll('.nav-group').forEach(group=>{if(group.querySelector('[aria-pressed="true"]'))group.open=true;});
 if(state.view==='todo'&&!document.querySelector('#content .row')){const any=state.rows.some(t=>t.is_todo);const empty=$('content').querySelector('.empty');if(empty&&any)empty.innerHTML='<h3>No Matching To Dos</h3><p>Your tasks are still saved. Change Show or clear the search to see them.</p><button data-reset-todo>Show All To Dos</button>';}
}
function formSignature(f){return JSON.stringify([...f.elements].filter(e=>['INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&e.type!=='file').map(e=>[e.id||e.name,e.type==='checkbox'?e.checked:e.value]));}
function prepareForm(f){if(!f)return;f.dataset.baseline=formSignature(f);let p=f.querySelector('.save-state');if(!p){p=node('p','No Unsaved Changes','save-state');p.setAttribute('aria-live','polite');const head=f.querySelector('header');head?head.after(p):f.prepend(p);}p.textContent='No Unsaved Changes';}
function refreshFormState(f){if(!f?.dataset.baseline)return;const p=f.querySelector('.save-state');if(p)p.textContent=formSignature(f)!==f.dataset.baseline?'Unsaved Changes':'No Unsaved Changes';}
function closeDialogSafely(dialog){const f=dialog.querySelector('form');if(f?.dataset.baseline&&formSignature(f)!==f.dataset.baseline){if(dialog.querySelector('.discard-confirm'))return false;const panel=node('section',undefined,'discard-confirm');panel.setAttribute('role','alert');panel.append(node('p','You have unsaved changes. Keep editing or discard them?'));const keep=node('button','Keep Editing');keep.type='button';keep.onclick=()=>{panel.remove();};const discard=node('button','Discard Changes');discard.type='button';discard.onclick=()=>{panel.remove();dialog.close();};panel.append(keep,discard);dialog.append(panel);keep.focus();return false;}dialog.close();return true;}

function humanEvent(e){const action={create_task:'Task Created',update_task:'Task Updated',create_todo:'To Do Created',update_todo:'To Do Updated',create_risk:'Risk Added',update_risk:'Risk Updated',save_document:'Details Updated',repeat_created:'Next Occurrence Created',skip_todo:'Occurrence Skipped',link_dependency:'Prerequisite Added',unlink_dependency:'Prerequisite Removed'}[e.action]||'Workspace Updated';const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(e.at));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} · ${e.summary||action} · ${e.actor?.startsWith('browser:')?'You':e.actor==='local-browser'?'You (Test Workspace)':'Connected App'}`;}
function offerUndo(message,action){announce('');const bar=$('undoBar');bar.replaceChildren(node('span',message));const b=node('button','Undo');b.onclick=async()=>{b.disabled=true;try{await action();bar.hidden=true;await loadProjects();await load();announce('Change Undone.');}catch(e){announce(e.message);b.disabled=false;}};const dismiss=node('button','Dismiss','secondary');dismiss.onclick=()=>{bar.hidden=true;};bar.append(b,dismiss);bar.hidden=false;}
function completionFeedback(){ /* Completion is shown by the checkbox and saved lists. */ }
function restoreRiskAction(risk){return api('/api/write',{kind:'update_risk',input:{risk_id:risk.id,expected_version:risk.version,changes:{archived:false}},operation_id:crypto.randomUUID()});}

async function confirmTaskDeletion(id){
 if(!state.canWrite)throw Error('This workspace is read-only.');
 const task=await api('/api/tasks/'+encodeURIComponent(id));if(task.archived)throw Error('This item is already deleted. Refresh the list.');
 const label=task.todo?.is_general?'To Do':task.item_type==='Milestone'?'milestone':'task',recurring=task.todo?.is_general&&task.todo.frequency!=='none',repeat=recurring&&!task.done&&!task.todo.next_task_id;
 toolsDialog('Delete '+label,`<form id="deleteTaskForm" data-id="${esc(task.id)}" data-version="${task.version}" data-operation="${crypto.randomUUID()}"><p>Delete <strong>${esc(task.title)}</strong>?</p><p>This removes it from your lists without marking it completed. The record, notes, checklist, links and history are retained for recovery. Use Undo after deleting to put it back.</p>${repeat?'<p>This also stops future repeats from this occurrence. Previous completed occurrences are kept.</p>':recurring?'<p>Only this occurrence is removed. Other occurrences are kept.</p>':''}<p>Items that other tasks depend on cannot be deleted until those links are removed.</p><div class="form-actions"><button type="button" data-cancel-task-delete>Cancel</button><button type="submit">Delete ${label}</button></div></form>`);queueMicrotask(()=>document.querySelector('#deleteTaskForm .save-state')?.remove());
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.deleteTask)confirmTaskDeletion(b.dataset.deleteTask).catch(error=>announce(error.message));if(b.hasAttribute('data-cancel-task-delete'))$('toolsDialog').close();});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='deleteTaskForm')return;e.preventDefault();const f=e.target,b=f.querySelector('[type="submit"]');b.disabled=true;
 try{if(!state.canWrite)throw Error('This workspace is read-only.');const r=await api('/api/write',{kind:'update_task',input:{task_id:f.dataset.id,expected_version:Number(f.dataset.version),changes:{archived:true}},operation_id:f.dataset.operation});$('toolsDialog').close();offerUndo('Deleted: '+r.record.title,()=>api('/api/write',{kind:'update_task',input:{task_id:r.record.id,expected_version:r.record.version,changes:{archived:false}},operation_id:'undo-'+f.dataset.operation}));try{await loadProjects();await load();}catch(error){announce('Deleted. The list could not refresh: '+error.message);}}
 catch(error){$('toolsError').textContent=error.message.replace('before archiving','before deleting');}finally{b.disabled=false;}
});
document.addEventListener('input',e=>{if(e.target.form)refreshFormState(e.target.form);if(e.target.name==='stepText'){const row=e.target.closest('[data-check-row]');row?.querySelector('[type=checkbox]')?.setAttribute('aria-label','Complete Step: '+e.target.value);}});
document.addEventListener('change',e=>{if(e.target.form)refreshFormState(e.target.form);if(e.target.id==='dayProject'){state.dayProject=e.target.value;render();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const d=document.querySelector('#toolsDialog[open]')||document.querySelector('dialog[open]');if(d&&d.id!=='caseTaskDialog'){e.preventDefault();closeDialogSafely(d);}}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='mobileMenu'){const shell=document.querySelector('.shell'),open=shell.classList.toggle('menu-open');b.setAttribute('aria-expanded',String(open));}if(b.dataset.preset)choosePreset(b.dataset.preset);if(b.hasAttribute('data-reset-todo')){state.todoFilter='all';$('query').value='';render();}if(b.hasAttribute('data-clear-filters')){state[state.view==='day'?'dayWorkstream':'workstream']='';if(state.view==='day'){state.dayProject='';$('dayProject').value='';}else if(state.view!=='todo')$('project').value='';$('query').value='';state.status='';state.taskPreset='all';$('planFilter').value='all';$('completionFilter').value='all';render();}if(b.dataset.attention){if(b.dataset.attention==='risks'){state.riskStatus='Open';state.riskSeverity='high';goView('risks');}else choosePreset(b.dataset.attention);}});
let sessionRenewal=null;
async function refreshSession(){
 if(sessionRenewal)return sessionRenewal;
 const token=sessionStorage.getItem('workspace.refresh'),client=sessionStorage.getItem('workspace.client');
 if(!token||!client)return false;
 sessionRenewal=(async()=>{
  try{
   const response=await fetch('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client,refresh_token:token,resource:location.origin})});
   const data=await response.json();
   if(!response.ok&&[400,401].includes(response.status)&&['invalid_grant','invalid_client','unauthorized_client'].includes(data.error)){
    sessionStorage.removeItem('workspace.refresh');
    return false;
   }
   if(!response.ok||!data.access_token)throw Error('Renewal failed.');
   sessionStorage.setItem('workspace.access',data.access_token);
   if(data.refresh_token)sessionStorage.setItem('workspace.refresh',data.refresh_token);
   return true;
  }catch{
   throw Error('The sign-in service is temporarily unavailable. Please retry.');
  }finally{sessionRenewal=null;}
 })();
 return sessionRenewal;
}
function linkRowHTML(l={title:'',url:''}){return `<div class="link-edit-row" data-link-row><label>Title<input name="linkTitle" maxlength="500" value="${esc(l.title)}"></label><label>Web Address<input name="linkUrl" type="url" maxlength="2000" placeholder="https://…" value="${esc(l.url)}"></label><button type="button" data-remove-link aria-label="Remove Link">Remove</button></div>`;}
function linkEditorHTML(links=[]){return `<section class="link-editor"><h3>Links</h3><div class="link-rows">${links.map(linkRowHTML).join('')}</div><button type="button" data-add-link>Add Link</button><p class="sub">Links open when selected. No documents are uploaded.</p></section>`;}
function checkRowHTML(c){return `<div class="check-edit-row" data-check-row data-step-id="${esc(c.id)}"><input type="checkbox" name="check" value="${esc(c.id)}" aria-label="Complete Step: ${esc(c.text)}" ${c.done?'checked':''}><label>Step<input name="stepText" maxlength="500" required value="${esc(c.text)}"></label><button type="button" data-remove-step>Remove Step</button></div>`;}
function taskDetailsHTML(task,b){return `<form id="detailsForm"><fieldset ${!state.canWrite?'disabled':''}><legend>Checklist and Links</legend><div class="check-rows">${(b.checklist||[]).map(checkRowHTML).join('')}</div><button type="button" data-add-step>Add Step</button><details><summary>Add Several Steps</summary><label>One Step per Line<textarea name="steps" rows="3" maxlength="16000"></textarea></label></details><ul class="saved-links">${linksHTML(b.links||[])}</ul>${linkEditorHTML(b.links||[])}<div class="form-actions"><button type="submit">Save Details</button><button type="button" data-save-as-template="${esc(task.id)}">Save as Template</button></div></fieldset></form>${task.todo?.is_general&&task.todo.frequency!=='none'&&!task.done?`<hr><h3>Repeating Routine</h3><p>Pause keeps this occurrence. Skip moves to the next scheduled occurrence.</p><button data-pause="${esc(task.id)}" ${!state.canWrite?'disabled':''}>${b.paused?'Resume Routine':'Pause Routine'}</button><button data-skip="${esc(task.id)}" ${b.paused||!state.canWrite?'disabled':''}>Skip This Occurrence</button>`:''}`;}
function getFormLinks(f){return [...f.querySelectorAll('[data-link-row]')].map(row=>({title:row.querySelector('[name=linkTitle]').value.trim(),url:row.querySelector('[name=linkUrl]').value.trim()})).filter(l=>l.title||l.url);}
function getFormChecklist(f){return [...f.querySelectorAll('[data-check-row]')].map(row=>({id:row.dataset.stepId,text:row.querySelector('[name=stepText]').value.trim(),done:row.querySelector('[type=checkbox]').checked})).concat((f.elements.steps?.value||'').split('\n').map(t=>t.trim()).filter(Boolean).map(text=>({id:crypto.randomUUID(),text,done:false})));}
function formDraftExtras(f){return {links:getFormLinks(f),checklist:f.id==='detailsForm'?[...f.querySelectorAll('[data-check-row]')].map(row=>({id:row.dataset.stepId,text:row.querySelector('[name=stepText]').value,done:row.querySelector('[type=checkbox]').checked})):null};}
function restoreFormExtras(f,d){const links=d.ui?.links||(d.values.some(([k])=>k==='links')?parseLinks(d.values.find(([k])=>k==='links')[1]):null);if(links&&f.querySelector('.link-rows'))f.querySelector('.link-rows').innerHTML=links.map(linkRowHTML).join('');if(d.ui?.checklist&&f.querySelector('.check-rows'))f.querySelector('.check-rows').innerHTML=d.ui.checklist.map(checkRowHTML).join('');}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const f=b.closest('form');if(b.hasAttribute('data-add-link')){b.closest('.link-editor').querySelector('.link-rows').insertAdjacentHTML('beforeend',linkRowHTML());refreshFormState(f);}if(b.hasAttribute('data-remove-link')){b.closest('[data-link-row]').remove();refreshFormState(f);}if(b.hasAttribute('data-add-step')){f.querySelector('.check-rows').insertAdjacentHTML('beforeend',checkRowHTML({id:crypto.randomUUID(),text:'',done:false}));refreshFormState(f);}if(b.hasAttribute('data-remove-step')){b.closest('[data-check-row]').remove();refreshFormState(f);}});
function initUX(){addNavigationIcons();document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{e.preventDefault();closeDialogSafely(d);}));api('/api/review').then(r=>{const n=r.flags.length+r.unmatched.length;$('reviewButton').textContent='Data to Check'+(n?' ('+n+')':'');}).catch(()=>{});}
document.addEventListener('change',e=>{if(e.target.id==='timelineCompletion'){state.timelineCompletion=e.target.value;render();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-cancel-dates]');if(!b)return;const f=b.closest('form');f.reset();const detail=f.closest('.quick-date-edit');if(detail)detail.open=false;else f.closest('dialog')?.close();});
document.addEventListener('toggle',e=>{const d=e.target;if(!d.classList?.contains('quick-date-edit')||!d.open)return;const others=[...document.querySelectorAll('.quick-date-edit[open]')].filter(x=>x!==d);if(others.some(x=>[...x.querySelectorAll('input')].some(i=>i.value!==i.defaultValue))){d.open=false;announce('Save or cancel the dates on the other item first.');return;}others.forEach(x=>{x.open=false;});},true);
function exportPreviewText(){const p=state.projects.find(x=>x.id===$('project').value),sid=$('exportWorkstream').value,stream=state.streams.find(s=>s.id===sid),project=p||state.projects.find(x=>x.id===stream?.project_id),items=state.rows.filter(t=>!t.is_todo&&(!project||t.project_id===project.id)&&(!sid||(sid==='__general'?!t.workstream_id:t.workstream_id===sid))),risks=(state.risks||[]).filter(r=>(!project||r.project_id===project.id)&&(!sid||!r.workstream_id||r.workstream_id===sid));return `${project?.name||'All Projects'}${sid?' › '+(stream?.name||'General'):''} · ${items.length} Items (${items.filter(t=>t.item_type==='Milestone').length} Milestones) · ${risks.length} Risks · ${$('exportLayout').value==='split'?'Separate Workstream Files in a ZIP':'One Excel File'}`;}
function updateExportPreview(){let p=$('exportScopePreview');if(!p){p=node('p',undefined,'export-scope-preview');p.id='exportScopePreview';p.setAttribute('role','status');$('exportPanel').querySelector('.export-options').after(p);}p.textContent=exportPreviewText();}
document.addEventListener('change',e=>{if(['exportWorkstream','exportLayout'].includes(e.target.id))updateExportPreview();});
document.addEventListener('toggle',e=>{if(e.target.classList?.contains('row-more')&&e.target.open)document.querySelectorAll('.row-more[open]').forEach(d=>{if(d!==e.target)d.open=false;});},true);
document.addEventListener('click',e=>{if(!e.target.closest('.row-more')||e.target.closest('.row-menu button'))document.querySelectorAll('.row-more[open]').forEach(d=>{d.open=false;});});
// Keep navigation collapsible without changing the editor or its draft state.

// Mobile has one menu control, independent of the saved desktop rail setting.
document.addEventListener('DOMContentLoaded',()=>{
 const button=$('mobileMenu'),nav=$('workspaceNav'),shell=document.querySelector('.shell'),mobile=matchMedia('(max-width:760px)');if(!button||!nav||!shell)return;
 let frame=0;
 const close=()=>{shell.classList.remove('menu-open');button.setAttribute('aria-expanded','false');};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(sync);};
 function sync(){
  frame=0;if(!mobile.matches)close();
  const open=mobile.matches&&shell.classList.contains('menu-open');
  button.textContent=open?'✕ Close menu':'☰ Menu';button.setAttribute('aria-label',open?'Close main menu':'Open main menu');button.setAttribute('aria-expanded',String(open));
  if(open){const top=Math.max(0,button.getBoundingClientRect().bottom),height=Math.max(0,(window.visualViewport?.height||innerHeight)-top-12);nav.style.setProperty('--mobile-nav-top',top+'px');nav.style.setProperty('--mobile-nav-height',height+'px');}
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('#mobileMenu')){if(shell.classList.contains('menu-open'))document.querySelector('.notes-mobile-sidebar-open')?.classList.remove('notes-mobile-sidebar-open');schedule();}
  else if(mobile.matches&&shell.classList.contains('menu-open')&&!nav.contains(e.target)){close();schedule();}
  else if(nav.contains(e.target))schedule();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&shell.classList.contains('menu-open')){close();schedule();button.focus();}});
 window.addEventListener('scroll',()=>{if(shell.classList.contains('menu-open'))schedule();},{passive:true});
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);mobile.addEventListener('change',schedule);new ResizeObserver(schedule).observe(button);schedule();
});
document.addEventListener('DOMContentLoaded',()=>{const nav=$('workspaceNav'),shell=document.querySelector('.shell');if(!nav||!shell)return;const b=document.createElement('button');b.dataset.navCollapse='';b.setAttribute('aria-controls','workspaceNav');function sync(){const collapsed=localStorage.getItem('workspace.nav-collapsed')==='true';shell.classList.toggle('nav-collapsed',collapsed);b.textContent=collapsed?'☰':'‹ Hide menu';b.setAttribute('aria-label',collapsed?'Show navigation':'Hide navigation');b.setAttribute('aria-expanded',String(!collapsed));}b.onclick=()=>{localStorage.setItem('workspace.nav-collapsed',String(!shell.classList.contains('nav-collapsed')));sync();};nav.prepend(b);sync();});


function taskNoteButton(task){
 return `<button type="button" class="task-note-button" data-task-notes="${esc(task.id)}" aria-label="Notes for ${esc(task.title)}" title="Notes">${workspaceIcon('notes')}</button>`;
}
function stepLabel(task){
 return task.step_count?`${task.step_done} of ${task.step_count} steps`:(state.canWrite?'Add step':'Steps');
}
function taskStepControl(task){
 const id=esc(task.id);
 return `<button type="button" class="inline-steps-toggle" data-task-steps="${id}" aria-expanded="false" aria-controls="steps-${id}">${stepLabel(task)}</button>
 <section id="steps-${id}" data-inline-steps class="inline-steps" aria-label="Steps for ${esc(task.title)}" hidden></section>`;
}
const noteDate=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
function renderTaskNotePanel(task,detail,editing){
 const notes=detail?.body.taskNotes||[];
 const legacy=editing?.legacy===true;
 const assignedDate=detail?.body.legacyNoteDate;
 const originalDate=assignedDate
  ?`<time datetime="${esc(assignedDate)}">${esc(assignedDate)}</time> · Assigned date`
  :'Existing note · Date unavailable';
 const bubbles=[task.notes?`<article class="task-note-bubble"><div class="task-note-meta"><span>${originalDate}</span>${state.canWrite?`<span class="task-note-actions"><button type="button" data-edit-legacy-note>Edit</button><button type="button" data-delete-legacy-note>Delete</button></span>`:''}</div><p>${esc(task.notes)}</p></article>`:'',...notes.slice().reverse().map(note=>
  `<article class="task-note-bubble"><div class="task-note-meta"><span><time datetime="${esc(note.createdAt)}">${noteDate.format(new Date(note.createdAt))}</time>${note.editedAt?` · Edited ${noteDate.format(new Date(note.editedAt))}`:''}</span>${state.canWrite?`<span class="task-note-actions"><button type="button" data-edit-task-note="${esc(note.id)}" aria-label="Edit note dated ${noteDate.format(new Date(note.createdAt))}">Edit</button><button type="button" data-delete-task-note="${esc(note.id)}" aria-label="Delete note dated ${noteDate.format(new Date(note.createdAt))}">Delete</button></span>`:''}</div><p>${esc(note.text)}</p></article>`)].join('');
 return `${bubbles||'<p>No notes yet.</p>'}${state.canWrite?`<form id="taskNoteForm" data-id="${esc(task.id)}" data-version="${detail?.version||0}" data-note-id="${esc(editing?.id||crypto.randomUUID())}" data-edit="${legacy?'legacy':!!editing}" data-task-version="${task.version}">
 <label>${editing?'Edit note':'New note'}<textarea name="text" rows="3" required maxlength="${legacy?16000:4000}">${esc(editing?.text||'')}</textarea></label>
 <div class="form-actions"><button type="submit">${editing?'Save changes':'Add note'}</button>${editing?'<button type="button" data-cancel-task-note>Cancel edit</button>':''}</div></form>`:''}`;
}
let taskNoteContext;
async function openTaskNotes(id){
 const key=encodeURIComponent(id);
 const [task,detail]=await Promise.all([api('/api/tasks/'+key),api('/api/details?task_notes=1&id='+key)]);
 taskNoteContext={task,detail};
 toolsDialog('Notes for '+task.title,renderTaskNotePanel(task,detail));
}
function showTaskNoteEditor(editing){
 const {task,detail}=taskNoteContext;
 const d=$('toolsDialog');
 d.querySelector('header + div').innerHTML=renderTaskNotePanel(task,detail,editing);
 $('toolsError').textContent='';
 const f=$('taskNoteForm');
 if(f){prepareForm(f);f.elements.text.focus();}
}
async function deleteTaskBubble(button){
 const form=$('taskNoteForm');
 if(!state.canWrite||state.busy||!form)return;
 if(formSignature(form)!==form.dataset.baseline){
  $('toolsError').textContent='Save or discard your note edits before deleting a note.';
  return;
 }
 if(!window.confirm('Delete this note?'))return;
 const {task,detail}=taskNoteContext;
 const legacy=button.hasAttribute('data-delete-legacy-note');
 state.busy=true;
 button.disabled=true;
 try{
  if(legacy){
   const {record}=await api('/api/write',{kind:'update_task',input:{task_id:task.id,expected_version:task.version,changes:{notes:''}},operation_id:crypto.randomUUID()});
   taskNoteContext.task={...task,...record};
   taskNoteContext.detail=await api('/api/details?task_notes=1&id='+encodeURIComponent(task.id));
   await load();
  }else{
   const noteId=button.dataset.deleteTaskNote;
   const {record}=await api('/api/write',{kind:'delete_task_note',input:{id:task.id,note_id:noteId,expected_version:detail.version},operation_id:crypto.randomUUID()});
   taskNoteContext.detail={...record,body:{...record.body,legacyNoteDate:detail.body.legacyNoteDate,taskNotes:detail.body.taskNotes.filter(note=>note.id!==noteId)}};
  }
  showTaskNoteEditor();
 }catch(error){$('toolsError').textContent=error.message;}
 finally{state.busy=false;button.disabled=false;}
}
const inlineStepDetails=new WeakMap();
function showInlineSteps(panel,detail){
 inlineStepDetails.set(panel,detail);
 const steps=detail?.body.checklist||[];
 panel.innerHTML=`<ul>${steps.map(step=>`<li><label><input type="checkbox" data-inline-step="${esc(step.id)}" ${step.done?'checked':''} ${state.canWrite?'':'disabled'}> ${esc(step.text)}</label></li>`).join('')}</ul>`
 + (state.canWrite?`<form data-inline-step-form><label class="sr-only" for="${panel.id}-new">New step</label><input id="${panel.id}-new" name="step" placeholder="New step" maxlength="500" required><button type="submit">Add</button></form>`:steps.length?'':'<p>No steps yet.</p>')
 + '<p class="inline-step-error" role="status"></p>';
}
async function saveInlineSteps(panel,change){
 if(!state.canWrite||panel.dataset.saving)return;
 const id=panel.id.slice('steps-'.length), detail=inlineStepDetails.get(panel);
 const checklist=(detail?.body.checklist||[]).map(step=>({...step}));
 const controls=[...panel.querySelectorAll('input,button')];
 const status=panel.querySelector('.inline-step-error');
 panel.dataset.saving='true';
 controls.forEach(control=>control.disabled=true);
 try{
  change(checklist);
  const {record}=await api('/api/write',{kind:'save_document',input:{id,kind:'task',expected_version:detail?.version||0,body:{...detail?.body,checklist}},operation_id:crypto.randomUUID()});
  const task=state.rows.find(t=>t.id===id);
  if(task){
   task.step_count=record.body.checklist.length;
   task.step_done=record.body.checklist.filter(step=>step.done).length;
   const toggle=panel.parentElement?.querySelector('[data-task-steps]');
   if(toggle)toggle.textContent=stepLabel(task);
  }
  showInlineSteps(panel,record);
  if(panel.closest('#caseTaskDialog')&&state.view==='case')render();
 }catch(error){
  for(const checkbox of panel.querySelectorAll('[data-inline-step]'))checkbox.checked=!!detail?.body.checklist.find(step=>step.id===checkbox.dataset.inlineStep)?.done;
  status.textContent=error.message;
 }finally{
  delete panel.dataset.saving;
  controls.forEach(control=>control.disabled=!state.canWrite);
 }
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');
 if(!button)return;
 if(button.dataset.taskNotes){
  button.disabled=true;
  try{await openTaskNotes(button.dataset.taskNotes);$('toolsDialog').dataset.caseNoteDialog='true';if(button.hasAttribute('data-case-note-add'))$('taskNoteForm')?.elements.text.focus();}catch(error){announce(error.message);}finally{button.disabled=false;}
 }else if(button.dataset.deleteTaskNote||button.hasAttribute('data-delete-legacy-note')){
  await deleteTaskBubble(button);
 }else if(button.dataset.editTaskNote||button.hasAttribute('data-cancel-task-note')||button.hasAttribute('data-edit-legacy-note')){
  const form=$('taskNoteForm');
  if(state.busy||!form)return;
  if(formSignature(form)!==form.dataset.baseline&&!window.confirm('Discard your unsaved note changes?'))return;
  showTaskNoteEditor(button.hasAttribute('data-edit-legacy-note')
   ?{legacy:true,text:taskNoteContext.task.notes}
   :taskNoteContext.detail?.body.taskNotes?.find(note=>note.id===button.dataset.editTaskNote));
 }else if(button.dataset.taskSteps){
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  if(panel.dataset.saving)return;
  if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
  panel.hidden=false;button.setAttribute('aria-expanded','true');panel.textContent='Loading steps…';
  try{
   const detail=await api('/api/details?id='+encodeURIComponent(button.dataset.taskSteps));
   if(!panel.hidden&&panel.isConnected){
    showInlineSteps(panel,detail);
   }
  }catch(error){panel.textContent=error.message;}
 }
});
document.addEventListener('change',event=>{
 const checkbox=event.target;
 if(!checkbox.dataset.inlineStep)return;
 saveInlineSteps(checkbox.closest('[data-inline-steps]'),steps=>{
  steps.find(step=>step.id===checkbox.dataset.inlineStep).done=checkbox.checked;
 });
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(form.hasAttribute('data-inline-step-form')){
  event.preventDefault();
  const value=form.elements.step.value.trim();
  await saveInlineSteps(form.closest('[data-inline-steps]'),steps=>{
   if(!value)throw Error('Enter a step.');
   const field=form.elements.step;
   if(field.dataset.value!==value){field.dataset.value=value;field.dataset.stepId=crypto.randomUUID();}
   steps.push({id:field.dataset.stepId,text:value,done:false});
  });
  return;
 }
 if(form.id!=='taskNoteForm')return;
 event.preventDefault();
 if(!state.canWrite||state.busy)return;
 const data=form.dataset,button=form.querySelector('[type=submit]');
 state.busy=true;button.disabled=true;
 try{
  const text=form.elements.text.value.trim();
  if(!text)throw Error('Enter a note.');
  if(data.edit==='legacy'){
   const {record}=await api('/api/write',{kind:'update_task',input:{task_id:data.id,expected_version:Number(data.taskVersion),changes:{notes:text}},operation_id:crypto.randomUUID()});
   taskNoteContext.task={...taskNoteContext.task,...record};
   await load();
   showTaskNoteEditor();
   return;
  }
  const {record}=await api('/api/write',{kind:'save_task_note',input:{id:data.id,note_id:data.noteId,edit:data.edit==='true',expected_version:Number(data.version),text},operation_id:crypto.randomUUID()});
  const notes=taskNoteContext.detail?.body.taskNotes||[];
  const index=notes.findIndex(note=>note.id===data.noteId);
  const note={...record.note,text};
  if(index<0)notes.push(note);else notes[index]=note;
  taskNoteContext.detail={...record,body:{...record.body,legacyNoteDate:taskNoteContext.detail?.body.legacyNoteDate,taskNotes:notes}};
  showTaskNoteEditor();
 }catch(error){$('toolsError').textContent=error.message;}finally{state.busy=false;button.disabled=false;}
});
