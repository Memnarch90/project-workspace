'use strict';

const WorkspacePeople = (() => {
  const privacy = 'Work-role information only. Do not enter personal details (home address, health, family or personal phone), or employee relations, grievance, disciplinary or case content.';
  const types = ['Internal','External'];
  const relationships = ['Manager','Peer','Data owner','Sponsor','Supplier','Union','Network contact','Other'];
  const levels = ['High','Medium','Low'];
  const channels = ['Teams','Email','Meeting','Call','In person','Other'];
  const labelForRole = {assignee:'Assignee',waiting_on:'Waiting on'};
  const compareNames = (a,b) => a.name.localeCompare(b.name,'en-GB');
  const contactLabel = p => [p.name,p.organisation,p.role,p.archived?'Archived':''].filter(Boolean).join(' · ');
  const menu = (items,selected='') => items.map(item => {
    const {id,name}=typeof item==='string'?{id:item,name:item}:item;
    return `<option value="${esc(id)}" ${selected===id?'selected':''}>${esc(name)}</option>`;
  }).join('');
  const select = (name,items,selected,empty) => `<select name="${name}">${empty?`<option value="">${empty}</option>`:''}${menu(items,selected)}</select>`;
  const contact = p => `<button type="button" class="people-link" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`;
  const task = t => `<li><button type="button" class="people-link" data-edit="${esc(t.id)}">${esc(t.title)}</button>
    <span class="sub">${esc(t.roles.map(role=>labelForRole[role]).join(' and '))}${t.due_date?' · Due '+esc(t.due_date):''}</span></li>`;
  const endpoint = (path,params={}) => '/api/'+path+'?'+new URLSearchParams(Object.entries(params).filter(([,value])=>value!==''&&value!=null));
  const write = (kind,input) => api('/api/write',{kind,input,operation_id:crypto.randomUUID()});

  let selected = null, mode = 'all', filters = {};
  const find = params => api(endpoint('people',params));
  const details = (person_id,offset=0) => api(endpoint('person',{person_id,offset}));
  async function collect(params={}) {
    const people=[];
    let after_id='';
    do {
      const page=await find({...params,after_id,limit:50});
      people.push(...page.items);
      after_id=page.next_after_id;
    } while(after_id);
    return people.sort(compareNames);
  }

  function render() {
    window.WorkspaceNotes?.detach();
    $('workspaceTitle').textContent='People';
    $('viewTitle').textContent='People';
    $('viewDescription').textContent='Work contacts, commitments and catch-ups';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='people')));
    document.querySelector('.filters .search').hidden=true;
    for(const id of ['planFilterWrap','completionFilterWrap','exportPanel','projectFilterWrap','dayProjectWrap','newTask'])$(id).hidden=true;
    const tabs=[['all','All people'],['due','Due a catch-up'],['waiting','Waiting on people']];
    $('content').innerHTML=`<section class="people-view">
      <div id="peopleCommand" class="workspace-command-bar">
        ${state.canWrite?'<button type="button" class="primary workspace-primary-action" data-add-person>＋ Add person</button>':''}</div>
      <div class="saved-views" role="group" aria-label="People views">${tabs.map(([key,title])=>
        `<button type="button" data-people-mode="${key}" aria-pressed="${!selected&&mode===key}">${title}</button>`).join('')}</div>
      <p class="people-privacy">${privacy}</p>
      <div id="peopleResults" aria-live="polite"><p>Loading people…</p></div></section>`;
    const root=$('peopleResults');
    (selected?showPerson(root,selected):mode==='waiting'?showWaiting(root):showList(root))
      .catch(error=>{if(root.isConnected)root.textContent=error.message;});
  }

  async function showList(root) {
    const showArchived=mode==='all';
    $('peopleCommand').insertAdjacentHTML('afterbegin',`<form class="filters people-filters" id="peopleFilters">
      <label class="search">Search people<input name="query" type="search" placeholder="Find a person…" maxlength="180" value="${esc(filters.query||'')}"></label>
      <label>Type${select('type',types,filters.type,'All types')}</label>
      <label>Relationship${select('relationship',relationships,filters.relationship,'All relationships')}</label>
      <label>Project${select('project_id',state.projects,filters.project_id,'All projects')}</label>
      <label>Influence${select('influence',levels,filters.influence,'All levels')}</label>
      ${showArchived?`<label>Status<select name="archived">${menu([{id:'false',name:'Active'},{id:'true',name:'Archived'}],filters.archived||'false')}</select></label>`:''}
      <button type="submit">Apply filters</button>
      </form>`);
    root.innerHTML='<div id="peopleList"><p class="sub">Loading people…</p></div>';
    await listPage($('peopleList'));
  }

  async function listPage(target,after_id='') {
    const {archived,...rest}=filters;
    const results=await find({...rest,...(mode==='due'?{due_catch_up:true}:{archived}),after_id});
    if(!target.isConnected)return;
    target.querySelector('[data-people-more]')?.remove();
    const rows=results.items.map(p=>`<li class="people-list-row">
      <div>${contact(p)}<p class="sub">${esc([p.role,p.organisation,p.type,p.relationship,p.influence+' influence'].filter(Boolean).join(' · '))}</p></div>
      ${p.next_touchpoint_date||p.last_interaction_date?`<div class="people-list-dates">
        ${p.next_touchpoint_date?`<p class="sub">Next touchpoint <time>${esc(p.next_touchpoint_date)}</time></p>`:''}
        ${p.last_interaction_date?`<p class="sub">Last interaction <time>${esc(p.last_interaction_date)}</time></p>`:''}</div>`:''}</li>`).join('');
    if(!after_id)target.innerHTML=rows?'<ul class="people-list people-directory"></ul>':'<p class="empty">No people match this view.</p>';
    if(rows)target.querySelector('ul').insertAdjacentHTML('beforeend',rows);
    if(results.has_more)target.insertAdjacentHTML('beforeend',`<button data-people-more="${esc(results.next_after_id)}">Show more people</button>`);
  }

  async function showWaiting(root) {
    const [active,archived]=await Promise.all([collect(),collect({archived:true})]);
    if(!root.isConnected)return;
    const groups=new Map();
    for(const row of state.rows.filter(t=>!t.done&&!t.archived)) {
      for(const [personId,role] of [[row.assignee_person_id,'assignee'],[row.waiting_on_person_id,'waiting_on']]) {
        if(!personId)continue;
        if(!groups.has(personId))groups.set(personId,new Map());
        const tasks=groups.get(personId);
        if(!tasks.has(row.id))tasks.set(row.id,{...row,roles:[]});
        tasks.get(row.id).roles.push(role);
      }
    }
    root.innerHTML='<h3>Waiting on people</h3>'+([...active,...archived].filter(p=>groups.has(p.id)).sort(compareNames).map(p=>
      `<section class="case-card people-panel"><h4>${contact(p)}${p.archived?' (Archived)':''}</h4>
        <ul class="people-list">${[...groups.get(p.id).values()].sort((a,b)=>a.title.localeCompare(b.title)).map(task).join('')}</ul></section>`
    ).join('')||'<p class="empty">No open tasks have a linked person.</p>');
  }

  function timelineRows(rows) {
    return rows.map(i=>`<li><strong>${esc(i.summary)}</strong><p class="sub">${esc(i.date)} · ${esc(i.channel)}${i.source==='meeting'?' · Meeting Journal':''}</p>
      <div class="people-actions">
        ${i.project_id?projectLink(i.project_id):''}
        ${i.task_id?`<button type="button" class="people-link" data-edit="${esc(i.task_id)}">Open task</button>`:''}
        ${i.meeting_id?`<button type="button" class="people-link" data-people-meeting="${esc(i.meeting_id)}" data-page="${esc(i.page_id||'')}">Open meeting</button>`:''}
        ${i.source==='logged'&&state.canWrite?`<button data-edit-interaction="${esc(i.id)}">Edit interaction</button>`:''}
      </div></li>`).join('');
  }
  const projectLink = id => {
    const p=state.projects.find(p=>p.id===id);
    return p?`<button type="button" class="people-link" data-people-project="${esc(id)}">${esc(p.name)}</button>`:'';
  };
  let currentTimeline=new Map(), currentPerson=null;
  async function showPerson(root,id) {
    const result=await details(id);
    if(!root.isConnected)return;
    const {person:p,interactions,open_tasks,commitments,next_offset}=result;
    currentPerson=p;
    currentTimeline=new Map(interactions.filter(i=>i.source==='logged').map(i=>[i.id,i]));
    const fields=[['Role',p.role],['Team or organisation',p.organisation],['Type',p.type],['Relationship',p.relationship],
      ['Influence',p.influence],['Closeness',p.closeness],['Next touchpoint',p.next_touchpoint_date],
      ['Keep-warm interval',p.keep_warm_weeks?`${p.keep_warm_weeks} ${p.keep_warm_weeks===1?'week':'weeks'}`:'']];
    const owes=(field)=>commitments.filter(i=>i[field]).map(i=>`<li>${esc(i[field])} <span class="sub">${esc(i.date)}</span>
      ${state.canWrite?`<button class="people-link" data-edit-interaction="${esc(i.id)}">Edit</button>`:''}</li>`).join('')||'<li>None recorded.</li>';
    for(const i of commitments)currentTimeline.set(i.id,i);
    root.innerHTML=`<article class="people-detail"><section class="case-card people-panel">
      <div class="case-heading people-profile-heading"><h3>${esc(p.name)}${p.archived?' (Archived)':''}</h3>
      <div class="people-actions">${state.canWrite?`<button data-edit-person>Edit details</button>
        <button data-archive-person>${p.archived?'Restore person':'Archive person'}</button>
        ${p.archived?'':'<button class="primary" data-log-interaction>Log interaction</button>'}`:''}</div></div>
      <dl class="case-facts">${fields.map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value||'Not set')}</dd></div>`).join('')}</dl>
      ${p.notes?`<h4>Work-context notes</h4><p class="people-note">${esc(p.notes)}</p>`:''}
      <h4>Linked projects</h4><div class="people-actions">${p.project_ids.map(projectLink).join('')||'<p class="sub">None linked.</p>'}</div></section>
      <div class="case-columns people-commitments"><section class="case-card"><h4>I owe them</h4><ul class="people-list">${owes('i_owe_them')}</ul></section>
        <section class="case-card"><h4>They owe me</h4><ul class="people-list">${owes('they_owe_me')}</ul></section></div>
      <section class="case-card people-panel"><h4>Open linked tasks</h4><ul class="people-list">${open_tasks.map(task).join('')||'<li class="sub">No open linked tasks.</li>'}</ul></section>
      <section class="case-card people-panel"><h4>Interaction timeline</h4><ul class="people-list" id="peopleTimeline">${timelineRows(interactions)||'<li class="sub">No interactions yet.</li>'}</ul>
      ${next_offset!=null?`<button data-timeline-more="${next_offset}">Older interactions</button>`:''}</section></article>`;
  }

  function form(title,inner,onSave,extra='') {
    const dialog=$('peopleEditor');
    dialog.innerHTML=`<form><header><h2 id="peopleEditorTitle">${title}</h2>
      <div class="editor-header-actions"><button type="button" class="secondary" data-close-people>Cancel</button><button class="primary" type="submit">Save &amp; close</button></div></header>
      <p class="people-privacy">${privacy}</p><div class="form-grid">${inner}</div>${extra}<p role="alert"></p></form>`;
    const editor=dialog.querySelector('form'), submit=editor.querySelector('[type=submit]');
    editor.onsubmit=async event=>{
      event.preventDefault();
      submit.disabled=true;
      const result=editor.querySelector('[role=alert]');
      result.textContent='';
      try {
        await onSave(new FormData(editor));
        dialog.close();
        render();
      } catch(error) { result.textContent=error.message; }
      finally { submit.disabled=false; }
    };
    prepareForm(editor);
    dialog.querySelector('[data-close-people]').onclick=()=>closeDialogSafely(dialog);
    dialog.oncancel=event=>{event.preventDefault();closeDialogSafely(dialog);};
    if(!dialog.open)dialog.showModal();
  }

  function editPerson(p=null) {
    const v=p||{type:'Internal',relationship:'Other',influence:'Medium',closeness:'Medium',project_ids:[]};
    form(p?'Edit person':'Add person',`
      <label>Name<input name="name" value="${esc(v.name)}" maxlength="180" required></label>
      <label>Role<input name="role" value="${esc(v.role)}" maxlength="180"></label>
      <label>Team or organisation<input name="organisation" value="${esc(v.organisation)}" maxlength="180"></label>
      <label>Type${select('type',types,v.type)}</label><label>Relationship${select('relationship',relationships,v.relationship)}</label>
      <label>Influence${select('influence',levels,v.influence)}</label><label>Closeness${select('closeness',levels,v.closeness)}</label>
      <label>Next touchpoint<input type="date" name="next_touchpoint_date" value="${esc(v.next_touchpoint_date)}"></label>
      <label>Keep-warm interval (weeks)<input name="keep_warm_weeks" type="number" min="1" max="520" value="${esc(v.keep_warm_weeks)}"></label>
      <fieldset class="wide"><legend>Linked projects</legend><div class="people-projects">${state.projects.map(project=>
        `<label><input type="checkbox" name="project_ids" value="${esc(project.id)}" ${v.project_ids.includes(project.id)?'checked':''}> ${esc(project.name)}</label>`).join('')||'No projects yet.'}</div></fieldset>
      <label class="wide">Work-context notes<textarea name="notes" rows="4" maxlength="1000">${esc(v.notes)}</textarea></label>`,async data=>{
        const changes=Object.fromEntries(data);
        changes.project_ids=data.getAll('project_ids');
        changes.next_touchpoint_date=changes.next_touchpoint_date||null;
        changes.keep_warm_weeks=changes.keep_warm_weeks?Number(changes.keep_warm_weeks):null;
        const saved=await write(p?'update_person':'create_person',p?{person_id:p.id,expected_version:p.version,changes}:{changes});
        selected=saved.record.id;
      });
  }

  function editInteraction(p,i=null) {
    const v=i||{date:today(),channel:'Teams'};
    const tasks=state.rows.filter(t=>!t.archived||t.id===v.task_id).map(t=>({id:t.id,name:t.title})).sort(compareNames);
    form(i?'Edit interaction':'Log interaction',`
      <label>Date<input type="date" name="date" value="${esc(v.date)}" required></label><label>Channel${select('channel',channels,v.channel)}</label>
      <label class="wide">One-line summary<input name="summary" value="${esc(v.summary)}" maxlength="300" required></label>
      <label class="wide">I owe them<textarea name="i_owe_them" maxlength="500">${esc(v.i_owe_them)}</textarea></label>
      <label class="wide">They owe me<textarea name="they_owe_me" maxlength="500">${esc(v.they_owe_me)}</textarea></label>
      <label>Linked project${select('project_id',state.projects,v.project_id,'No project')}</label>
      <label>Linked task${select('task_id',tasks,v.task_id,'No task')}</label>
      <label class="wide">Meeting Journal link or ID<input name="meeting_id" value="${esc(v.meeting_id)}" maxlength="500"></label>`,async data=>{
        const changes=Object.fromEntries(data);
        changes.project_id=changes.project_id||null;
        changes.task_id=changes.task_id||null;
        const meeting=changes.meeting_id.trim();
        changes.meeting_id=meeting.includes('?')?new URL(meeting,location.origin).searchParams.get('meeting'):meeting||null;
        if(meeting&&!changes.meeting_id)throw Error('Enter a Meeting Journal link containing a meeting ID.');
        await write(i?'update_interaction':'log_interaction',i?{interaction_id:i.id,expected_version:i.version,changes}:{person_id:p.id,changes});
      },i?'<button type="button" data-archive-interaction>Archive interaction</button>':'');
    if(i)$('peopleEditor').querySelector('[data-archive-interaction]').onclick=async event=>{
      const button=event.currentTarget;
      button.disabled=true;
      try {
        await write('update_interaction',{interaction_id:i.id,expected_version:i.version,changes:{archived:true}});
        $('peopleEditor').close();
        render();
      } catch(error) { $('peopleEditor').querySelector('[role=alert]').textContent=error.message; }
      finally { button.disabled=false; }
    };
  }

  async function taskPickers(t,fields={assignee_person_id:'assigneePerson',waiting_on_person_id:'waitingPerson'}) {
    const people=await collect();
    for(const [field,id] of Object.entries(fields)) {
      const current=t?.[field]||'', choices=people.map(p=>({id:p.id,name:contactLabel(p)}));
      if(current&&!choices.some(p=>p.id===current)) {
        const archived=(await details(current)).person;
        choices.push({id:current,name:contactLabel(archived)});
      }
      options($(id),choices,'No linked person');
      $(id).value=current;
      $(id).disabled=!state.canWrite;
    }
  }

  async function stakeholders(project_id) {
    const panel=node('section',undefined,'case-card people-panel project-stakeholders');
    panel.innerHTML='<h3>Stakeholders</h3><p>Loading stakeholders…</p>';
    $('content').prepend(panel);
    try {
      const people=await collect({project_id});
      if(panel.isConnected)panel.innerHTML='<h3>Stakeholders</h3>'+(people.length?
        `<ul class="people-list">${people.map(p=>`<li>${contact(p)} <span class="sub">${esc([p.role,p.organisation,p.relationship].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`:
        '<p>No active people are linked to this project.</p>');
    } catch(error) { if(panel.isConnected)panel.querySelector('p').textContent=error.message; }
  }

  function journalLinks(m) {
    return (m.people_participants||[]).map(p=>p.person_id?
      `<button type="button" class="people-link" data-open-person="${esc(p.person_id)}">${esc(p.name)}</button>`:
      state.canWrite?`<form class="people-journal-link" data-meeting-person="${esc(m.id)}" data-version="${m.version}" data-link-version="${p.link_version}" data-participant="${esc(p.name)}">
        <label>Link ${esc(p.name)} to a person<select name="person_id" required><option value="">Loading people…</option></select></label>
        <button disabled>Link participant to person</button><span role="alert"></span></form>`:'').join('');
  }

  async function populateJournal(root) {
    const forms=[...root.querySelectorAll('[data-meeting-person]')].filter(form=>!form.dataset.loaded);
    if(!forms.length)return;
    try {
      const people=await collect(), choices=people.map(p=>({id:p.id,name:contactLabel(p)}));
      for(const form of forms.filter(form=>form.isConnected)) {
        options(form.elements.person_id,choices,choices.length?'Choose a person':'Add someone in People first');
        form.querySelector('button').disabled=!choices.length;
        form.dataset.loaded='true';
      }
    } catch(error) { for(const form of forms)form.querySelector('[role=alert]').textContent=error.message; }
  }

  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');
    if(!b)return;
    try {
      if(b.dataset.openPerson){selected=b.dataset.openPerson;goView('people');return;}
      if(b.dataset.peopleMode){selected=null;mode=b.dataset.peopleMode;render();return;}
      if(b.dataset.peopleMore){b.disabled=true;await listPage($('peopleList'),b.dataset.peopleMore);return;}
      if(b.hasAttribute('data-add-person'))editPerson();
      if(b.hasAttribute('data-edit-person'))editPerson(currentPerson);
      if(b.hasAttribute('data-log-interaction'))editInteraction(currentPerson);
      if(b.dataset.editInteraction)editInteraction(currentPerson,currentTimeline.get(b.dataset.editInteraction));
      if(b.hasAttribute('data-archive-person')){
        b.disabled=true;
        await write('update_person',{person_id:currentPerson.id,expected_version:currentPerson.version,changes:{archived:!currentPerson.archived}});
        render();
      }
      if(b.dataset.timelineMore){
        b.disabled=true;
        const {interactions,next_offset}=await details(selected,Number(b.dataset.timelineMore));
        if(!b.isConnected)return;
        for(const i of interactions)if(i.source==='logged')currentTimeline.set(i.id,i);
        $('peopleTimeline').insertAdjacentHTML('beforeend',timelineRows(interactions));
        if(next_offset==null)b.remove();
        else {b.dataset.timelineMore=next_offset;b.disabled=false;}
      }
      if(b.dataset.peopleProject){$('project').value=b.dataset.peopleProject;goView('plan');}
      if(b.dataset.peopleMeeting){
        const id=b.dataset.peopleMeeting;
        const page=b.dataset.page||(await api(endpoint('meeting',{id}))).page_id;
        await WorkspaceNotes.showPage(page,id);
      }
    } catch(error) { b.disabled=false;announce(error.message); }
  });

  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(form.id==='peopleFilters'){
      event.preventDefault();
      filters={...filters,...Object.fromEntries(new FormData(form))};
      render();
    }
    if(form.dataset.meetingPerson){
      event.preventDefault();
      const select=form.elements.person_id,button=form.querySelector('button'),error=form.querySelector('[role=alert]');
      button.disabled=true;
      error.textContent='';
      try {
        await write('link_meeting_person',{meeting_id:form.dataset.meetingPerson,expected_version:Number(form.dataset.version),expected_link_version:Number(form.dataset.linkVersion),participant:form.dataset.participant,person_id:select.value});
        const linked=node('button',form.dataset.participant,'people-link');
        linked.dataset.openPerson=select.value;
        form.replaceWith(linked);
        announce('Meeting participant linked.');
      } catch(e) { error.textContent=e.message; }
      finally {button.disabled=false;}
    }
  });

  return {render,taskPickers,stakeholders,journalLinks,populateJournal};
})();
