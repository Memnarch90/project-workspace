'use strict';
// Fictional records only. No storage, credentials, remote API or production connection.
const projects=[
 {id:'website',name:'Website refresh',description:'A clearer home for a fictional creative studio.',phase:'In progress'},
 {id:'garden',name:'Community garden',description:'Turn an imaginary unused corner into something green.',phase:'Planning'},
 {id:'podcast',name:'Podcast pilot',description:'Find the format for a fictional monthly conversation.',phase:'In progress'}
];
const initialTasks=[
 {id:'t1',project:'website',title:'Map the new page structure',owner:'Alex Example',due:'2026-11-24',status:'In progress',day:true},
 {id:'t2',project:'website',title:'Review the homepage copy',owner:'Sam Example',due:'2026-11-25',status:'Not started',day:true},
 {id:'t3',project:'website',title:'Collect reference images',owner:'Alex Example',due:'2026-11-20',status:'Complete',done:true},
 {id:'t4',project:'website',title:'Approve the first prototype',owner:'Sam Example',due:'2026-11-27',status:'Not started',milestone:true},
 {id:'t5',project:'garden',title:'Sketch the planting areas',owner:'Robin Example',due:'2026-11-24',status:'In progress',day:true},
 {id:'t6',project:'garden',title:'Confirm the tool loan',owner:'Alex Example',due:'2026-11-26',status:'Waiting'},
 {id:'t7',project:'garden',title:'Check the fictional site dimensions',owner:'Robin Example',due:'2026-11-19',status:'Complete',done:true},
 {id:'t8',project:'garden',title:'Agree the planting plan',owner:'Sam Example',due:'2026-11-30',status:'Not started',milestone:true},
 {id:'t9',project:'podcast',title:'Draft the pilot questions',owner:'Sam Example',due:'2026-11-24',status:'In progress',day:true},
 {id:'t10',project:'podcast',title:'Review the sound test',owner:'Robin Example',due:'2026-11-25',status:'Not started'},
 {id:'t11',project:'podcast',title:'Choose a working title',owner:'Alex Example',due:'2026-11-20',status:'Complete',done:true},
 {id:'t12',project:'podcast',title:'Record the pilot episode',owner:'Robin Example',due:'2026-11-27',status:'Not started',milestone:true}
];
const notes=[
 {project:'website',title:'Website planning meeting',meta:'Fictional meeting · 2026-11-23 · Alex Example, Sam Example',body:'Purpose\nMake it easier to understand the studio and find its work.\n\nDecisions\nKeep the navigation to four main sections. Lead with a single clear project example.\n\nNext actions\nAlex sketches the page structure. Sam reviews the homepage copy. The first prototype review is planned for 2026-11-27.'},
 {project:'garden',title:'A small garden, a practical start',meta:'Fictional project note · 2026-11-23',body:'Start with three planting areas and a shared tool shelf. Keep a clear central path.\n\nOpen questions\nWhich plants suit the shade? Can the watering rota be shared?\n\nThis is an invented example note, not a real community project.'},
 {project:'podcast',title:'Pilot format and recording notes',meta:'Fictional meeting · 2026-11-23 · Robin Example, Sam Example',body:'Aim for a relaxed conversation with one clear subject.\n\nWorking structure\nA short introduction, three questions and one practical takeaway.\n\nBefore recording\nReview the sound test and trim the question list. All participants and project details in this preview are fictional.'}
];
const risks=[
 {project:'website',title:'Copy review takes longer than planned',score:9,level:'Medium',body:'A late review could move the prototype milestone.',mitigation:'Review one page first and agree the direction before writing the rest.'},
 {project:'garden',title:'Shared tools are unavailable',score:6,level:'Medium',body:'The first planting session depends on a fictional tool loan.',mitigation:'Confirm the loan early and prepare a smaller hand-tool plan.'},
 {project:'podcast',title:'Room noise affects the pilot',score:4,level:'Low',body:'A noisy recording space could require a second session.',mitigation:'Listen to the sound test before booking the pilot recording.'}
];
const articles=[
 {title:'A useful weekly review',category:'Planning',body:'Look at completed work, open commitments and the next milestone. Choose a small set of next actions instead of moving everything into today.\n\nIllustrative guidance written for this showcase.'},
 {title:'Keep meeting actions findable',category:'Notes',body:'Record the decision, the action and the owner together. Link the action to the project and revisit it at the next review.\n\nThis fictional article demonstrates a reference library, not a connected AI service.'},
 {title:'Read before asking an AI to write',category:'AI connections',body:'The full hosted application offers an OAuth-protected MCP connection. Begin with read-only permissions and inspect the returned records before enabling edits.\n\nThis showcase has no AI connection. Read the linked setup guide to configure your own instance.'}
];
let tasks=structuredClone(initialTasks),view='dashboard';
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const projectName=id=>projects.find(p=>p.id===id)?.name||'General';
const labels={dashboard:['Dashboard','A CLEARER PICTURE'],day:['My Day','A LITTLE FOCUS'],plan:['Project Plan','THE WORK AHEAD'],notes:['Notes & meetings','KEEP THE CONTEXT'],risks:['Risk Log','NOTICE IT EARLY'],knowledge:['Internal Knowledge','KEEP WHAT YOU LEARN']};
function matches(record){const p=$('projectFilter').value,q=$('search').value.trim().toLowerCase();return (!p||record.project===p)&&(!q||[...Object.values(record),projectName(record.project)].join(' ').toLowerCase().includes(q));}
function taskHTML(task){const status=task.done?'Complete':task.status;return `<div class="task ${task.done?'is-done':''}"><input type="checkbox" data-task="${task.id}" aria-label="Mark ${escapeHTML(task.title)} complete" ${task.done?'checked':''}><div class="task-main"><strong>${escapeHTML(task.title)}${task.milestone?' · Milestone':''}</strong><small>${escapeHTML(projectName(task.project))} · ${escapeHTML(task.owner)}</small></div><span class="pill ${task.done?'green':status==='Waiting'?'orange':''}">${escapeHTML(status)}</span><time class="task-date" datetime="${task.due}">${task.due}</time></div>`;}
function taskList(rows){return rows.length?`<div class="task-list">${rows.map(taskHTML).join('')}</div>`:'<p class="empty">No example tasks match this view. Try another project or clear the search.</p>';}
function noteHTML(note){return `<details class="note-card"><summary>${escapeHTML(note.title)}<small>${escapeHTML(note.meta||note.category)}</small></summary><div class="note-body">${escapeHTML(note.body)}</div></details>`;}
function render(){
 const selected=$('projectFilter').value,filtered=tasks.filter(matches),open=filtered.filter(t=>!t.done);
 $('workspaceName').textContent=selected?projectName(selected):'All Projects';
 $('viewTitle').textContent=labels[view][0];$('viewKicker').textContent=labels[view][1];
 document.querySelectorAll('[data-view]').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 let html='';
 if(view==='dashboard'){
  html=`<div class="metric-grid"><div class="metric"><strong>${open.length}</strong><span>Open example tasks</span></div><div class="metric"><strong>${open.filter(t=>t.day).length}</strong><span>In My Day</span></div><div class="metric"><strong>${open.filter(t=>t.milestone).length}</strong><span>Open milestones</span></div></div><h3 class="section-heading">Projects in motion</h3><div class="project-grid">`;
  for(const p of projects.filter(p=>!selected||p.id===selected)){const rows=tasks.filter(t=>t.project===p.id),done=rows.filter(t=>t.done).length;html+=`<article class="project-card"><span class="pill">${p.phase}</span><h3>${p.name}</h3><p>${p.description}</p><progress max="${rows.length}" value="${done}" aria-label="${p.name} completion"></progress><span class="progress-note">${done} of ${rows.length} example tasks complete</span></article>`;}
  html+='</div><h3 class="section-heading">Your next steps</h3>'+taskList(open.filter(t=>t.day));
 }else if(view==='day'){html='<p class="list-note">A small focus list for this fictional week. Tick a task to try completing it.</p>'+taskList(filtered.filter(t=>t.day));
 }else if(view==='plan'){html='<p class="list-note">All example tasks, including milestones and completed work.</p>'+taskList(filtered);
 }else if(view==='notes'){const rows=notes.filter(matches);html='<p class="list-note">Open a note to see decisions, context and next actions.</p>'+(rows.map(noteHTML).join('')||'<p class="empty">No example notes match your filters.</p>');
 }else if(view==='risks'){const rows=risks.filter(matches);html='<p class="list-note">Fictional risks with simple scores and practical mitigations.</p>'+rows.map(r=>`<article class="risk-card"><span class="pill orange">${r.level} · Score ${r.score}</span><h3>${r.title}</h3><p>${projectName(r.project)} · ${r.body}</p><p><strong>Mitigation:</strong> ${r.mitigation}</p></article>`).join('');if(!rows.length)html+='<p class="empty">No example risks match your filters.</p>';
 }else{const q=$('search').value.trim().toLowerCase(),rows=articles.filter(a=>Object.values(a).join(' ').toLowerCase().includes(q));html='<p class="list-note">Fictional shared reference articles. This library is workspace-wide, so the project filter does not limit it.</p>'+rows.map(noteHTML).join('');if(!rows.length)html+='<p class="empty">No example articles match your search.</p>';}
 $('viewContent').innerHTML=html;
}
for(const p of projects){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('projectFilter').append(option);}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;$('feedback').textContent='';render();}));
$('projectFilter').addEventListener('change',()=>{$('feedback').textContent='';render();});
$('search').addEventListener('input',render);
$('viewContent').addEventListener('change',event=>{const id=event.target.dataset.task;if(!id)return;const task=tasks.find(t=>t.id===id);if(!task)return;task.done=event.target.checked;$('feedback').textContent=(task.done?'Completed: ':'Reopened: ')+task.title+'. Demo changes only.';render();});
$('resetDemo').addEventListener('click',()=>{tasks=structuredClone(initialTasks);view='dashboard';$('projectFilter').value='';$('search').value='';$('feedback').textContent='The fictional workspace has been reset.';render();});
render();
