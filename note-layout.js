'use strict';
// Measure only the visible navigation rows: labels can wrap and focus mode hides
// the sections. Individual style properties are compatible with the strict CSP.
(()=>{
 const mobile=matchMedia('(max-width:760px)');
 let app=null,frame=0,observed=[];
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const resize=new ResizeObserver(schedule);
 function update(){
  frame=0;
  const next=document.querySelector('.notes-app:not(.meeting-journal)'),workspace=document.getElementById('workspace');
  if(next!==app){resize.disconnect();observed=[];app=next;}
  if(!app)return;
  const topbar=app.querySelector('.notes-topbar'),sections=app.querySelector('.notes-sections-tabs'),menu=document.getElementById('mobileMenu');
  for(const el of [topbar,sections,menu])if(el&&!observed.includes(el)){resize.observe(el);observed.push(el);}
  const set=(el,key,value)=>{value=Math.ceil(value)+'px';if(el.style.getPropertyValue(key)!==value)el.style.setProperty(key,value);};
  set(workspace,'--notes-menu-height',mobile.matches?menu.getBoundingClientRect().height:0);
  set(app,'--notes-topbar-height',topbar?.getBoundingClientRect().height||0);
  set(app,'--notes-sections-height',sections?.getBoundingClientRect().height||0);
  const button=app.querySelector('[data-notes-collapse]');
  if(button){const open=mobile.matches?app.classList.contains('notes-mobile-sidebar-open'):!app.querySelector('.notes-layout')?.classList.contains('notebooks-collapsed'),label=open?'Hide sidebar':'Show sidebar';if(button.textContent!==label)button.textContent=label;if(button.getAttribute('aria-expanded')!==String(open))button.setAttribute('aria-expanded',String(open));}
 }
 document.addEventListener('click',e=>{
  if(!mobile.matches||!app)return;
  if(e.target.closest('[data-notes-collapse]')){e.preventDefault();e.stopImmediatePropagation();app.classList.toggle('notes-mobile-sidebar-open');schedule();}
  else if(e.target.closest('[data-note-page]')){app.classList.remove('notes-mobile-sidebar-open');schedule();}
 },true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&app){app.classList.remove('notes-mobile-sidebar-open');schedule();}});
 const start=()=>{const content=document.getElementById('content');if(content)new MutationObserver(schedule).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});schedule();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 mobile.addEventListener('change',schedule);
})();
window.NoteLayout=(()=>{
 const palette=[['Automatic','','auto'],['Purple','#8b5cf6','purple'],['Blue','#3b82f6','blue'],['Teal','#14b8a6','teal'],['Green','#22c55e','green'],['Orange','#f59e0b','orange'],['Red','#ef4444','red'],['Pink','#ec4899','pink'],['Grey','#64748b','grey']];
 function colorClass(section){const choice=palette.find(p=>p[1]===section.color);if(choice&&choice[2]!=='auto')return 'section-color-'+choice[2];const hash=[...section.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);return 'section-color-'+palette[1+hash%8][2];}
 function colorPicker(section){return `<div class="section-colours" role="group" aria-label="Section colour"><p>Section colour</p>${palette.map(([name,color,key])=>`<button class="section-swatch section-color-${key}" data-note-color="${color}" data-section="${esc(section.id)}" aria-label="${name}" aria-pressed="${(section.color||'')===color}" ${!state.canWrite||section.archived?'disabled':''}>${name}</button>`).join('')}</div>`;}
 let source=null;
 const clear=()=>document.querySelectorAll('.note-drop-target').forEach(e=>e.classList.remove('note-drop-target'));
 function destination(target){if(!source)return null;const row=target.closest('[data-note-drag]'),book=target.closest('[data-note-drop-book]');if(row){const type=row.dataset.noteDrag;if(source.id===row.dataset.noteId&&source.type===type)return null;if(source.type==='page'&&type==='section')return {element:row,kind:'section'};if(source.type===type)return {element:row,kind:type};}if(source.type==='section'&&book)return {element:book,kind:'notebook'};return null;}
 document.addEventListener('dragstart',e=>{const row=e.target.closest('[data-note-drag]');if(!row||!state.canWrite)return;if(WorkspaceNotes.needsReview()){e.preventDefault();announce('Resolve the recovered draft before moving notes.');return;}source={id:row.dataset.noteId,type:row.dataset.noteDrag};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-workspace-note',JSON.stringify(source));});
 function acceptDrop(e){const target=destination(e.target);clear();if(!target)return;e.preventDefault();e.dataTransfer.dropEffect='move';target.element.classList.add('note-drop-target');} document.addEventListener('dragenter',acceptDrop);document.addEventListener('dragover',acceptDrop);
 document.addEventListener('dragend',()=>{source=null;clear();});
 document.addEventListener('drop',e=>{const target=destination(e.target),drag=source;source=null;clear();if(!target||!drag)return;e.preventDefault();const current=WorkspaceNotes.layoutState(),item=(drag.type==='section'?current.folders:current.pages).find(i=>i.id===drag.id);if(!item)return;let parent,before=null,after=false;
  if(target.kind==='notebook')parent=target.element.dataset.noteDropBook;
  else if(drag.type==='page'&&target.kind==='section')parent=target.element.dataset.noteId;
  else{const dest=(drag.type==='section'?current.folders:current.pages).find(i=>i.id===target.element.dataset.noteId);if(!dest)return;parent=drag.type==='section'?dest.parent_id:dest.section_id;before=dest.id;const rect=target.element.getBoundingClientRect();after=drag.type==='section'?e.clientX>rect.left+rect.width/2:e.clientY>rect.top+rect.height/2;}
  move(drag,item,parent,before,after).catch(e=>announce(e.message));
 });
 async function move(drag,item,parent,before,after){const notes=WorkspaceNotes;if(!await notes.flush(true))return;const latest=notes.layoutState();if(drag.type==='page'&&latest.current?.id===item.id)item={...item,version:latest.current.version};notes.setLayoutBusy(true);try{await api('/api/write',{kind:'move_note_item',input:{item_type:drag.type,id:item.id,parent_id:parent,before_id:before,after,expected_version:item.version,expected_layout_version:item.layout_version||0},operation_id:crypto.randomUUID()});notes.setLayoutBusy(false);await notes.afterMove(drag.type,item.id,parent,drag.type==='page'?item.section_id:item.parent_id);announce(drag.type==='page'?'Page moved.':'Section moved with its pages.');}finally{notes.setLayoutBusy(false);}}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-note-color]');if(!b)return;(async()=>{if(!await WorkspaceNotes.flush(true))return;const section=WorkspaceNotes.layoutState().folders.find(f=>f.id===b.dataset.section);if(!section)return;b.disabled=true;await api('/api/write',{kind:'set_note_color',input:{item_type:'section',id:section.id,color:b.dataset.noteColor,expected_layout_version:section.layout_version||0},operation_id:crypto.randomUUID()});$('toolsDialog').close();await WorkspaceNotes.refreshLayout();announce('Section colour saved.');})().catch(e=>{b.disabled=false;$('toolsError').textContent=e.message;});});
 return {colorClass,colorPicker};
})();
