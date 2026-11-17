'use strict';
// The editor is bundled locally. No editor content is sent to an editor vendor.
window.WorkspaceNotes=(()=>{
 let folders=[],pages=[],current=null,editor=null,dirty=false,saving=null,timer=null,searchTimer=null,editSeq=0,generation=0,morePages=false,pageAfter='',historyBefore='',lastCheckpoint=0,recoveryReview=false,recoveryEditing=false,openGeneration=0,mediaPending=0,layoutBusy=false;
 let prefs={notebook:'',section:'',archived:false,query:'',project:'',stream:'',page:'',collapsed:false};try{prefs={...prefs,...JSON.parse(sessionStorage.getItem('workspace.notes-tab-view')||localStorage.getItem('workspace.notes-view')||'{}')};}catch{}
 const draftPrefix='workspace.note-draft.backup.';
 const draftTab=crypto.randomUUID(),relatedDraftKeys=new Set();let activeDraftKey='';try{activeDraftKey=sessionStorage.getItem('workspace.note-draft-pointer')||'';}catch{}
 const drafts=(includeBackups=false)=>{const vault=window.NoteDraftVault?.get(activeDraftKey);if(vault)return vault;try{const d=JSON.parse(sessionStorage.getItem('workspace.note-draft')||'null');if(d)return d;}catch{}if(!includeBackups)return null;try{return Object.keys(localStorage).filter(k=>k.startsWith(draftPrefix)).map(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}).filter(d=>d?.id&&d?.values?.doc).sort((a,b)=>b.at-a.at)[0]||null;}catch{return null;}};
 function activateDraft(d){activeDraftKey=d.backupKey||'';if(activeDraftKey){relatedDraftKeys.add(activeDraftKey);window.NoteDraftVault?.remember?.(d);}try{sessionStorage.setItem('workspace.note-draft-pointer',activeDraftKey);const json=JSON.stringify(d);if(json.length<1500000)sessionStorage.setItem('workspace.note-draft',json);else sessionStorage.removeItem('workspace.note-draft');}catch{}}
 function clearDraft(){const d=drafts();if(d?.backupKey&&d.id===current?.id)relatedDraftKeys.add(d.backupKey);activeDraftKey='';try{sessionStorage.removeItem('workspace.note-draft');sessionStorage.removeItem('workspace.note-draft-pointer');}catch{}for(const key of relatedDraftKeys){window.NoteDraftVault?.remove(key).catch(()=>{});try{localStorage.removeItem(key);}catch{}}relatedDraftKeys.clear();}
 function savedTime(value=current?.updated_at){if(!value)return 'Not saved yet';const date=new Date(/Z$|[+]\d\d:\d\d$/.test(value)?value:value.replace(' ','T')+'Z');return Number.isNaN(date.getTime())?'Saved':'Saved at '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(date)+' · Europe/London';}
 const say=t=>{if(mediaPending&&t.startsWith('Saved'))t='Saving screenshot…';if($('noteSaveState'))$('noteSaveState').textContent=t;if($('noteSavedTime'))$('noteSavedTime').textContent=t;};
 const disabled=()=>!state.canWrite||(recoveryReview&&!recoveryEditing)||current?.archived||current?.section_archived||current?.notebook_archived;
 const fields=()=>({title:$('noteTitle')?.value||current?.title||'',section_id:$('noteSection')?.value||current?.section_id,project_id:$('noteProject')?.value||null,workstream_id:$('noteStream')?.value||null,doc:editor?.getJSON()||current?.doc});
 function keepDraft(){if(!current)return;try{const backupKey=draftPrefix+draftTab+'.'+current.id;if(activeDraftKey)relatedDraftKeys.add(activeDraftKey);const d={id:current.id,version:recoveryReview?(drafts()?.version??current.version):current.version,at:Date.now(),backupKey,values:fields()};activeDraftKey=backupKey;const json=JSON.stringify(d);if(window.NoteDraftVault){window.NoteDraftVault.put(d).catch(e=>say(e.message));try{sessionStorage.setItem('workspace.note-draft-pointer',backupKey);if(json.length<1500000)sessionStorage.setItem('workspace.note-draft',json);else sessionStorage.removeItem('workspace.note-draft');}catch{}}else{sessionStorage.setItem('workspace.note-draft',json);localStorage.setItem(backupKey,json);}}catch{say('Draft storage unavailable — keep this tab open and export your text.');}}
 function changed(error){dirty=true;editSeq++;keepDraft();clearTimeout(timer);say(error?'Not Saved — '+error.message:recoveryEditing?'Editing draft · Autosave paused':'Unsaved Changes');if(!error&&!recoveryReview)timer=setTimeout(()=>flush(),1000);}
 async function flush(checkpoint=false,allowMedia=false){
  clearTimeout(timer);if(layoutBusy){say('Moving notes — please wait.');return false;}if(mediaPending&&!allowMedia){say('Screenshot uploading — wait until saved.');return false;}if(saving){await saving;if(dirty)return flush(checkpoint,allowMedia);return !dirty;}
  if(recoveryReview){say('Review unsaved changes to choose what to keep.');return false;}if(!dirty)return true;if(!current||disabled()){say('Not Saved — this page is read-only. Export your draft.');return false;}
  const values=fields(),seq=editSeq,id=current.id;keepDraft();say('Saving…');
  saving=(async()=>{try{const input={id,expected_version:current.version,...values,checkpoint},operation=crypto.randomUUID();const result=window.NoteMedia?await NoteMedia.save(input,operation):await api('/api/write',{kind:'save_note',input,operation_id:operation});if(current?.id===id){current={...current,...values,...result.record,section_archived:0,notebook_archived:0};if(seq===editSeq){dirty=false;recoveryReview=false;clearDraft();$('noteRecovery')?.replaceChildren();say(savedTime());}else{keepDraft();say('Unsaved Changes');timer=setTimeout(()=>flush(),1000);}const p=pages.find(p=>p.id===id);if(p){p.title=values.title;p.version=result.record.version;const b=document.querySelector(`[data-note-page="${CSS.escape(id)}"]`);if(b){b.textContent=values.title;const preview=b.closest('.note-page-row')?.querySelector('p');if(preview)preview.textContent=editor.getText().slice(0,180);}}}return true;}catch(e){keepDraft();recoveryReview=true;recoveryEditing=false;say('Not Saved — '+e.message);showRecovery();return false;}finally{saving=null;}})();return saving;
 }
 async function checkpoint(){
  // Clean pages already have saved history. Never manufacture a version on navigation.
  if(saving)await saving;if(dirty&&!recoveryReview)await flush(true);
 }

 async function collectFolders(){const list=[];let after='';do{const r=await api('/api/note-folders?'+new URLSearchParams({archived:prefs.archived?'all':'false',after_id:after}));list.push(...r.items);after=r.has_more?r.next_after_id:'';}while(after);return list;}
 function savePrefs(){try{sessionStorage.setItem('workspace.notes-tab-view',JSON.stringify(prefs));localStorage.setItem('workspace.notes-view',JSON.stringify(prefs));}catch{}}
 function render(){
  if(dirty||saving){return flush(true).then(ok=>{if(ok)return render();});}
  state.view='notes';for(const id of ['projectFilterWrap','dayProjectWrap','planFilterWrap','completionFilterWrap','exportPanel','newTask'])$(id).hidden=true;document.querySelector('.filters .search').hidden=true;$('viewTitle').textContent='Notes';$('viewDescription').textContent='Capture ideas. Keep everything together.';$('workspaceTitle').textContent='Notes';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='notes')));
  ++openGeneration;if(editor){editor.destroy();editor=null;}current=null;
  $('content').innerHTML=`<section class="notes-app"><div class="notes-topbar"><button data-notes-collapse aria-controls="notesNotebookSidebar" aria-expanded="${!prefs.collapsed}">${prefs.collapsed?'Show sidebar':'Hide sidebar'}</button><button data-notes-drafts>Recover drafts</button><button data-notes-archived>Archived items</button><div class="notes-wordmark"><span aria-hidden="true">▤</span> Your notebooks</div><label class="notes-search"><span class="sr-only">Find Notes</span><input id="noteSearch" type="search" placeholder="Search your notes…" maxlength="180" value="${esc(prefs.query)}"></label><details class="notes-filter-menu"><summary>Filters</summary><div class="notes-controls"><label>Project<select id="notesProject"></select></label><label>Workstream<select id="notesStream"></select></label><label class="notes-archive-toggle"><input id="notesArchived" type="checkbox" ${prefs.archived?'checked':''}>Include archived</label><button data-notes-clear>Clear filters</button></div></details></div><div class="notes-mobile-tabs" aria-label="Notes navigation"><button data-notes-panel="tree">Notebooks</button><button data-notes-panel="pages">Pages</button><button data-notes-panel="editor">Page</button></div><div class="notes-layout ${prefs.collapsed?'notebooks-collapsed':''}" data-panel="editor"><aside class="notes-tree" id="notesNotebookSidebar" aria-label="Notebooks and pages"><div class="notes-panel-heading"><h3>Notebooks</h3><button data-note-new="notebook" title="New notebook" aria-label="New Notebook" ${!state.canWrite?'disabled':''}>＋</button></div><button data-meeting-journal>Meeting Journal</button><button class="notes-all" data-notes-all aria-pressed="${!prefs.notebook}">▦ All pages</button><div id="notesTree">Loading notebooks…</div><p class="notes-privacy">Private workspace<br>Connected AI can read saved notes.</p></aside><aside class="notes-pages" aria-label="Pages"><div class="notes-panel-heading"><h3 id="notesScope">Pages</h3></div><button class="notes-add-page" data-note-new="page" ${!state.canWrite?'disabled':''}>＋ Add page</button><p id="notesFilterSummary" class="notes-scope-summary" role="status"></p><div id="notesPages">Loading pages…</div></aside><div id="notesSections" class="notes-sections-tabs" role="group" aria-label="Sections"></div><article id="notesEditorPanel" class="notes-editor-panel"><div class="notes-welcome"><span aria-hidden="true">▤</span><h3>A place for your thinking</h3><p>Choose a page on the left, or add a page to start writing.</p><button data-note-new="page" ${!state.canWrite?'disabled':''}>＋ Add page</button><p class="sub">Organise notes into notebooks and sections.</p></div></article></div></section>`;
  $('notesNotebookSidebar').insertBefore(document.querySelector('.notes-pages'),document.querySelector('.notes-privacy'));
  options($('notesProject'),state.projects,'All Projects');$('notesProject').value=prefs.project;scopeStreams();savePrefs();return reload().catch(e=>{$('notesPages').textContent=e.message;});
 }
 function scopeStreams(){if(!state.projects.some(p=>p.id===prefs.project))prefs.project='';options($('notesStream'),state.streams.filter(s=>!prefs.project||s.project_id===prefs.project).map(s=>({...s,name:(prefs.project?'':(state.projects.find(p=>p.id===s.project_id)?.name||'')+' / ')+s.name})),'All Workstreams');if(prefs.stream&&!state.streams.some(s=>s.id===prefs.stream&&(!prefs.project||s.project_id===prefs.project)))prefs.stream='';$('notesStream').value=prefs.stream;}
 async function reload(){await window.NoteDraftVault?.ready;const g=++generation;const f=await collectFolders();if(g!==generation||state.view!=='notes')return;folders=f;if(prefs.notebook&&!folders.some(f=>f.id===prefs.notebook)){prefs.notebook='';prefs.section='';}if(prefs.section&&!folders.some(f=>f.id===prefs.section))prefs.section='';tree();await loadPages();const route=new URLSearchParams(location.search),deep=route.get('note'),anchor=route.get('meeting');if(deep){history.replaceState(null,'','/');await openPage(deep);if(anchor)focusMeeting(anchor);}else if(drafts()){const d=drafts();try{await openPage(d.id);}catch{announce('Your draft is kept in this tab. Reopen its page to recover it.');}}else if(prefs.page&&pages.some(p=>p.id===prefs.page))await openPage(prefs.page);else if(pages.length)await openPage(pages[0].id);}
 function tree(){
  document.querySelector('[data-notes-all]')?.setAttribute('aria-pressed',String(!prefs.notebook));
  const books=folders.filter(f=>f.kind==='notebook').sort((a,b)=>a.title.localeCompare(b.title));
  $('notesTree').innerHTML=books.map(n=>`<section class="notes-book ${prefs.notebook===n.id?'is-open':''}"><div data-note-drop-book="${esc(n.id)}"><button data-note-book="${esc(n.id)}" aria-pressed="${prefs.notebook===n.id}"><span class="notes-book-icon" aria-hidden="true">▤</span>${esc(n.title)}${n.archived?' · Archived':''}</button><button class="notes-manage" data-note-manage="${esc(n.id)}" aria-label="Options for notebook ${esc(n.title)}">⋯</button></div></section>`).join('')||'<p>No notebooks yet.</p>';
  if(!$('notesSections'))return;
  const sections=folders.filter(f=>f.kind==='section'&&(!prefs.notebook||f.parent_id===prefs.notebook)).sort((a,b)=>(a.rank||0)-(b.rank||0)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  $('notesSections').innerHTML=`<button data-notes-sections-all aria-pressed="${!prefs.section}">All sections</button>`+sections.map(f=>`<div class="notes-section ${window.NoteLayout?.colorClass(f)||''}" data-note-drag="section" data-note-id="${esc(f.id)}" draggable="${state.canWrite&&!f.archived}"><button draggable="${state.canWrite&&!f.archived}" data-note-section="${esc(f.id)}" aria-pressed="${prefs.section===f.id}">${esc((prefs.notebook?'':(books.find(b=>b.id===f.parent_id)?.title||'')+' / ')+f.title)}${f.archived?' · Archived':''}</button><button class="notes-manage" data-note-manage="${esc(f.id)}" aria-label="Options for section ${esc(f.title)}">⋯</button></div>`).join('')+`<button data-note-new="section" data-book="${esc(prefs.notebook||books[0]?.id||'')}" ${!state.canWrite||!books.length||books.find(b=>b.id===prefs.notebook)?.archived?'disabled':''}>＋ Section</button>`;
 }
 async function loadPages(append=false){const g=++generation;savePrefs();const r=await api('/api/notes?'+new URLSearchParams({query:prefs.query,project_id:prefs.project,workstream_id:prefs.stream,notebook_id:prefs.notebook,section_id:prefs.section,archived:prefs.archived?'all':'false',after_id:append?pageAfter:''}));if(g!==generation||state.view!=='notes')return;pages=append?pages.concat(r.items):r.items;if($('notesFilterSummary'))$('notesFilterSummary').textContent='Page list: '+(folders.find(f=>f.id===(prefs.section||prefs.notebook))?.title||'All Notebooks')+' · '+(state.projects.find(p=>p.id===prefs.project)?.name||'All Projects')+' · '+(state.streams.find(s=>s.id===prefs.stream)?.name||'All Workstreams')+(prefs.query?' · Search: '+prefs.query:'')+(prefs.archived?' · Includes Archived':'');morePages=r.has_more;pageAfter=r.next_after_id||'';$('notesScope').textContent=folders.find(f=>f.id===(prefs.section||prefs.notebook))?.title||'All Pages';$('notesPages').innerHTML=pages.map(p=>`<div class="note-page-row" data-note-drag="page" data-note-id="${esc(p.id)}" draggable="${state.canWrite&&!p.archived&&!p.section_archived&&!p.notebook_archived}"><button draggable="${state.canWrite&&!p.archived&&!p.section_archived&&!p.notebook_archived}" data-note-page="${esc(p.id)}" aria-pressed="${current?.id===p.id}">${esc(p.title)}</button><button class="note-bookmark-menu" data-note-page-menu="${esc(p.id)}" aria-label="Options for page ${esc(p.title)}" title="Page options">⋯</button><small>${esc(p.notebook+' / '+p.section)}${p.archived||p.section_archived||p.notebook_archived?' · Archived':''}</small><p>${esc(p.excerpt)}</p></div>`).join('')||'<p>No matching pages. Change filters or create a page.</p>';if(morePages)$('notesPages').insertAdjacentHTML('beforeend','<button data-notes-more>Show 50 More</button>');}
 async function selectLocation(book='',section=''){
  if(!await flush(true))return;
  ++openGeneration;editor?.destroy();editor=null;current=null;dirty=false;recoveryReview=false;prefs.notebook=book;prefs.section=section;prefs.page='';savePrefs();tree();
  const location=section||book;
  $('noteCommandMenu')?.remove();
  const title=folders.find(f=>f.id===location)?.title||'All pages';
  $('notesEditorPanel').innerHTML=`<div class="notes-welcome"><h3>${esc(title)}</h3><p>No page is open here. Choose a page on the left, or add one to this section.</p><button data-note-new="page" ${!state.canWrite?'disabled':''}>＋ Add page</button></div>`;
  await loadPages();if((prefs.section||prefs.notebook)!==location)return;
  if(pages.length)await openPage(pages[0].id);
  else $('notesEditorPanel').innerHTML=`<div class="notes-welcome"><h3>${esc(title)}</h3><p>This location has no matching pages. Add a page here to start writing, or clear your search and filters.</p><button data-note-new="page" ${!state.canWrite?'disabled':''}>＋ Add page</button></div>`;
 }
 function pageStreams(value){options($('noteStream'),state.streams.filter(s=>s.project_id===$('noteProject').value),'No Workstream');$('noteStream').value=value||'';}
 async function openPage(id,loaded=null){
  if(!await flush(true))return;await checkpoint();const request=++openGeneration;const p=loaded||await api('/api/note?id='+encodeURIComponent(id));if(state.view!=='notes'||request!==openGeneration)return;if(editor)editor.destroy();current=p;lastCheckpoint=0;prefs.page=p.id;savePrefs();dirty=false;recoveryReview=false;recoveryEditing=false;historyBefore='';const locked=disabled();
  $('notesEditorPanel').innerHTML=`<div class="note-ribbon"><div class="note-ribbon-tabs" role="tablist" aria-label="Editing menu">${['Home','Insert','View'].map((t,i)=>`<button role="tab" id="noteTab${t}" aria-controls="noteRibbon${t}" aria-selected="${!i}" tabindex="${i?-1:0}" data-note-tab="${t}">${t}</button>`).join('')}<span id="noteSaveState" role="status" aria-live="polite">${esc(savedTime(p.updated_at))}</span><button type="button" data-note-focus aria-pressed="false">Focus page</button><button data-note-save title="Save now" ${locked?'disabled':''}>Save</button></div><div id="noteToolbar" class="note-toolbar" aria-label="Note Formatting"><div id="noteRibbonHome" role="tabpanel" aria-labelledby="noteTabHome"><div class="note-ribbon-group"><div class="note-ribbon-tools">${ribbonButton('undo','↶','Undo',locked)}${ribbonButton('redo','↷','Redo',locked)}</div><small>History</small></div><div class="note-ribbon-group"><div class="note-ribbon-tools"><select id="noteTextStyle" aria-label="Text style" ${locked?'disabled':''}><option value="paragraph">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>${ribbonButton('bold','<b>B</b>','Bold (Ctrl+B)',locked)}${ribbonButton('italic','<i>I</i>','Italic (Ctrl+I)',locked)}${ribbonButton('underline','<u>U</u>','Underline (Ctrl+U)',locked)}${ribbonButton('strike','<s>S</s>','Strikethrough',locked)}${colourSelect('highlight','Highlight','No highlight',locked)}${colourSelect('textColour','Text colour','Default text colour',locked)}</div><small>Text</small></div><div class="note-ribbon-group"><div class="note-ribbon-tools">${ribbonButton('bullet','• List','Bullet list',locked)}${ribbonButton('ordered','1. List','Numbered list',locked)}${ribbonButton('check','☑ Checklist','Checklist',locked)}${ribbonButton('quote','❝','Quote',locked)}</div><small>Paragraph</small></div></div><div id="noteRibbonInsert" role="tabpanel" aria-labelledby="noteTabInsert" hidden><div class="note-ribbon-group"><div class="note-ribbon-tools"><button data-note-screenshot ${locked?'disabled':''}>Screenshot</button><input id="noteScreenshotFile" type="file" accept="image/png,image/jpeg" hidden><button data-workflow='meeting' ${locked?'disabled':''}>Meeting</button><button data-workflow='todo' ${locked?'disabled':''}>System To Do</button><button data-workflow='project' ${locked?'disabled':''}>Project Reference</button>${ribbonButton('table','▦ Table','Insert table',locked)}${ribbonButton('link','↗ Link','Web link',locked)}${ribbonButton('rule','―','Divider',locked)}</div><small>Insert</small></div><div class="note-ribbon-group"><div class="note-ribbon-tools">${[['row','＋ Row'],['column','＋ Column'],['deleteRow','Remove row'],['deleteColumn','Remove column'],['deleteTable','Remove table']].map(([c,l])=>ribbonButton(c,l,l,locked)).join('')}</div><small>Table layout · select a cell first</small></div></div><div id="noteRibbonView" role="tabpanel" aria-labelledby="noteTabView" hidden><div class="note-ribbon-group"><div class="note-ribbon-tools"><button data-note-lines aria-pressed="false">☷ Rule lines</button><button data-note-history>Page history</button></div><small>Page view</small></div><div class="note-ribbon-group"><div class="note-ribbon-tools"><button data-note-archive-export>Export page + screenshots</button><button data-note-archive-import>Recover page archive</button><button data-note-export="html">Export HTML</button><button data-note-export="text">Export text</button></div><small>Download a copy</small></div></div></div></div><div class="note-page-canvas"><div class="note-breadcrumb">${esc(p.notebook)} <span>›</span> ${esc(p.section)} ${locked?' · Read only':''}</div><label class="note-title-label"><span class="sr-only">Page Title</span><input id="noteTitle" aria-label="Page Title" placeholder="Untitled page" maxlength="500" required value="${esc(p.title)}" ${locked?'disabled':''}></label><div class="note-page-info"><span id="noteSavedTime">${esc(savedTime(p.updated_at))}${locked?' · Read only':''}</span><button class="note-bookmark-menu" data-note-page-menu="${esc(p.id)}" aria-label="Options for page ${esc(p.title)}" title="Page options">⋯</button></div><details class="note-location"><summary>Location & project links${p.project_id?' · '+esc(state.projects.find(x=>x.id===p.project_id)?.name||'Linked'):''}</summary><div class="note-meta"><label>Section<select id="noteSection" ${locked?'disabled':''}></select></label><label>Linked Project<select id="noteProject" ${locked?'disabled':''}></select></label><label>Linked Workstream<select id="noteStream" ${locked?'disabled':''}></select></label></div></details><div id="noteRecovery"></div><div class="note-page-info" data-meeting-fold-controls hidden role="group" aria-label="Meeting display"><button type="button" data-meeting-fold-all="collapse">Collapse all meetings</button><button type="button" data-meeting-fold-all="expand">Expand all meetings</button></div><div id="noteRichEditor"></div><div id="noteHistory"></div></div><div class="note-statusbar"><span id="noteWordCount"></span><span>Saved notes are readable by connected AI</span></div>`;
  options($('noteSection'),folders.filter(f=>f.kind==='section'&&!f.archived&&!folders.find(n=>n.id===f.parent_id)?.archived).map(f=>({...f,name:(folders.find(n=>n.id===f.parent_id)?.title||'')+' / '+f.title})));if(![...$('noteSection').options].some(o=>o.value===p.section_id))$('noteSection').add(new Option(p.section,p.section_id));$('noteSection').value=p.section_id;
  options($('noteProject'),state.projects,'General Note');$('noteProject').value=p.project_id||'';pageStreams(p.workstream_id);
  editor=window.NoteEditor.create($('noteRichEditor'),p.doc,!locked,changed);window.MeetingJournal?.showUndo();editor.on('selectionUpdate',syncRibbon);editor.on('transaction',syncRibbon);syncRibbon();document.querySelectorAll('[data-note-page]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.notePage===p.id)));document.querySelector('.notes-layout').dataset.panel='editor';
  const draft=drafts();if(draft&&draft.id===p.id&&JSON.stringify(draft.values)===JSON.stringify(fields())){clearDraft();}else if(draft&&draft.id===p.id){recoveryReview=true;showRecovery();}
 }
 function focusMeeting(id){if(!editor)return;let pos=0,found;editor.state.doc.forEach((node,offset,index)=>{if(node.type.name==='meetingMeta'&&(node.attrs.meeting_id===id||!node.attrs.meeting_id&&index===0&&current.id===id))found={node,pos:offset};});if(found){editor.chain().focus().setTextSelection(Math.min(found.pos+found.node.nodeSize+1,editor.state.doc.content.size)).run();const dom=editor.view.nodeDOM(found.pos);dom?.scrollIntoView({block:'start'});editor.view.dispatch(editor.state.tr.scrollIntoView());editor.view.focus();}}
 async function showPage(id,meeting){if(!await flush(true))return;history.replaceState(null,'','/?note='+encodeURIComponent(id)+(meeting?'&meeting='+encodeURIComponent(meeting):''));return render();}
 function ribbonButton(command,label,title,locked){return `<button data-note-command="${command}" title="${title}" aria-label="${title}" ${locked?'disabled':''}>${label}</button>`;}
 function colourSelect(type,label,reset,locked){
  const options=Object.keys(NoteEditor.colours[type]).map(colour=>`<option value="${colour}">${colour[0].toUpperCase()+colour.slice(1)} ${type==='highlight'?'highlight':'text'}</option>`);
  return `<select data-note-colour="${type}" aria-label="${label}" ${locked?'disabled':''}><option value="" disabled>${label}</option>${options.join('')}<option value="reset">${reset}</option></select>`;
 }
 function setFocusMode(on){
  const button=document.querySelector('[data-note-focus]');
  if(!button)return;
  button.closest('.notes-app').classList.toggle('notes-focus',on);
  button.textContent=on?'Exit focus':'Focus page';
  button.setAttribute('aria-pressed',String(on));
 }
 function syncRibbon(){if(!editor)return;
  document.querySelectorAll('[data-note-colour]').forEach(select=>{
   select.disabled=disabled();
   select.value=editor.getAttributes(select.dataset.noteColour).colour||'';
  });
  const active={bold:'bold',italic:'italic',underline:'underline',strike:'strike',bullet:'bulletList',ordered:'orderedList',check:'taskList',quote:'blockquote'};document.querySelectorAll('[data-note-command]').forEach(b=>{const c=b.dataset.noteCommand;if(active[c])b.setAttribute('aria-pressed',String(editor.isActive(active[c])));if(['row','column','deleteRow','deleteColumn','deleteTable'].includes(c))b.disabled=disabled()||!editor.isActive('table');if(c==='undo')b.disabled=disabled()||!editor.can().undo();if(c==='redo')b.disabled=disabled()||!editor.can().redo();});if($('noteTextStyle'))$('noteTextStyle').value=editor.isActive('heading')?'h'+editor.getAttributes('heading').level:'paragraph';const words=editor.getText().trim().split(/\s+/).filter(Boolean).length;if($('noteWordCount'))$('noteWordCount').textContent=words+' word'+(words===1?'':'s');}
 function ribbonTab(name){document.querySelectorAll('[data-note-tab]').forEach(b=>{const on=b.dataset.noteTab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;$('noteRibbon'+b.dataset.noteTab).hidden=!on;});}
 document.addEventListener('mousedown',e=>{if(e.target.closest('[data-note-command],[data-note-task],[data-workflow],[data-note-screenshot]'))e.preventDefault();});
 document.addEventListener('keydown',e=>{const tab=e.target.closest('[data-note-tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...document.querySelectorAll('[data-note-tab]')],i=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;ribbonTab(tabs[next].dataset.noteTab);tabs[next].focus();}if(state.view==='notes'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.querySelector(recoveryReview?'#noteRecovery [data-draft-review]':'[data-note-save]')?.click();}if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('dialog[open]'))setFocusMode(false);});
 function noteDraftText(n){return n.type==='text'?n.text:(n.content||[]).map(noteDraftText).join(['paragraph','heading'].includes(n.type)?'':'\n');}
 function showRecovery(){
  const host=$('noteRecovery');
  if(!host)return;
  const locked=disabled();
  editor?.setEditable(!locked,false);
  for(const id of ['noteTitle','noteSection','noteProject','noteStream','noteTextStyle']){
   if($(id))$(id).disabled=locked;
  }
  const save=document.querySelector('[data-note-save]');
  if(save)save.disabled=true;
  host.innerHTML=`<section class="note-recovery" aria-label="Draft recovery">
   <div><strong>${recoveryEditing?'Editing recovered draft':'Unsaved changes recovered'}</strong>
   <p>${recoveryEditing?'Autosave is paused until you apply the draft.':'Your draft is stored on this device. Review it alongside the saved page.'}</p></div>
   <button type="button" data-draft-review>Review changes</button>
  </section>`;
  say(recoveryEditing?'Editing draft · Autosave paused':'Draft awaiting review');
  syncRibbon();
 }

 const draftFields=[
  ['title','Page title',v=>v],
  ['section_id','Section',v=>folders.find(item=>item.id===v)?.title||'Section unavailable'],
  ['project_id','Linked project',v=>state.projects.find(item=>item.id===v)?.name||'Project unavailable'],
  ['workstream_id','Linked workstream',v=>state.streams.find(item=>item.id===v)?.name||'Workstream unavailable']
 ];
 const draftBlockLabels={paragraph:'Paragraph',heading:'Heading',blockquote:'Quote',bulletList:'Bulleted list',
  orderedList:'Numbered list',taskList:'Checklist',table:'Table',codeBlock:'Code block',horizontalRule:'Divider',
  screenshot:'Screenshot',meetingMeta:'Meeting details'};
 function draftBlockText(node){
  const a=node.attrs||{};
  switch(node.type){
   case 'text':{
    const marks=(node.marks||[]).map(mark=>mark.type==='link'?'link to '+mark.attrs.href:mark.type);
    return node.text+(marks.length?' ['+marks.join(', ')+']':'');
   }
   case 'hardBreak':return '\n';
   case 'systemTask':case 'projectRef':return a.label||'Linked record';
   case 'meetingMeta':return [a.topic,ukMeetingTime(a.when,a.timezone)?.replace('T',' '),'UK time (GMT/BST)',a.participants].filter(Boolean).join('\n');
   case 'screenshot':return a.alt||'Screenshot';
   case 'taskItem':return (a.checked?'☑ ':'☐ ')+(node.content||[]).map(draftBlockText).join(' ');
   case 'listItem':return '• '+(node.content||[]).map(draftBlockText).join(' ');
   case 'tableRow':return (node.content||[]).map(draftBlockText).join(' | ');
   default:return (node.content||[]).map(draftBlockText).join(['paragraph','heading','codeBlock'].includes(node.type)?'':'\n');
  }
 }

 function draftDifferences(saved,values){
  const changes=draftFields.flatMap(([key,label,display])=>(saved[key]??null)===(values[key]??null)?[]:[{
   label,before:{text:saved[key]?display(saved[key]):'None'},after:{text:values[key]?display(values[key]):'None'}
  }]);
  const blocks=doc=>{
   try{return editor.schema.nodeFromJSON(doc).toJSON().content||[];}
   catch{return doc.content||[];}
  };
  const before=blocks(saved.doc),after=blocks(values.doc);
  const a=before.map(block=>JSON.stringify(block)),b=after.map(block=>JSON.stringify(block));
  const append=(left,right)=>{
   const block=right||left;
   changes.push({label:draftBlockLabels[block.type]||'Content block',
    before:left&&{text:draftBlockText(left),node:left},after:right&&{text:draftBlockText(right),node:right}});
  };
  let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start])start++;
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
  const width=endB-start+1,height=endA-start+1;
  // Bound the comparison cost for long notes. Equal ends are removed before aligning the middle.
  const matches=[];
  if(width*height<=250000){
   const lengths=new Uint16Array(width*height);
   for(let i=height-2;i>=0;i--)for(let j=width-2;j>=0;j--){
    const cell=i*width+j;
    lengths[cell]=a[start+i]===b[start+j]?1+lengths[cell+width+1]:Math.max(lengths[cell+1],lengths[cell+width]);
   }
   let i=0,j=0;
   while(i<height-1&&j<width-1){
    if(a[start+i]===b[start+j])matches.push([start+i++,start+j++]);
    else if(lengths[(i+1)*width+j]>=lengths[i*width+j+1])i++;
    else j++;
   }
  }
  let left=start,right=start;
  for(const [nextA,nextB] of [...matches,[endA,endB]]){
   while(left<nextA||right<nextB){
    if(left<nextA&&right<nextB&&a[left]===b[right]){left++;right++;continue;}
    if(left<nextA&&right<nextB&&before[left].type===after[right].type)append(before[left++],after[right++]);
    else{
     if(left<nextA)append(before[left++],null);
     if(right<nextB)append(null,after[right++]);
    }
   }
   left=nextA+1;right=nextB+1;
  }
  return changes;
 }

 function draftTextHighlight(before,after){
  if(before===after)return [esc(before),esc(after)];
  const a=before.match(/\S+|\s+/g)||[],b=after.match(/\S+|\s+/g)||[];
  let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start])start++;
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
  const format=(tokens,end,tag)=>esc(tokens.slice(0,start).join(''))+
   `<${tag}>${esc(tokens.slice(start,end).join(''))}</${tag}>`+esc(tokens.slice(end).join(''));
  return [format(a,endA,'del'),format(b,endB,'ins')];
 }

 document.addEventListener('cancel',event=>{
  if(event.target.id==='draftReview'&&reviewBusy)event.preventDefault();
 },true);

 function draftDate(value){
  const date=new Date(typeof value==='string'&&!/[zZ]|[+-]\d\d:\d\d$/.test(value)?value.replace(' ','T')+'Z':value);
  if(!value||Number.isNaN(date.getTime()))return 'Time unavailable';
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',dateStyle:'short',timeStyle:'short'}).format(date);
  return parts+' · Italy time';
 }

 function renderDraftChanges(limit){
  const host=$('draftChanges');
  const items=review.changes.slice(0,limit);
  for(const dom of host.querySelectorAll('[data-draft-image]')){
   document.dispatchEvent(new CustomEvent('note-screenshot-unload',{detail:{dom}}));
  }
  host.innerHTML=items.map(({label,before,after})=>{
   const kind=before?(after?'edited':'removed'):'added';
   const [oldText,newText]=before&&after?draftTextHighlight(before.text,after.text):[esc(before?.text),esc(after?.text)];
   const panel=(name,item,text)=>`<div class="draft-side"><span>${name}</span>${
    item?.node?.type==='screenshot'?'<img alt="'+esc(item.text)+'" data-draft-image="'+esc(item.node.attrs.image_id)+'">'
    :`<div class="draft-text">${text||(item?'(Empty)':'—')}</div>`}</div>`;
   const detail=before?.node&&after?.node&&before.text===after.text&&before.node.type!=='screenshot'?
    '<p class="draft-detail">Formatting, layout or linked details changed.</p>':'';
   return `<article class="draft-change" data-change="${kind}"><h3><span>${kind}</span> ${label}</h3>${detail}
    <div class="draft-sides">${panel('Saved',before,oldText)}${panel('Draft',after,newText)}</div></article>`;
  }).join('')||(review.saved?'<p class="draft-empty">The saved page already matches this draft.</p>':
   `<div class="draft-offline-preview"><h3>Draft preview</h3><div class="draft-text">${esc(noteDraftText(review.draft.values.doc))}</div></div>`);
  if(items.length<review.changes.length)host.insertAdjacentHTML('beforeend',
   `<button data-draft-more="${items.length+30}">Show more changes (${review.changes.length-items.length} left)</button>`);
  host.querySelectorAll('[data-draft-image]').forEach(dom=>document.dispatchEvent(new CustomEvent('note-screenshot-load',{detail:{dom,id:dom.dataset.draftImage}})));
 }

 let review=null,reviewBusy=false,copyAttempt=null;
 function renderDraftReview(draft,saved,message='',offline=false){
  const dlg=$('draftReview');
  for(const dom of dlg.querySelectorAll('[data-draft-image]')){
   document.dispatchEvent(new CustomEvent('note-screenshot-unload',{detail:{dom}}));
  }
  const changes=saved?draftDifferences(saved,draft.values):[];
  review={draft,saved,changes};
  const locked=!state.canWrite||offline||!saved||saved.archived||saved.section_archived||saved.notebook_archived;
  const newer=saved&&saved.version!==draft.version;
  dlg.innerHTML=`<header><div><h2 id="draftReviewTitle">Review unsaved changes</h2>
   <p class="draft-page-title">${esc(saved?.title||draft.values.title)}</p></div><button data-draft-close>Close</button></header>
   <div class="draft-review-body">
    <div class="draft-versions"><div><strong>${offline&&saved?'Last loaded saved page':'Saved page'}</strong><span>${saved?esc(draftDate(saved.updated_at)):'Unavailable'}</span></div>
    <div><strong>Local draft</strong><span>${esc(draftDate(draft.at))}</span></div></div>
    <p id="draftReviewNotice" role="status">${esc(message||(newer?'The saved page changed after this draft started.':''))}</p>
    <h3 class="draft-change-count">${saved?changes.length+' '+(changes.length===1?'change':'changes'):''}</h3>
    <div id="draftChanges"></div>
   </div>
   <footer>
    <div id="draftConfirm" hidden></div>
    <div class="draft-review-actions">
     <button class="draft-primary" data-draft-action="apply" ${locked?'disabled':''}>Use draft on this page</button>
     <button data-draft-action="discard" ${offline||!saved?'disabled':''}>Keep saved page</button>
     <button data-draft-action="copy" ${!state.canWrite||offline||!saved?'disabled':''}>Save draft as a new page</button>
    </div>
    <div class="draft-review-options">
     <button data-draft-action="edit" ${locked?'disabled':''}>Edit draft</button>
     <details><summary>More options</summary><button data-draft-export>Download draft text</button></details>
     ${offline?'<button data-draft-review>Refresh comparison</button>':''}
    </div>
   </footer>`;
  renderDraftChanges(30);
  if(!dlg.open)dlg.showModal();
  dlg.querySelector('[data-draft-close]').focus();
 }

 async function reviewDraft(){
  clearTimeout(timer);
  const dlg=$('draftReview')||document.body.appendChild(Object.assign(document.createElement('dialog'),{id:'draftReview'}));
  dlg.setAttribute('aria-labelledby','draftReviewTitle');
  if(!dlg.open){
   dlg.innerHTML='<header><h2 id="draftReviewTitle">Review unsaved changes</h2><button data-draft-close>Close</button></header><p role="status">Loading the saved page…</p>';
   dlg.showModal();
  }
  // Read from the editor after opening the modal, which moves focus off the title field.
  if(recoveryEditing&&dirty)keepDraft();
  const draft=drafts();
  if(!draft||draft.id!==current?.id){dlg.close();announce('No draft is available for this page.');return;}
  const endpoint='/api/note?id='+encodeURIComponent(draft.id);
  try{
   const saved=await api(endpoint);
   if(dlg.open)renderDraftReview(draft,saved);
  }catch{
   if(dlg.open)renderDraftReview(draft,current?.id===draft.id?current:null,'The latest saved page is unavailable. Your draft is still on this device. Refresh the comparison when connected.',true);
  }
 }

 function editRecoveredDraft(draft){
  recoveryEditing=true;dirty=true;editSeq++;
  $('noteTitle').value=draft.values.title;
  $('noteSection').value=draft.values.section_id;
  $('noteProject').value=draft.values.project_id||'';
  pageStreams(draft.values.workstream_id);
  editor.commands.setContent(draft.values.doc,{emitUpdate:false});
  $('draftReview').close();showRecovery();editor.commands.focus();
 }

 async function resolveDraft(action){
  const {draft,saved}=review;
  if(!saved||current?.id!==draft.id)return;
  if(action!=='discard'&&!state.canWrite)return;
  if(action==='edit'){editRecoveredDraft(draft);return;}
  const endpoint='/api/note?id='+encodeURIComponent(draft.id);
  if(action==='discard'){
   const latest=await api(endpoint);
   if(latest.version!==saved.version){renderDraftReview(draft,latest,'The saved page changed during review. Review the updated comparison.');return;}
   await finishDraft(latest,'Kept the saved page.');
   return;
  }
  const write=(values,id)=>window.NoteMedia?NoteMedia.save(values,id):api('/api/write',{kind:'save_note',input:values,operation_id:id});
  if(action==='copy'){
   if(!copyAttempt||copyAttempt.draft.id!==draft.id||copyAttempt.draft.at!==draft.at){
    const content=(draft.values.doc.content||[]).map(n=>n.type==='meetingMeta'?
     {...n,attrs:{...n.attrs,meeting_id:crypto.randomUUID()}}:n);
    const suffix=' (Recovered draft)';
    copyAttempt={draft,id:crypto.randomUUID(),values:{...draft.values,
     doc:{...draft.values.doc,content},title:draft.values.title.slice(0,500-suffix.length)+suffix}};
   }
   const result=await write(copyAttempt.values,copyAttempt.id);
   const page=await api('/api/note?id='+encodeURIComponent(result.record.id));
   await finishDraft(page,'Draft saved as a new page.');
   return;
  }
  let result;
  try{
   result=await write({...draft.values,id:draft.id,expected_version:saved.version,checkpoint:true},crypto.randomUUID());
  }catch(error){
   const latest=await api(endpoint).catch(()=>null);
   if(!latest||latest.version===saved.version)throw error;
   renderDraftReview(draft,latest,'The saved page changed during review. Review the updated comparison.');
   return;
  }
  const location=folders.find(f=>f.id===draft.values.section_id),book=folders.find(f=>f.id===location?.parent_id);
  await finishDraft({...saved,...draft.values,...result.record,title:draft.values.title.trim(),
   section:location?.title||saved.section,notebook:book?.title||saved.notebook},'Draft saved on this page.');
 }

 async function finishDraft(page,message){
  clearTimeout(timer);
  dirty=false;recoveryReview=false;recoveryEditing=false;
  clearDraft();copyAttempt=null;
  $('draftReview').close();
  await openPage(page.id,page);
  say(message);announce(message);
  await loadPages();
 }

 async function handleDraftAction(button){
  if(reviewBusy)return;
  if(button.hasAttribute('data-draft-close')){$('draftReview').close();return;}
  if(button.dataset.draftMore){renderDraftChanges(Number(button.dataset.draftMore));return;}
  if(button.hasAttribute('data-draft-export')){
   const draft=review.draft;
   downloadPrivate(draft.values.title+'\n\n'+noteDraftText(draft.values.doc),'Recovered-note-draft.txt','text/plain');
   return;
  }
  const action=button.dataset.draftAction;
  if(!action)return;
  const confirm=$('draftConfirm');
  const requiresConfirm=action==='discard'||(action==='apply'&&review.saved.version!==review.draft.version);
  if(requiresConfirm&&!button.hasAttribute('data-draft-confirm')){
   confirm.hidden=false;
   confirm.innerHTML=action==='discard'?
    '<p>Delete the local draft and open the saved page?</p><button data-draft-action="discard" data-draft-confirm>Discard local draft</button>':
    '<p>Replace the current page with your draft? The current page will be available in Page History.</p><button data-draft-action="apply" data-draft-confirm>Replace with draft</button>';
   confirm.querySelector('button').focus();return;
  }
  reviewBusy=true;
  const buttons=[...$('draftReview').querySelectorAll('button:not(:disabled)')];
  buttons.forEach(item=>item.disabled=true);
  try{await resolveDraft(action);}
  catch(error){
   const notice=$('draftReviewNotice');
   if(notice&&$('draftReview').open)notice.textContent=error.message+' Your local draft is still available.';
   else announce(error.message);
  }finally{reviewBusy=false;buttons.forEach(item=>item.disabled=false);}
 }
 async function itemMenu(kind,id){
  if(!await flush(true))return;folders=await collectFolders();
  let item;if(kind==='page'){if(current?.id!==id)await openPage(id);item=current;if(item?.id!==id)return;}else item=folders.find(f=>f.id===id);
  if(!item)return;const inherited=kind==='page'?(item.section_archived||item.notebook_archived):kind==='section'?folders.find(f=>f.id===item.parent_id)?.archived:false,locked=!state.canWrite||!!inherited;
  toolsDialog(kind[0].toUpperCase()+kind.slice(1)+' options',`<h3>${esc(item.title)}</h3><div class="note-item-actions">${item.archived?`<button data-note-item-restore="${esc(id)}" data-kind="${kind}" ${locked?'disabled':''}>Restore ${kind}</button>`:''}<button data-note-item-rename="${esc(id)}" data-kind="${kind}" ${locked||item.archived?'disabled':''}>Rename ${kind}</button>${kind!=='notebook'?`<button data-note-item-move="${esc(id)}" data-kind="${kind}" ${locked||item.archived?'disabled':''}>Move ${kind}</button>`:''}<button data-note-item-delete="${esc(id)}" data-kind="${kind}" ${locked||item.archived?'disabled':''}>Archive ${kind}</button>${kind==='page'?`<button data-note-task ${locked||item.archived?'disabled':''}>Create task from selection</button><button data-note-history>Page history</button><button data-note-archive-export>Export page + screenshots</button><button data-note-archive-import ${locked||item.archived?'disabled':''}>Recover page archive</button><button data-note-export="html">Export HTML</button><button data-note-export="text">Export text</button><a href="/?note=${esc(item.id)}">Open page link</a>`:''}</div>${kind==='section'?window.NoteLayout?.colorPicker(item)||'':''}<p>Archive hides this ${kind}. Contents and history remain recoverable through Archived items.</p>${inherited?'<p>Restore the parent notebook or section first.</p>':''}`);
 }
 let archivedItems=new Map();
 async function archivedView(){if(!await flush(true))return;const all=[];for(const endpoint of ['/api/note-folders','/api/notes']){let after='';do{const r=await api(endpoint+'?'+new URLSearchParams({archived:'all',after_id:after}));all.push(...r.items);after=r.has_more?r.next_after_id:'';}while(after);}archivedItems=new Map(all.map(i=>[i.id,i]));const archived=all.filter(i=>i.archived||i.section_archived||i.notebook_archived);toolsDialog('Archived items',`<p>Archived contents and page history are kept. Restore parent notebooks and sections before their pages.</p>${archived.map(i=>{const kind=i.kind||'page',parent=kind==='page'?(i.section_archived||i.notebook_archived):kind==='section'?archivedItems.get(i.parent_id)?.archived:false;return `<div class="archived-item"><span><strong>${esc(i.title)}</strong> · ${kind}${parent?' · Parent archived':''}</span>${kind==='page'?`<button data-archived-open="${esc(i.id)}">View page</button>`:''}<button data-archived-restore="${esc(i.id)}" ${!state.canWrite||!i.archived||parent?'disabled':''}>Restore ${kind}</button></div>`;}).join('')||'<p>No archived items.</p>'}`);}
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;(async()=>{if(b.hasAttribute('data-notes-archived'))await archivedView();if(b.dataset.archivedOpen){$('toolsDialog').close();prefs.archived=true;savePrefs();await showPage(b.dataset.archivedOpen);}if(b.dataset.archivedRestore){if(!state.canWrite)return;b.disabled=true;const item=archivedItems.get(b.dataset.archivedRestore);if(!item)throw Error('Reopen Archived items and try again.');await api('/api/write',{kind:item.kind?'save_note_folder':'save_note',input:{id:item.id,expected_version:item.version,archived:false,...(item.kind?{kind:item.kind,title:item.title,parent_id:item.parent_id}:{})},operation_id:crypto.randomUUID()});await refreshLayout();await archivedView();announce('Restored from archive.');}})().catch(error=>{if($('toolsDialog')?.open)$('toolsError').textContent=error.message;else announce(error.message);b.disabled=false;});});
 async function moveSection(id){
  if(!await flush(true))return;const item=folders.find(f=>f.id===id);if(!item)return;
  toolsDialog('Move section',`<form id="noteFolderForm" data-id="${esc(id)}" data-kind="section" data-version="${item.version}"><input type="hidden" name="title" value="${esc(item.title)}"><p>${esc(item.title)}</p><label>Destination notebook<select name="parent_id" required>${folders.filter(n=>n.kind==='notebook'&&!n.archived).map(n=>`<option value="${esc(n.id)}" ${n.id===item.parent_id?'selected':''}>${esc(n.title)}</option>`).join('')}</select></label><p>Moves this section together with all of its pages and history.</p><button>Move section</button></form>`);
 }
 async function movePage(){
  if(!current||!await flush(true))return;folders=await collectFolders();
  const sections=folders.filter(f=>f.kind==='section'&&!f.archived&&!folders.find(n=>n.id===f.parent_id)?.archived);
  toolsDialog('Move page',`<form id="noteMovePage" data-id="${esc(current.id)}" data-version="${current.version}" data-operation="${crypto.randomUUID()}"><p>${esc(current.title)}</p><label>Destination section<select name="section" required>${sections.map(f=>`<option value="${esc(f.id)}" ${f.id===current.section_id?'selected':''}>${esc((folders.find(n=>n.id===f.parent_id)?.title||'')+' / '+f.title)}</option>`).join('')}</select></label><p>Moves the same page and its history.</p><button>Move page</button></form>`);
 }
 async function deleteItem(kind,id){
  if(!await flush(true))return;const item=kind==='page'?current:folders.find(f=>f.id===id);if(!item||item.id!==id)return;
  toolsDialog('Archive '+kind,`<form id="noteDeleteItem" data-id="${esc(id)}" data-kind="${kind}" data-version="${item.version}" data-operation="${crypto.randomUUID()}"><p>Archive <strong>${esc(item.title)}</strong>?</p><p>${kind==='notebook'?'This notebook, its sections and pages will be hidden in the archive.':kind==='section'?'This section and its pages will be hidden in the archive.':'This page will be hidden in the archive.'} Contents and history are kept. Restore using Archived items.</p><button>Archive ${kind}</button><button type="button" data-note-item-cancel>Cancel</button></form>`);
 }
 document.addEventListener('submit',async e=>{
  if(!['noteMovePage','noteDeleteItem'].includes(e.target.id))return;e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;
  try{if(!await flush(true))return;const id=f.dataset.id,version=Number(f.dataset.version),d=new FormData(f);
   if(f.id==='noteMovePage'){const target=folders.find(x=>x.id===d.get('section'));if(!target)throw Error('Choose an active section.');await api('/api/write',{kind:'save_note',input:{id,expected_version:version,section_id:target.id,checkpoint:true},operation_id:f.dataset.operation});prefs.section=target.id;prefs.notebook=target.parent_id;prefs.page=id;}
   else if(f.dataset.kind==='page'){await api('/api/write',{kind:'save_note',input:{id,expected_version:version,archived:true,checkpoint:true},operation_id:f.dataset.operation});prefs.page='';}
   else{const item=folders.find(x=>x.id===id);await api('/api/write',{kind:'save_note_folder',input:{id,kind:item.kind,expected_version:version,title:item.title,parent_id:item.parent_id,archived:true},operation_id:f.dataset.operation});if(prefs.section===id||prefs.notebook===id){prefs.notebook='';prefs.section='';prefs.page='';}}
   savePrefs();$('toolsDialog').close();render();announce(f.id==='noteMovePage'?'Page moved.':'Moved to archive. Use Archived items to restore.');
  }catch(error){$('toolsError').textContent=error.message;}finally{b.disabled=false;}
 });
 async function manage(kind,id,book){if(!await flush(true))return;const f=id?folders.find(x=>x.id===id):null;const title=f?.title||'';const section=kind==='section'||f?.kind==='section';toolsDialog(f?'Manage '+f.kind:'New '+kind,`<form id="noteFolderForm" data-id="${esc(id||'')}" data-kind="${esc(f?.kind||kind)}" data-version="${f?.version||0}"><label>Title<input name="title" required maxlength="180" value="${esc(title)}"></label>${section?`<label>Notebook<select name="parent_id" required>${folders.filter(n=>n.kind==='notebook'&&(!n.archived||n.id===f?.parent_id)).map(n=>`<option value="${esc(n.id)}" ${(f?.parent_id||book)===n.id?'selected':''}>${esc(n.title)}</option>`).join('')}</select></label>`:''}<label><input type="checkbox" name="archived" ${f?.archived?'checked':''}>Archived (keeps contents and history)</label><button ${!state.canWrite?'disabled':''}>Save ${section?'Section':'Notebook'}</button></form>`);}
 function newPageSectionOptions(){
  const book=$('newNoteNotebook').value,sections=folders.filter(f=>f.kind==='section'&&f.parent_id===book&&!f.archived).sort((a,b)=>a.title.localeCompare(b.title));
  options($('newNoteSection'),sections,sections.length?undefined:'General — created with this page');
  if(sections.some(s=>s.id===prefs.section))$('newNoteSection').value=prefs.section;
  $('newNoteSectionHint').textContent=sections.length?'Choose where this page belongs.':'This notebook has no sections yet. A General section will be created automatically when you create the page.';
 }
 async function newPage(){
  if(!await flush(true))return;folders=await collectFolders();tree();
  const books=folders.filter(f=>f.kind==='notebook'&&!f.archived).sort((a,b)=>a.title.localeCompare(b.title));
  if(!books.length){await manage('notebook');announce('Create a notebook first. Then choose New Page; its first section will be created automatically.');return;}
  const selected=books.some(n=>n.id===prefs.notebook)?prefs.notebook:folders.find(f=>f.id===prefs.section)?.parent_id||books[0].id;
  toolsDialog('New Page',`<form id="newNoteForm"><label>Title<input name="title" required maxlength="500" value="Untitled Note"></label><label>Notebook<select id="newNoteNotebook" name="notebook_id" required>${books.map(n=>`<option value="${esc(n.id)}" ${selected===n.id?'selected':''}>${esc(n.title)}</option>`).join('')}</select></label><label>Section<select id="newNoteSection" name="section_id"></select></label><p id="newNoteSectionHint" class="sub"></p><button>Create Page</button></form>`);newPageSectionOptions();
 }

 async function historyPage(append=false){if(!current)return;const r=await api('/api/note-history?'+new URLSearchParams({id:current.id,before:append?historyBefore:''}));historyBefore=r.next_before||'';const markup=r.items.map(v=>`<p>Version ${v.page_version} · ${esc(v.saved_at)} · ${esc(v.reason)} <button data-note-preview="${esc(v.id)}">Preview</button></p>`).join('')||'<p>No checkpoints yet.</p>';if(!append)$('noteHistory').innerHTML='<h3>Saved Page Versions</h3><p>Checkpoints at least every five minutes while editing and when leaving a page. Autosaved current content is shown above.</p>';$('noteHistory').querySelector('[data-note-more-history]')?.remove();$('noteHistory').insertAdjacentHTML('beforeend',markup+(r.has_more?'<button data-note-more-history>Older Versions</button>':''));}
 document.addEventListener('input',e=>{if(['noteTitle'].includes(e.target.id))changed();if(e.target.id==='noteSearch'){prefs.query=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadPages().catch(e=>announce(e.message)),250);}});
 document.addEventListener('change',async e=>{try{
  const type=e.target.dataset.noteColour;
  if(type&&editor&&!disabled()){
   const colour=e.target.value,command=editor.chain().focus();
   (colour==='reset'?command.unsetMark(type):command.setMark(type,{colour})).run();
   syncRibbon();
   return;
  }
  if(e.target.id==='noteTextStyle'&&editor){const v=e.target.value,c=editor.chain().focus();(v==='paragraph'?c.setParagraph():c.setHeading({level:Number(v.slice(1))})).run();}if(e.target.id==='newNoteNotebook')newPageSectionOptions();if(e.target.id==='notesArchived'){if(!await flush(true))return;prefs.archived=e.target.checked;render();}if(e.target.id==='notesProject'){prefs.project=e.target.value;scopeStreams();await loadPages();}if(e.target.id==='notesStream'){prefs.stream=e.target.value;await loadPages();}if(e.target.id==='noteProject'){pageStreams('');changed();}if(['noteStream','noteSection'].includes(e.target.id))changed();}catch(error){announce(error.message);}});
 document.addEventListener('submit',async e=>{if(!['noteFolderForm','newNoteForm'].includes(e.target.id))return;e.preventDefault();const f=e.target,button=f.querySelector('button');button.disabled=true;try{const d=new FormData(f);if(f.id==='noteFolderForm'){const savedFolder=await api('/api/write',{kind:'save_note_folder',input:{...(f.dataset.id?{id:f.dataset.id,expected_version:Number(f.dataset.version)}:{kind:f.dataset.kind}),title:d.get('title'),parent_id:d.get('parent_id')||null,archived:d.has('archived')},operation_id:crypto.randomUUID()});if(f.dataset.kind==='section'&&f.dataset.id){prefs.notebook=d.get('parent_id');prefs.section=f.dataset.id;prefs.page='';savePrefs();}if(!f.dataset.id){prefs.notebook=f.dataset.kind==='notebook'?savedFolder.record.id:d.get('parent_id');prefs.section=f.dataset.kind==='section'?savedFolder.record.id:'';prefs.page='';savePrefs();}$('toolsDialog').close();render();announce(f.dataset.kind==='section'?'Section saved.':'Notebook saved.');}else{const r=await api('/api/write',{kind:'save_note',input:{title:d.get('title'),...(d.get('section_id')?{section_id:d.get('section_id')}:{notebook_id:d.get('notebook_id')}),project_id:prefs.project||null,workstream_id:prefs.stream||null},operation_id:crypto.randomUUID()});$('toolsDialog').close();folders=await collectFolders();const created=await api('/api/note?id='+encodeURIComponent(r.record.id));prefs.section=created.section_id;prefs.notebook=folders.find(f=>f.id===created.section_id)?.parent_id||'';tree();await loadPages();await openPage(r.record.id);}}catch(error){$('toolsError').textContent=error.message;}finally{button.disabled=false;}});
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
  if(b.hasAttribute('data-notes-collapse')){prefs.collapsed=!prefs.collapsed;savePrefs();document.querySelector('.notes-layout')?.classList.toggle('notebooks-collapsed',prefs.collapsed);b.textContent=prefs.collapsed?'Show sidebar':'Hide sidebar';b.setAttribute('aria-expanded',String(!prefs.collapsed));}
  if(b.hasAttribute('data-notes-drafts')){if(saving)await saving;const d=drafts()||await window.NoteDraftVault?.newest?.()||drafts(true);if(!d){announce('No unsent draft is stored in this browser.');return;}if(current?.id!==d.id&&!await flush(true))return;activateDraft(d);if(current?.id===d.id){recoveryReview=true;showRecovery();}else await openPage(d.id);}
  if(b.dataset.noteTab)ribbonTab(b.dataset.noteTab);
  if(b.hasAttribute('data-note-focus'))setFocusMode(b.getAttribute('aria-pressed')!=='true');
  if(b.hasAttribute('data-note-lines')){const on=$('noteRichEditor').classList.toggle('note-ruled');b.setAttribute('aria-pressed',String(on));}
  if(b.hasAttribute('data-notes-clear')){prefs.query='';prefs.project='';prefs.stream='';prefs.notebook='';prefs.section='';prefs.archived=false;if(!await flush(true))return;render();}
  if(b.dataset.notesPanel)document.querySelector('.notes-layout').dataset.panel=b.dataset.notesPanel;
  if(b.dataset.noteNew){if(b.dataset.noteNew==='page')await newPage();else await manage(b.dataset.noteNew,null,b.dataset.book);}
  if(b.dataset.noteManage){const item=folders.find(f=>f.id===b.dataset.noteManage);if(item)await itemMenu(item.kind,item.id);}
  if(b.dataset.notePageMenu)await itemMenu('page',b.dataset.notePageMenu);
  if(b.hasAttribute('data-note-item-cancel'))$('toolsDialog').close();
  if(b.dataset.noteItemRename){if(b.dataset.kind!=='page')await manage(null,b.dataset.noteItemRename);else{$('toolsDialog').close();$('noteTitle').focus();$('noteTitle').select();}}
  if(b.dataset.noteItemMove){if(b.dataset.kind==='section')await moveSection(b.dataset.noteItemMove);else await movePage();}
  if(b.dataset.noteItemDelete)await deleteItem(b.dataset.kind,b.dataset.noteItemDelete);
  if(b.dataset.noteItemRestore){const item=b.dataset.kind==='page'?current:folders.find(f=>f.id===b.dataset.noteItemRestore);await api('/api/write',{kind:b.dataset.kind==='page'?'save_note':'save_note_folder',input:{id:item.id,expected_version:item.version,archived:false,...(b.dataset.kind!=='page'?{kind:item.kind,title:item.title,parent_id:item.parent_id}:{})},operation_id:crypto.randomUUID()});$('toolsDialog').close();render();announce('Restored from archive.');}
  if(b.hasAttribute('data-notes-all')||b.dataset.noteBook||b.dataset.noteSection)await selectLocation(b.dataset.noteBook||folders.find(f=>f.id===b.dataset.noteSection)?.parent_id||'',b.dataset.noteSection||'');
  if(b.hasAttribute('data-notes-sections-all'))await selectLocation(prefs.notebook,'');
  if(b.dataset.notePage)await openPage(b.dataset.notePage);
  if(b.hasAttribute('data-notes-more'))await loadPages(true);
  if(b.hasAttribute('data-note-save')&&!recoveryReview)await flush(true);
  if(b.hasAttribute('data-draft-review')&&!reviewBusy){reviewBusy=true;try{await reviewDraft();}finally{reviewBusy=false;}}
  if(b.closest('#draftReview'))await handleDraftAction(b);
  if(b.hasAttribute('data-note-history')){if(await flush(true)){if($('toolsDialog')?.open)$('toolsDialog').close();await checkpoint();await historyPage();$('noteHistory')?.scrollIntoView({block:'start'});}}
  if(b.hasAttribute('data-note-more-history'))await historyPage(true);
  if(b.dataset.notePreview){const r=await api('/api/note-revision?'+new URLSearchParams({id:current.id,revision_id:b.dataset.notePreview}));toolsDialog('Preview Version '+r.page_version,`<h3>${esc(r.page.title)}</h3><pre class="note-text-preview">${esc(r.page.plain_text)}</pre><button data-note-restore-revision="${esc(r.id)}" ${disabled()?'disabled':''}>Restore This Version</button><p>Creates a new version and preserves the current page in history.</p>`);}
  if(b.dataset.noteRestoreRevision){if(!await flush(true))return;await api('/api/write',{kind:'restore_note_revision',input:{id:current.id,expected_version:current.version,revision_id:b.dataset.noteRestoreRevision},operation_id:crypto.randomUUID()});$('toolsDialog').close();await openPage(current.id);await loadPages();say('Saved — Previous Version Restored');}
  if(b.hasAttribute('data-note-archive')){if(!await flush(true))return;const r=await api('/api/write',{kind:'save_note',input:{id:current.id,expected_version:current.version,archived:!current.archived,checkpoint:true},operation_id:crypto.randomUUID()});await loadPages();await openPage(r.record.id);}
  if(b.dataset.meetingFoldAll&&editor)window.NoteEditor.foldAll(editor,b.dataset.meetingFoldAll==='collapse');
  if(b.dataset.noteCommand&&editor){if(disabled())return;const c=editor.chain().focus(),commands={strike:()=>c.toggleStrike(),quote:()=>c.toggleBlockquote(),rule:()=>c.setHorizontalRule(),bold:()=>c.toggleBold(),italic:()=>c.toggleItalic(),underline:()=>c.toggleUnderline(),heading:()=>c.toggleHeading({level:2}),paragraph:()=>c.setParagraph(),bullet:()=>c.toggleBulletList(),ordered:()=>c.toggleOrderedList(),check:()=>c.toggleTaskList(),table:()=>c.insertTable({rows:3,cols:3,withHeaderRow:true}),row:()=>c.addRowAfter(),column:()=>c.addColumnAfter(),deleteRow:()=>c.deleteRow(),deleteColumn:()=>c.deleteColumn(),deleteTable:()=>c.deleteTable(),undo:()=>c.undo(),redo:()=>c.redo()};if(b.dataset.noteCommand==='link'){toolsDialog('Add Web Link',`<form id="noteLinkForm"><label>Web Address<input name="url" type="url" required placeholder="https://example.com"></label><button>Add Link to Selected Text</button></form>`);}else commands[b.dataset.noteCommand]?.().run();}
  if(b.dataset.noteExport){if(b.dataset.noteExport==='html'&&window.NoteMedia){await NoteMedia.exportHTML();return;}const content=b.dataset.noteExport==='html'?`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${esc(fields().title)}</title><style>${NoteEditor.colourCSS}</style><h1>${esc(fields().title)}</h1>${editor.getHTML()}</html>`:fields().title+'\n\n'+editor.getText();downloadPrivate(content,(fields().title.replace(/[<>:"/\\|?*]/g,'_')||'Note')+(b.dataset.noteExport==='html'?'.html':'.txt'),b.dataset.noteExport==='html'?'text/html':'text/plain');}
  if(b.hasAttribute('data-note-task')){const text=editor.state.doc.textBetween(editor.state.selection.from,editor.state.selection.to,'\n').trim();if(!text){announce('Select the action text in the note first.');return;}if(!await flush(true))return;await edit(null);$('title').value=text.replace(/\s+/g,' ').slice(0,500);$('notes').value='From note: '+current.title+'\n'+location.origin+'/?note='+current.id+'\n\n'+text;$('editProject').value=current.project_id||'';await projectFields();$('stream').value=current.workstream_id||'';refreshFormState($('taskForm'));}
 }catch(error){say('Not Saved — '+error.message);announce(error.message);}});
 document.addEventListener('submit',e=>{if(e.target.id!=='noteLinkForm')return;e.preventDefault();try{const u=new URL(new FormData(e.target).get('url'));if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use a web link without credentials.');editor.chain().focus().extendMarkRange('link').setLink({href:u.href}).run();$('toolsDialog').close();}catch(error){$('toolsError').textContent=error.message;}});
 window.addEventListener('beforeunload',e=>{if(dirty||saving||mediaPending){if(!recoveryReview||recoveryEditing)keepDraft();e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)flush(true);});
 async function refreshLayout(){folders=await collectFolders();tree();await loadPages();}
 function afterMove(type,id,parent,oldParent){if(parent!==oldParent&&(type==='page'&&current?.id===id||type==='section'&&prefs.section===id)){
  if(type==='page'){prefs.section=parent;prefs.notebook=folders.find(f=>f.id===parent)?.parent_id||'';prefs.page=id;}else prefs.notebook=parent;
  savePrefs();return render();
 }return refreshLayout();}
 return {render,flush,checkpoint,hasPending:()=>dirty||!!saving||recoveryReview||mediaPending>0||layoutBusy,needsReview:()=>recoveryReview,detach:()=>{++openGeneration;editor?.destroy();editor=null;current=null;dirty=false;},editor:()=>editor,current:()=>current,acceptAction:r=>{current={...current,...r.note};editor.commands.setContent(r.doc,{emitUpdate:false});dirty=false;clearDraft();say(savedTime());},openPage,fields,showPage,focusMeeting,refreshLayout,afterMove,layoutState:()=>({folders,pages,current,prefs}),setLayoutBusy:value=>{layoutBusy=value;editor?.setEditable(!value&&!disabled(),false);if($('noteTitle'))$('noteTitle').disabled=value||disabled();if(value)say('Moving notes…');else if(!dirty)say(savedTime());},setMediaPending:value=>{mediaPending=Math.max(0,mediaPending+(value?1:-1));if(mediaPending)say('Saving screenshot…');else if(!dirty)say(savedTime());}};
})();
