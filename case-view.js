'use strict';

let caseTask=null;
let caseDrawerTrigger=null;
let caseDrawerScroll=0;

function projectList(projects){
 const items=projects.map(project=>{
  const milestone=project.next_milestone;
  return `<li><button type="button" class="case-link" data-open-project="${esc(project.id)}">${esc(project.name)}</button>
    <span>${milestone?`${esc(milestone.title)} · <time datetime="${esc(milestone.due_date)}">${esc(milestone.due_date)}</time>`:'No dated open milestone'}</span></li>`;
 }).join('');
 return `<section class="case-card project-list"><div class="case-heading"><h3>Projects</h3><span>Next milestone</span></div>
   ${items?`<ul>${items}</ul>`:'<p>No projects yet.</p>'}</section>`;
}

async function loadProjectInformation(panel,projectId){
 try{
  const {information={}}=await api('/api/project?'+new URLSearchParams({id:projectId}));
  if(!panel.isConnected)return;
  const fields={purpose:'Purpose',sponsor_or_approver:'Sponsor or approver',phase:'Phase',scope_in:'In scope',scope_out:'Out of scope',success_measures:'Success measures'};
  const sources=(information.key_sources||[]).map(source=>`<li><a href="${esc(source.link)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a></li>`).join('');
  panel.innerHTML=`<dl class="case-facts project-information">
   ${Object.entries(fields).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(information[key]||'Not set')}</dd></div>`).join('')}
   <div><dt>Key sources</dt><dd>${sources?`<ul>${sources}</ul>`:'None added'}</dd></div>
  </dl>`;
 }catch(error){
  if(panel.isConnected)panel.replaceChildren(node('p',error.message));
 }
}

function renderCaseView(project){
 const content=$('content');
 if(!project){
  content.innerHTML=projectList(state.projects);
  return;
 }
 const all=state.rows.filter(task=>task.project_id===project.id&&!task.is_todo);
 const rows=scopedRows(all,'case',project.id,'',$('query').value);
 const actions=rows.filter(task=>!task.done).sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.title.localeCompare(b.title));
 const follow=all.filter(task=>!task.done&&(task.follow_up_date||task.due_date))
  .sort((a,b)=>(a.follow_up_date||a.due_date).localeCompare(b.follow_up_date||b.due_date))[0];
 const recent=all.filter(task=>task.done&&task.completed_on&&!task.skipped)
  .sort((a,b)=>b.completed_on.localeCompare(a.completed_on)).slice(0,5);
 const keptNotes=$('caseNotesList')?.dataset.project===project.id?$('caseNotesList'):null;
 content.innerHTML=`
 <section class="case-overview case-card">
  <h3>Overview</h3>
  ${project.description?`<p class="case-description">${esc(project.description)}</p>`:''}
  <dl class="case-facts"><div><dt>Project status</dt><dd>${esc(project.status)}</dd></div>
  <div><dt>Next follow-up</dt><dd>${follow?`<time>${esc(follow.follow_up_date||follow.due_date)}</time> · <button type="button" class="case-link" data-case-task="${esc(follow.id)}">${esc(follow.title)}</button>`:'No dated actions'}</dd></div>
  <div><dt>Open actions</dt><dd>${all.filter(task=>!task.done).length}</dd></div></dl>
 </section>
 <section class="case-card"><h3>Project information</h3><div id="caseProjectInformation"><p class="sub">Loading project information…</p></div></section>
 <div class="case-columns">
  <section class="case-card">
   <div class="case-heading"><h3>Notes</h3>${state.canWrite?`<button type="button" class="primary" data-case-new-note="${esc(project.id)}">＋ Add note</button>`:''}</div>
   <div id="caseNotesList" data-project="${esc(project.id)}" aria-live="polite"><p class="sub">Loading notes…</p></div>
  </section>
  <section class="case-card">
   <div class="case-heading"><h3 id="caseActionsHeading" tabindex="-1">Actions</h3>${state.canWrite?'<button type="button" class="primary" data-case-add-task>＋ Add action</button>':''}</div>
   ${pageRows(actions).map(caseAction).join('')||'<p class="sub">No open actions to show.</p>'}
  </section>
 </div>
 ${recent.length?`<section class="case-card case-activity"><h3>Recent activity</h3><ul>${recent.map(task=>`<li><time>${esc(completionDate(task.completed_on))}</time> · <button type="button" class="case-link" data-case-task="${esc(task.id)}">${esc(task.title)}</button> completed</li>`).join('')}</ul></section>`:''}`;
 if(keptNotes){
  $('caseNotesList').replaceWith(keptNotes);
  if(Date.now()-Number(keptNotes.dataset.loadedAt||0)>50000&&!keptNotes.dataset.loading)void loadCaseNotes(keptNotes);
 }else void loadCaseNotes($('caseNotesList'));
 void loadProjectInformation($('caseProjectInformation'),project.id);
}

function caseAction(task){
 return `<article class="case-action">
 <input type="checkbox" data-complete="${esc(task.id)}" aria-label="Complete ${esc(task.title)}" ${!state.canWrite||task.paused?'disabled':''}>
 <div><button type="button" class="case-link case-action-title" data-case-task="${esc(task.id)}">${esc(task.title)}</button>
 <p class="sub">${[task.assignee,task.due_date?'Due '+task.due_date:''].filter(Boolean).map(esc).join(' · ')}</p>
 <div class="case-action-meta">${badge(task)}${task.step_count?`<button type="button" class="case-link case-step-progress" data-case-task="${esc(task.id)}">${task.step_done} of ${task.step_count} steps</button>`:''}</div></div>
 ${taskNoteButton(task)}
 </article>`;
}

async function caseNotePages(path,params){
 const items=[];
 let after='';
 do{
  const page=await api(path+'?'+new URLSearchParams({...params,after_id:after}));
  items.push(...page.items);
  if(!page.has_more)return items;
  after=page.next_after_id;
 }while(after);
 return items;
}

const caseNoteRequests=new WeakMap();
async function loadCaseNotes(panel,limit=Number(panel.dataset.limit||15)){
 const request=Symbol();
 caseNoteRequests.set(panel,request);
 panel.dataset.loading='true';
 try{
  const project_id=panel.dataset.project;
  const [pages,taskNotes]=await Promise.all([
   caseNotePages('/api/notes',{project_id}),
   api('/api/project-task-notes?'+new URLSearchParams({project_id,limit:String(limit)}))
  ]);
  if(caseNoteRequests.get(panel)!==request)return;
  const project=state.projects.find(item=>item.id===project_id);
  const notes=[
   ...pages.map(page=>({date:page.meeting_when||page.updated_at,source:project?.name,excerpt:page.excerpt,label:page.title,url:'/?note='+encodeURIComponent(page.id)})),
   ...taskNotes.items.map(note=>({date:note.date,assigned:note.legacy&&note.date,source:note.title,excerpt:note.excerpt,task:note.task_id}))
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  panel.innerHTML=`<ol class="case-notes">${notes.slice(0,limit).map(note=>`<li>
   <p class="sub">${note.date?`<time>${esc(note.date.slice(0,10))}</time>`:'Date unavailable'}${note.assigned?' · Assigned date':''} · ${esc(note.source||'Project')}</p>
   ${note.url?`<a href="${esc(note.url)}" target="_blank" rel="noopener" title="Opens in a new tab">${esc(note.label)}</a>`:''}
   ${note.excerpt?`<p class="case-excerpt">${esc(note.excerpt)}</p>`:''}
   ${note.task?`<button type="button" class="case-link" data-task-notes="${esc(note.task)}">Open notes<span class="sr-only"> for ${esc(note.source)}</span></button>`:''}
  </li>`).join('')}</ol>${notes.length?'':'<p class="sub">No notes linked to this project.</p>'}
  ${(notes.length>limit||taskNotes.has_more)&&limit<250?'<button type="button" data-case-more-notes>Show more notes</button>':''}
  ${taskNotes.has_more&&limit===250?'<p class="sub">Most recent notes shown. Open the task or Notes to see older entries.</p>':''}`;
  panel.dataset.limit=limit;
  panel.dataset.loadedAt=Date.now();
 }catch(error){
  if(caseNoteRequests.get(panel)!==request)return;
  panel.replaceChildren(node('p',error.message),node('button','Retry notes'));
  panel.lastElementChild.dataset.caseRetryNotes='true';
 }finally{if(caseNoteRequests.get(panel)===request)delete panel.dataset.loading;}
}

function refreshCaseNotes(){
 const panel=$('caseNotesList');
 if(state.view==='case'&&panel)void loadCaseNotes(panel);
}

async function openCaseNoteComposer(projectId){
 const project=state.projects.find(p=>p.id===projectId);
 if(!project||!state.canWrite)throw Error('Choose a project you can edit.');
 const folders=await caseNotePages('/api/note-folders',{});
 const books=folders.filter(folder=>folder.kind==='notebook').sort((a,b)=>a.title.localeCompare(b.title));
 toolsDialog('Add note · '+project.name,`<form id="caseNoteForm" data-id="${esc(projectId)}">
 <label>Title<input name="title" maxlength="500" required></label>
 <label>Note<textarea name="text" rows="6" maxlength="12000" required></textarea></label>
 ${books.length?`<label>Save to<select name="location">${books.map(book=>`<option value="book:${esc(book.id)}">${esc(book.title)} / General</option>${folders.filter(item=>item.parent_id===book.id&&item.kind==='section').sort((a,b)=>a.title.localeCompare(b.title)).map(section=>`<option value="section:${esc(section.id)}">${esc(book.title)} / ${esc(section.title)}</option>`).join('')}`).join('')}</select></label>`:'<p class="sub">Saved in a Notes notebook in the General section.</p>'}
 <div class="form-actions"><button type="submit" class="primary">Save note</button></div></form>`);
}

function closeCaseDrawer(dialog){
 const steps=dialog.querySelector('[data-inline-steps]');
 if(state.busy||steps?.dataset.saving)return false;
 if(steps?.querySelector('[name=step]')?.value.trim()&&!window.confirm('Discard the step you have not added?'))return false;
 return closeDialogSafely(dialog);
}

function caseDrawer(){
 let dialog=$('caseTaskDialog');
 if(dialog)return dialog;
 dialog=node('dialog',undefined,'case-task-dialog');
 dialog.id='caseTaskDialog';
 dialog.setAttribute('aria-labelledby','caseTaskTitle');
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeCaseDrawer(dialog);});
 dialog.addEventListener('close',()=>{
  if(dialog.open)return;
  const trigger=caseDrawerTrigger?.isConnected?caseDrawerTrigger:[...document.querySelectorAll('[data-case-task]')].find(button=>button.dataset.caseTask===caseTask?.id);
  if(state.view==='case')window.scrollTo({top:caseDrawerScroll,behavior:'instant'});
  (trigger||$('caseActionsHeading'))?.focus({preventScroll:true});
  caseTask=null;
  caseDrawerTrigger=null;
 });
 document.body.append(dialog);
 return dialog;
}

function caseChecklistDetail(detail){
 if(!detail)return null;
 const {taskNotes,legacyNoteDate,...body}=detail.body;
 return {...detail,body};
}

function caseTaskNotePreview(task,detail){
 const notes=(detail?.body.taskNotes||[]).slice(-2).reverse();
 const preview=notes.map(note=>({date:noteDate.format(new Date(note.createdAt)),text:note.text}));
 if(task.notes)preview.push({date:detail?.body.legacyNoteDate?detail.body.legacyNoteDate+' · Assigned date':'Date unavailable',text:task.notes});
 return preview.map(note=>`<article class="task-note-bubble"><p class="sub">${esc(note.date)}</p><p class="case-excerpt">${esc(note.text.slice(0,240))}${note.text.length>240?'…':''}</p></article>`).join('')||'<p class="sub">No notes yet.</p>';
}

const caseTaskFields=['action_status','due_date','assignee','waiting_on','assignee_person_id','waiting_on_person_id'];

async function renderCaseTaskDrawer(task,detail){
 const dialog=caseDrawer(),disabled=state.canWrite?'':'disabled';
 dialog.innerHTML=`
 <header><div><p class="sub">${esc(state.projects.find(project=>project.id===task.project_id)?.name||'')}</p><h2 id="caseTaskTitle">${esc(task.title)}</h2></div><button type="button" class="workspace-close" data-case-close aria-label="Close">${workspaceIcon('close')}</button></header>
 <div class="case-task-body">
 <form id="caseTaskForm">
  <div class="case-drawer-fields">
   <label>Status<select name="action_status" ${disabled}>${statuses.map(status=>`<option ${status===task.action_status?'selected':''}>${status}</option>`).join('')}</select></label>
   <label>Due date<input type="date" name="due_date" value="${esc(task.due_date||'')}" ${disabled}></label>
   <label>Owner<input name="assignee" maxlength="500" value="${esc(task.assignee||'')}" ${disabled}></label>
   <label>Link assignee to a person<select name="assignee_person_id" id="caseAssigneePerson" ${disabled}></select></label>
   <label>Waiting on<input name="waiting_on" maxlength="500" value="${esc(task.waiting_on||'')}" ${disabled}></label>
   <label>Link waiting on to a person<select name="waiting_on_person_id" id="caseWaitingPerson" ${disabled}></select></label>
  </div>
  <div class="case-heading case-task-commands">
   <button type="button" data-case-full-edit ${disabled}>More task details</button>
  </div>
 </form>
 <p id="caseTaskError" role="status"></p>
 <section class="case-task-section"><h3>Steps</h3><section id="steps-${esc(task.id)}" class="inline-steps" data-inline-steps></section></section>
 <section class="case-task-section"><div class="case-heading"><h3>Notes</h3><div class="case-note-buttons">
 <button type="button" data-task-notes="${esc(task.id)}">Open notes</button>
 ${state.canWrite?`<button type="button" data-task-notes="${esc(task.id)}" data-case-note-add>＋ Add note</button>`:''}</div></div>
 <div id="caseTaskNotes">${caseTaskNotePreview(task,detail)}</div></section>
 </div>
 ${state.canWrite?`<footer class="case-task-footer">${task.done?'':'<button type="button" data-case-complete>Mark complete</button>'}
 <button type="submit" form="caseTaskForm" class="primary" data-case-save>Save changes</button></footer>`:''}`;
 showInlineSteps(dialog.querySelector('[data-inline-steps]'),caseChecklistDetail(detail));
 await WorkspacePeople.taskPickers(task,{assignee_person_id:'caseAssigneePerson',waiting_on_person_id:'caseWaitingPerson'});
 prepareForm($('caseTaskForm'));
}

async function openCaseTask(id,trigger=null){
 const key=encodeURIComponent(id);
 const [task,detail]=await Promise.all([api('/api/tasks/'+key),api('/api/details?task_notes=1&id='+key)]);
 if(state.view!=='case'||$('project').value!==task.project_id||task.archived)return false;
 caseTask=task;
 caseDrawerTrigger=trigger;
 await renderCaseTaskDrawer(task,detail);
 const dialog=caseDrawer();
 if(!dialog.open){caseDrawerScroll=window.scrollY;dialog.showModal();}
 dialog.querySelector('[data-case-close]').focus({preventScroll:true});
 return true;
}

async function syncCaseDrawerNotes(){
 if(!$('caseTaskDialog')?.open||!caseTask)return;
 const original=caseTask,key=encodeURIComponent(original.id);
 try{
  const [task,detail]=await Promise.all([api('/api/tasks/'+key),api('/api/details?task_notes=1&id='+key)]);
  if(!$('caseTaskDialog').open||caseTask!==original)return;
  $('caseTaskNotes').innerHTML=caseTaskNotePreview(task,detail);
  const panel=$('caseTaskDialog').querySelector('[data-inline-steps]');
  if(!panel.dataset.saving){
   const draft=panel.querySelector('[name=step]')?.value;
   showInlineSteps(panel,caseChecklistDetail(detail));
   if(draft)panel.querySelector('[name=step]').value=draft;
  }
  if(caseTaskFields.every(field=>task[field]===original[field]))caseTask=task;
 }catch(error){if($('caseTaskDialog').open)$('caseTaskError').textContent=error.message;}
}

function captureCaseTaskDraft(pendingWrite){
 const form=$('caseTaskForm');
 try{
  sessionStorage.setItem('workspace.draft',JSON.stringify({kind:'case-task',taskId:caseTask.id,version:caseTask.version,project:caseTask.project_id,values:Object.fromEntries(new FormData(form)),pendingWrite,at:Date.now()}));
  return true;
 }catch{return false;}
}

async function restoreCaseTaskDraft(draft){
 if(!Number.isFinite(draft.at)||Date.now()-draft.at>3600000){sessionStorage.removeItem('workspace.draft');return;}
 if(draft.pendingWrite)writeAttempts.prepare(draft.pendingWrite);
 state.view='case';
 $('project').value=draft.project;
 render();
 if(!await openCaseTask(draft.taskId))throw Error('This task moved. Your draft is still in this tab.');
 const form=$('caseTaskForm');
 for(const field of caseTaskFields)if(Object.hasOwn(draft.values,field))form.elements[field].value=draft.values[field]||'';
 caseTask.version=draft.version;
 refreshFormState(form);
 $('caseTaskError').textContent='Draft restored. Saving will check for changes made during sign-in.';
 sessionStorage.removeItem('workspace.draft');
}

document.addEventListener('click',async event=>{
 const button=event.target.closest('button');
 if(!button)return;
 try{
  if(button.dataset.caseTask){
   button.disabled=true;
   try{await openCaseTask(button.dataset.caseTask,button);}finally{button.disabled=false;}
  }else if(button.hasAttribute('data-case-add-task')&&state.canWrite)await edit();
  else if(button.dataset.caseNewNote)await openCaseNoteComposer(button.dataset.caseNewNote);
  else if(button.hasAttribute('data-case-more-notes'))await loadCaseNotes($('caseNotesList'),Math.min(250,Number($('caseNotesList').dataset.limit)+15));
  else if(button.hasAttribute('data-case-retry-notes'))refreshCaseNotes();
  else if(button.hasAttribute('data-case-close'))closeCaseDrawer(caseDrawer());
  else if(button.hasAttribute('data-case-complete')&&!state.busy&&state.canWrite){
   const form=$('caseTaskForm');
   form.elements.action_status.value='Completed';
   refreshFormState(form);
   form.requestSubmit(caseDrawer().querySelector('[data-case-save]'));
  }
  else if(button.hasAttribute('data-case-full-edit')&&!state.busy){
   const id=caseTask.id;
   if(closeCaseDrawer(caseDrawer()))await edit(id);
  }
 }catch(error){announce(error.message);}
});

document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!['caseTaskForm','caseNoteForm'].includes(form.id))return;
 event.preventDefault();
 if(state.busy||!state.canWrite)return;
 const data=new FormData(form),isTask=form.id==='caseTaskForm';
 const errorNode=$(isTask?'caseTaskError':'toolsError');
 state.busy=true;
 errorNode.textContent='';
 const button=event.submitter;
 if(button)button.disabled=true;
 try{
  if(isTask){
   const task=caseTask;
   const changes={action_status:data.get('action_status'),due_date:data.get('due_date')||null,assignee:data.get('assignee'),waiting_on:data.get('waiting_on'),assignee_person_id:data.get('assignee_person_id')||null,waiting_on_person_id:data.get('waiting_on_person_id')||null};
   for(const field of caseTaskFields)if(changes[field]===(task[field]??(field==='assignee'?'':null)))delete changes[field];
   if(Object.keys(changes).length){
    const {record}=await api('/api/write',{kind:'update_task',input:{task_id:task.id,expected_version:task.version,changes},operation_id:crypto.randomUUID()});
    caseTask={...task,...record};
    if(record.done)caseDrawer().close();
    else prepareForm(form);
    await loadProjects();await load();
    if(caseDrawer().open)errorNode.textContent='Task saved.';
   }else errorNode.textContent='No changes to save.';
  }else{
   const title=String(data.get('title')).trim(),body=String(data.get('text')).trim();
   if(!title||!body)throw Error('Enter a title and note.');
   let [kind,id]=String(data.get('location')||'').split(':');
   if(!id){
    if(!form.dataset.noteBook){
     const folder=await api('/api/write',{kind:'save_note_folder',input:{kind:'notebook',title:'Notes'},operation_id:crypto.randomUUID()});
     form.dataset.noteBook=folder.record.id;
    }
    kind='book';
    id=form.dataset.noteBook;
   }
   const content=body.split(/\r?\n/).map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}));
   await api('/api/write',{kind:'save_note',input:{title,project_id:form.dataset.id,[kind==='section'?'section_id':'notebook_id']:id,doc:{type:'doc',content}},operation_id:crypto.randomUUID()});
   $('toolsDialog').close();
   refreshCaseNotes();
   announce('Note saved.');
  }
 }catch(error){errorNode.textContent=error.message;}
 finally{state.busy=false;if(button)button.disabled=!state.canWrite;}
});

document.addEventListener('close',event=>{
 if(event.target.id!=='toolsDialog')return;
 if(event.target.querySelector('#taskNoteForm')||event.target.dataset.caseNoteDialog){
  void syncCaseDrawerNotes();
  refreshCaseNotes();
 }
},true);
