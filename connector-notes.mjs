// Connector writes accept plain text and preserve all unrelated rich-document nodes.
const kinds=new Set(['connector_create_note','connector_append_note','connector_edit_note_text','connector_create_meeting','connector_update_note']);
export const isConnectorNoteWrite=kind=>kinds.has(kind);
function text(value,{empty=false,max=60000}={}){if(typeof value!=='string'||value.includes('\0')||value.length>max||!empty&&!value.trim())throw Error('Provide plain text of at most '+max+' characters.');return value;}
const paragraphs=value=>text(value,{empty:true}).replace(/\r\n?/g,'\n').split('\n').map(t=>({type:'paragraph',...(t?{content:[{type:'text',text:t}]}:{})}));
export function meetingNow(date=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
function meetingRange(doc,pageId,id){const start=doc.content.findIndex((n,i)=>n.type==='meetingMeta'&&(n.attrs.meeting_id===id||i===0&&!n.attrs.meeting_id&&pageId===id));if(start<0)throw Error('Meeting not found in the selected page.');let end=start+1;while(end<doc.content.length&&doc.content[end].type!=='meetingMeta')end++;return {start,end};}
function replacePassage(doc,find,replacement,range){text(find);text(replacement,{empty:true});if(/[\r\n]/.test(find)||/[\r\n]/.test(replacement))throw Error('Edit one passage within a paragraph at a time; use append_note for new paragraphs.');const hits=[];
 const walk=node=>{if(['paragraph','heading','codeBlock'].includes(node.type)){const c=node.content||[];for(let i=0;i<c.length;){if(c[i].type!=='text'){i++;continue;}const start=i;let all='';while(i<c.length&&c[i].type==='text')all+=c[i++].text;for(let at=all.indexOf(find);at>=0;at=all.indexOf(find,at+1))hits.push({node,start,end:i,at});}}else if(!['meetingMeta','screenshot','systemTask','projectRef'].includes(node.type))(node.content||[]).forEach(walk);};
 (range?doc.content.slice(range.start+1,range.end):doc.content).forEach(walk);if(hits.length!==1)throw Error(hits.length?'The passage occurs more than once. Specify a meeting or a longer unique passage.':'Passage not found. Read the latest page and use exact text.');
 const h=hits[0],old=h.node.content.slice(h.start,h.end),next=[];let offset=0,inserted=false;for(const n of old){const a=offset,b=a+n.text.length;offset=b;if(b<=h.at||a>=h.at+find.length){next.push(n);continue;}if(h.at>a)next.push({...n,text:n.text.slice(0,h.at-a)});if(!inserted){if(replacement)next.push({...n,text:replacement});inserted=true;}if(b>h.at+find.length)next.push({...n,text:n.text.slice(h.at+find.length-a)});}h.node.content.splice(h.start,h.end-h.start,...next);
}
export function connectorNoteInput(kind,input,current){
 if(!kinds.has(kind))throw Error('Unsupported connector note write.');
 if(kind==='connector_create_note'){if(!input.section_id)throw Error('Choose a section from list_notebooks.');return {input:{section_id:input.section_id,title:input.title,doc:{type:'doc',content:paragraphs(input.text||'')},project_id:input.project_id||null,workstream_id:input.workstream_id||null,checkpoint:true},receipt:{}};}
 if(!current||current.section_archived||current.notebook_archived)throw Error('Choose a note in an active section.');
 if(!Number.isInteger(input.expected_version)||input.expected_version<1||input.expected_version!==current.version)throw Error('Conflict: this note changed. Read it again before editing.');
 if(kind==='connector_update_note'){
  const {title,section_id,archived,append_text,find_text,replacement}=input.changes;
  if(current.archived&&archived!==false)throw Error('Restore this page before editing it.');
  if((find_text===undefined)!==(replacement===undefined))throw Error('Provide both find_text and replacement to replace a passage.');
  if([title,section_id,archived,append_text,find_text].every(value=>value===undefined))throw Error('Provide at least one note change.');
  const values={id:current.id,expected_version:input.expected_version,title,section_id,archived,checkpoint:true};
  if(find_text!==undefined||append_text!==undefined){
   const doc=structuredClone(current.doc);
   if(find_text!==undefined)replacePassage(doc,find_text,replacement);
   if(append_text!==undefined){text(append_text);doc.content.push(...paragraphs(append_text));}
   values.doc=doc;
  }
  return {input:values,receipt:{}};
 }
 if(current.archived)throw Error('Choose an active note page.');
 const doc=structuredClone(current.doc),range=input.meeting_id?meetingRange(doc,current.id,input.meeting_id):null;let receipt={};
 if(kind==='connector_append_note'){text(input.text);doc.content.splice(range?.end??doc.content.length,0,...paragraphs(input.text));if(input.meeting_id)receipt.meeting_id=input.meeting_id;}
 if(kind==='connector_edit_note_text')replacePassage(doc,input.find_text,input.replacement,range);
 if(kind==='connector_create_meeting'){
  const meeting_id=crypto.randomUUID(),when=input.when||meetingNow();text(input.topic,{max:500});const participants=input.participants??'';text(participants,{empty:true,max:4000});
  const project_id=input.project_id===undefined?current.project_id:input.project_id,workstream_id=input.workstream_id===undefined?(project_id===current.project_id?current.workstream_id:null):input.workstream_id;
  doc.content.push({type:'meetingMeta',attrs:{meeting_id,topic:input.topic,when,timezone:'Europe/London',participants,project_id:project_id||null,workstream_id:workstream_id||null}},...paragraphs(input.text||''));receipt={meeting_id,when,timezone:'Europe/London',defaulted_time:!input.when};
 }
 return {input:{id:current.id,expected_version:input.expected_version,doc,checkpoint:true},receipt};
}
