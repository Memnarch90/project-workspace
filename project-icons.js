'use strict';

(()=>{
 const icons={
  "folder":{label:"Folder",path:"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"},
  "clipboard":{label:"Clipboard",path:"M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3 M9 3h6v4H9z M8 12h8 M8 16h5"},
  "briefcase":{label:"Briefcase",path:"M3 8h18v12H3z M8 8V5h8v3 M3 12c5 4 13 4 18 0 M11 14h2"},
  "people":{label:"People",path:"M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M20 20v-2a4 4 0 0 0-3-4 M17 3a4 4 0 0 1 0 8"},
  "shield":{label:"Shield",path:"M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z M9 12l2 2 4-4"},
  "heart":{label:"Heart",path:"M20.8 8.6c0 4.1-5.2 7.7-8.8 11-3.6-3.3-8.8-6.9-8.8-11A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9z"},
  "graduation":{label:"Graduation",path:"M2 9l10-5 10 5-10 5z M6 11v5q6 5 12 0v-5 M22 9v7"},
  "book":{label:"Book",path:"M12 6Q7 3 3 5v14q5-2 9 1 4-3 9-1V5q-5-2-9 1z M12 6v14"},
  "calendar":{label:"Calendar",path:"M3 5h18v16H3z M3 10h18 M7 3v4 M17 3v4 M7 14h2 M12 14h2 M7 17h2"},
  "chart":{label:"Chart",path:"M4 3v17h17 M8 16v-4 M13 16V8 M18 16V5"},
  "search":{label:"Search",path:"M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M14.5 14.5 21 21"},
  "building":{label:"Building",path:"M4 21h16 M6 21V3h12v18 M10 7h1 M13 7h1 M10 11h1 M13 11h1 M10 15h1 M13 15h1 M11 21v-3h2v3"},
  "truck":{label:"Truck",path:"M3 5h11v13H3z M14 10h4l3 4v4h-7 M14 14h7 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"},
  "messages":{label:"Messages",path:"M4 4h14v10H9l-5 4z M18 8h3v12l-4-3h-5v-3"},
  "tools":{label:"Tools",path:"M15 7a4 4 0 0 0-5-5l2.5 2.5-2 2L8 4a4 4 0 0 0 5 5l-9 9a2 2 0 0 0 3 3l9-9a4 4 0 0 0 5-5l-2.5 2.5-2-2z"},
  "flag":{label:"Flag",path:"M5 22V3 M5 4c5-4 9 3 15 0v11c-6 3-10-4-15 0"},
  "spark":{label:"Spark",path:"M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"},
  "target":{label:"Target",path:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z M12 12h.01"}
 };
 const colours={slate:'Slate',violet:'Violet',blue:'Blue',teal:'Teal',amber:'Amber',rose:'Rose'};
 const defaultIcon={icon:'folder',colour:'slate'};
 const oldIcons={'◆':'folder','●':'target','▲':'flag','■':'briefcase','★':'spark','✦':'spark','⬟':'shield','✚':'heart','◈':'flag','◎':'target','▣':'clipboard','✿':'spark'};
 const preferenceKey='workspace.project-icons.v2',oldKey='workspace.project-icons.v1';
 const projectSelectors='select:is(#project,#dayProject,#editProject,#todoProject,#notesProject,#noteProject,[name=project])';
 function preferences(key){
  try{
   const saved=JSON.parse(localStorage.getItem(key)||'{}');
   return saved&&typeof saved==='object'&&!Array.isArray(saved)?Object.assign(Object.create(null),saved):Object.create(null);
  }catch{return Object.create(null);}
 }
 const choices=preferences(preferenceKey),legacyChoices=preferences(oldKey);
 function selection(id){
  const saved=choices[id];
  if(saved&&Object.hasOwn(icons,saved.icon)&&Object.hasOwn(colours,saved.colour))return saved;
  const legacy=legacyChoices[id];
  if(typeof legacy==='string'&&Object.hasOwn(oldIcons,legacy))return {icon:oldIcons[legacy],colour:'violet'};
  return defaultIcon;
 }
 function glyph(key){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',icons[key].path);
  svg.append(path);
  return svg;
 }
 function showIcon(badge,value){
  if(badge.dataset.icon!==value.icon){
   badge.dataset.icon=value.icon;
   badge.replaceChildren(glyph(value.icon));
  }
  if(badge.dataset.colour!==value.colour)badge.dataset.colour=value.colour;
 }
 function selectorLabel(select){
  return select.labels?.[0]||null;
 }
 function decorateSelector(select){
  const label=selectorLabel(select);
  if(select.parentElement!==label)return;
  let badge=label.querySelector(':scope > .project-select-icon');
  if(!badge){
   badge=document.createElement('span');
   badge.className='project-icon-tile project-select-icon';
   badge.setAttribute('aria-hidden','true');
   select.before(badge);
   label.classList.add('project-icon-field');
  }
  badge.hidden=!select.value;
  if(select.value)showIcon(badge,selection(select.value));
 }

 const workspace=document.getElementById('workspace');
 const heading=document.getElementById('workspaceTitle');
 const badge=document.createElement('button');
 badge.id='projectIconBadge';
 badge.type='button';
 badge.className='project-icon-tile';
 heading.before(badge);
 let activeProject=null,dialog,editingProject=null,editingValue=null;
 let frame=0;
 function refresh(){
  frame=0;
  workspace.querySelectorAll(projectSelectors).forEach(decorateSelector);
  document.querySelectorAll('dialog '+projectSelectors).forEach(decorateSelector);
  const current=state.projects.find(project=>project.id===document.getElementById('project').value);
  activeProject=current&&heading.textContent===current.name?current:null;
  showIcon(badge,selection(activeProject?.id));
  badge.disabled=!activeProject;
  if(activeProject)badge.setAttribute('aria-label','Choose icon for '+activeProject.name);
  else badge.removeAttribute('aria-label');
  badge.setAttribute('aria-hidden',String(!activeProject));
  badge.title=activeProject?'Choose project icon':'';
 }
 function scheduleRefresh(){
  if(!frame)frame=requestAnimationFrame(refresh);
 }

 function refreshDialog(){
  showIcon(dialog.querySelector('.project-icon-preview .project-icon-tile'),editingValue);
  dialog.querySelectorAll('[data-picker-icon]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pickerIcon===editingValue.icon)));
  dialog.querySelectorAll('[data-picker-colour]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pickerColour===editingValue.colour)));
 }

 function createDialog(){
  const picker=document.createElement('dialog');
  picker.id='projectIconDialog';
  picker.setAttribute('aria-labelledby','projectIconTitle');
  picker.innerHTML=`
  <header><h2 id="projectIconTitle">Choose project icon</h2><button type="button" data-picker-cancel aria-label="Close">×</button></header>
  <div class="project-icon-panel">
   <div class="project-icon-preview"><span class="project-icon-tile"></span><div><small>Preview</small><strong></strong></div></div>
   <div class="project-icon-group"><h3 id="projectColourLabel">Colour</h3><div class="project-icon-colours" role="group" aria-labelledby="projectColourLabel"></div></div>
   <div class="project-icon-group"><h3 id="projectShapeLabel">Icon</h3><div class="project-icon-grid" role="group" aria-labelledby="projectShapeLabel"></div></div>
   <p class="project-icon-error" role="alert"></p>
  </div>
  <footer><button type="button" data-picker-default>Use default</button><button type="button" data-picker-cancel>Cancel</button><button type="button" class="project-icon-save" data-picker-save>Save icon</button></footer>`;
  const palette=picker.querySelector('.project-icon-colours');
  for(const [key,label] of Object.entries(colours)){
   const button=document.createElement('button');
   button.type='button';
   button.dataset.pickerColour=key;
   button.dataset.colour=key;
   button.setAttribute('aria-label',label);
   button.title=label;
   palette.append(button);
  }
  const grid=picker.querySelector('.project-icon-grid');
  for(const [key,{label}] of Object.entries(icons)){
   const button=document.createElement('button');
   button.type='button';
   button.dataset.pickerIcon=key;
   const text=document.createElement('span');
   text.textContent=label;
   button.append(glyph(key),text);
   grid.append(button);
  }
  picker.addEventListener('click',event=>{
   const button=event.target.closest('button');
   if(!button)return;
   if(button.dataset.pickerIcon){
    editingValue={...editingValue,icon:button.dataset.pickerIcon};
    refreshDialog();
   }else if(button.dataset.pickerColour){
    editingValue={...editingValue,colour:button.dataset.pickerColour};
    refreshDialog();
   }else if(button.hasAttribute('data-picker-default')){
    editingValue={...defaultIcon};
    refreshDialog();
   }else if(button.hasAttribute('data-picker-cancel'))picker.close();
   else if(button.hasAttribute('data-picker-save')){
    try{
     const saved=preferences(preferenceKey);
     saved[editingProject.id]=editingValue;
     localStorage.setItem(preferenceKey,JSON.stringify(saved));
     choices[editingProject.id]=editingValue;
     refresh();
     picker.close();
    }catch{picker.querySelector('.project-icon-error').textContent='Could not save the icon in this browser.';}
   }
  });
  picker.addEventListener('close',()=>badge.focus({preventScroll:true}));
  document.body.append(picker);
  return picker;
 }
 badge.addEventListener('click',()=>{
  if(!activeProject)return;
  editingProject=activeProject;
  editingValue={...selection(editingProject.id)};
  dialog||=createDialog();
  dialog.querySelector('.project-icon-preview strong').textContent=editingProject.name;
  dialog.querySelector('.project-icon-error').textContent='';
  refreshDialog();
  dialog.showModal();
  dialog.querySelector('[data-picker-icon][aria-pressed=true]').focus();
 });
 document.addEventListener('change',scheduleRefresh);
 document.addEventListener('DOMContentLoaded',scheduleRefresh);
 const observer=new MutationObserver(scheduleRefresh);
 observer.observe(workspace,{childList:true,subtree:true});
 document.querySelectorAll('dialog').forEach(element=>observer.observe(element,{childList:true,subtree:true}));
 window.addEventListener('storage',event=>{
  if(event.key!==preferenceKey&&event.key!==null)return;
  for(const id of Object.keys(choices))delete choices[id];
  Object.assign(choices,preferences(preferenceKey));
  scheduleRefresh();
 });
 refresh();
})();
