import {unpackFromMap,meetingEntries,meetingText} from './note-storage.mjs';
// Shared validation: allow private screenshot IDs; reject remote embeds and executable content.
export const EMPTY_NOTE={type:'doc',content:[{type:'paragraph'}]};
const nodes=new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','taskList','taskItem','table','tableRow','tableCell','tableHeader','blockquote','codeBlock','hardBreak','horizontalRule','systemTask','projectRef','meetingMeta','screenshot']);
export const NOTE_COLOURS = {
 highlight: {
  yellow: ['#ffef99', '#625017'],
  green: ['#c9f4c9', '#244e36'],
  blue: ['#d4ebff', '#244766'],
  pink: ['#ffd9e9', '#632c47'],
  purple: ['#eaddff', '#4a356c']
 },
 textColour: {
  red: ['#991b1b', '#ffb6b6'],
  orange: ['#8a3600', '#ffc494'],
  green: ['#165538', '#a0ebbc'],
  blue: ['#184d9c', '#a8d4ff'],
  purple: ['#582788', '#dec5ff']
 }
};
export const NOTE_COLOUR_CSS = [
 ':root{color-scheme:light dark}',
 'mark[data-note-highlight]{color:inherit}',
 ...Object.entries(NOTE_COLOURS).flatMap(([type, colours]) =>
  Object.entries(colours).map(([colour, [light, dark]]) => {
   const attribute = type === 'highlight' ? 'data-note-highlight' : 'data-note-text-colour';
   const property = type === 'highlight' ? 'background-color' : 'color';
   return `[${attribute}="${colour}"]{${property}:${light};${property}:light-dark(${light},${dark})}`;
  }))
].join('\n');
const marks=new Set(['bold','italic','underline','strike','code','link', ...Object.keys(NOTE_COLOURS)]);
export function noteDocument(value){
 if(!value||value.type!=='doc'||new TextEncoder().encode(JSON.stringify(value)).length>8000000)throw Error('This page exceeds the 8 MB text safety limit. Start another yearly page.');
 let count=0;
 function walk(n,depth=0){
  if(!n||typeof n!=='object'||Array.isArray(n)||!nodes.has(n.type)||depth>30||++count>150000)throw Error('Unsupported note content.');
  if(Object.keys(n).some(k=>!['type','content','text','attrs','marks'].includes(k)))throw Error('Unsupported note field.');
  if(['systemTask','projectRef','meetingMeta','screenshot'].includes(n.type)&&(n.content!==undefined||n.marks!==undefined||n.text!==undefined))throw Error('Invalid reference content.');
  if(n.type==='systemTask'){if(typeof n.attrs?.task_id!=='string'||!n.attrs.task_id||n.attrs.task_id.length>100||typeof n.attrs.label!=='string'||n.attrs.label.length>500)throw Error('Invalid task reference.');return '[Task] '+n.attrs.label;}
  if(n.type==='projectRef'){if(typeof n.attrs?.project_id!=='string'||!n.attrs.project_id||n.attrs.project_id.length>100||typeof n.attrs.label!=='string'||n.attrs.label.length>180)throw Error('Invalid project reference.');return '[Project] '+n.attrs.label;}
  if(n.type==='screenshot'){if(depth!==1||typeof n.attrs?.image_id!=='string'||!n.attrs.image_id||n.attrs.image_id.length>100||typeof n.attrs.alt!=='string'||n.attrs.alt.length>500||Object.keys(n.attrs).some(k=>!['image_id','alt'].includes(k)))throw Error('Invalid screenshot reference.');return '[Screenshot] '+n.attrs.alt;}
  if(n.type==='meetingMeta'){if(n.attrs?.meeting_id!=null&&(typeof n.attrs.meeting_id!=='string'||!n.attrs.meeting_id||n.attrs.meeting_id.length>100))throw Error('Invalid meeting anchor.');if(Object.keys(n.attrs||{}).some(k=>!['meeting_id','topic','when','timezone','participants','project_id','workstream_id'].includes(k)))throw Error('Invalid meeting field.');if(n.attrs.timezone!=null&&!['Europe/London','Europe/Rome'].includes(n.attrs.timezone))throw Error('Invalid meeting timezone.');if(depth!==1||typeof n.attrs?.topic!=='string'||!n.attrs.topic.trim()||n.attrs.topic.length>500||typeof n.attrs.when!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.attrs.when)||(!Number.isFinite(Date.parse(n.attrs.when+'Z'))||new Date(n.attrs.when+'Z').toISOString().slice(0,16)!==n.attrs.when)||typeof n.attrs.participants!=='string'||n.attrs.participants.length>4000)throw Error('Invalid meeting details.');return n.attrs.when+' — '+n.attrs.topic+'\nParticipants: '+n.attrs.participants+'\nTimezone: '+(n.attrs.timezone||'Europe/Rome');}
  if(n.type==='text'){if(typeof n.text!=='string'||!n.text.length||n.text.includes('\0')||n.content)throw Error('Invalid note text.');}
  else if(n.text!==undefined)throw Error('Only text nodes may contain text.');
  if(n.content!==undefined&&!Array.isArray(n.content))throw Error('Invalid note structure.');
  const childTypes={doc:['screenshot','meetingMeta','systemTask','projectRef','paragraph','heading','bulletList','orderedList','taskList','table','blockquote','codeBlock','horizontalRule'],paragraph:['text','hardBreak','projectRef','systemTask'],heading:['text','hardBreak'],codeBlock:['text'],bulletList:['listItem'],orderedList:['listItem'],listItem:['paragraph','heading','bulletList','orderedList','taskList','table','blockquote','codeBlock'],taskList:['taskItem'],taskItem:['paragraph','heading','bulletList','orderedList','taskList','table','blockquote','codeBlock'],table:['tableRow'],tableRow:['tableCell','tableHeader'],tableCell:['paragraph','heading','bulletList','orderedList','taskList','table','blockquote','codeBlock'],tableHeader:['paragraph','heading','bulletList','orderedList','taskList','table','blockquote','codeBlock']};
  if(['doc','bulletList','orderedList','listItem','taskList','taskItem','table','tableRow','tableCell','tableHeader','blockquote'].includes(n.type)&&(!n.content?.length))throw Error('A note block cannot be empty.');
  if((n.content||[]).some(c=>!childTypes[n.type]?.includes(c?.type)))throw Error('Invalid note nesting.');
  const attrKeys={heading:['level'],orderedList:['start','type'],taskItem:['checked'],tableCell:['colspan','rowspan','colwidth','align'],tableHeader:['colspan','rowspan','colwidth','align'],codeBlock:['language']};
  if(n.attrs){if(typeof n.attrs!=='object'||Array.isArray(n.attrs)||Object.keys(n.attrs).some(k=>!attrKeys[n.type]?.includes(k)))throw Error('Unsupported note attributes.');
   if(n.type==='heading'&&![1,2,3].includes(n.attrs.level))throw Error('Use heading levels 1–3.');
   if(n.type==='taskItem'&&typeof n.attrs.checked!=='boolean')throw Error('Invalid checkbox.');
   if(n.type==='orderedList'&&(!Number.isInteger(n.attrs.start)||n.attrs.start<1||n.attrs.start>100000||n.attrs.type!==undefined&&n.attrs.type!==null&&!['1','a','A','i','I'].includes(n.attrs.type)))throw Error('Invalid list.');
   if(['tableCell','tableHeader'].includes(n.type)){if(n.attrs.align!==undefined&&n.attrs.align!==null&&!['left','center','right','justify'].includes(n.attrs.align))throw Error('Invalid cell alignment.');for(const k of ['colspan','rowspan'])if(n.attrs[k]!==undefined&&(!Number.isInteger(n.attrs[k])||n.attrs[k]<1||n.attrs[k]>100))throw Error('Invalid table span.');if(n.attrs.colwidth!==undefined&&n.attrs.colwidth!==null&&(!Array.isArray(n.attrs.colwidth)||n.attrs.colwidth.length>100||n.attrs.colwidth.some(w=>!Number.isInteger(w)||w<0||w>10000)))throw Error('Invalid table width.');}
   if(n.type==='codeBlock'&&n.attrs.language!==null&&n.attrs.language!==undefined&&(typeof n.attrs.language!=='string'||n.attrs.language.length>100))throw Error('Invalid language.');
  }
  if(n.marks){if(!Array.isArray(n.marks)||!['text','hardBreak'].includes(n.type))throw Error('Invalid note formatting.');for(const m of n.marks){if(!marks.has(m?.type)||Object.keys(m).some(k=>!['type','attrs'].includes(k)))throw Error('Unsupported formatting.');if(m.type==='link'){const a=m.attrs||{};if(Object.keys(a).some(k=>!['href','target','rel','class'].includes(k))||typeof a.href!=='string'||a.href.length>2000)throw Error('Invalid web link.');let u;try{u=new URL(a.href);}catch{throw Error('Use a complete https:// web link.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use a web link without embedded credentials.');m.attrs={href:u.href,target:'_blank',rel:'noopener noreferrer',class:null};}else if(Object.hasOwn(NOTE_COLOURS,m.type)){
   const a=m.attrs;
   if(!a||Object.keys(a).length!==1||typeof a.colour!=='string'||!Object.hasOwn(NOTE_COLOURS[m.type],a.colour))throw Error('Unsupported note colour.');
  }else if(m.attrs&&Object.keys(m.attrs).length)throw Error('Unsupported mark attributes.');}}
  const inner=(n.content||[]).map(c=>walk(c,depth+1)).join(n.type==='tableRow'?'\t':['paragraph','heading','codeBlock'].includes(n.type)?'':'\n');return n.type==='text'?n.text:n.type==='hardBreak'?'\n':inner;
 }
 const doc=structuredClone(value),text=walk(doc),ids=doc.content.filter(n=>n.type==='meetingMeta'&&n.attrs.meeting_id).map(n=>n.attrs.meeting_id);if(new Set(ids).size!==ids.length)throw Error('Each meeting needs a distinct anchor.');return {doc,plain_text:text};
}
export const noteText=(v,max=180)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))throw Error('Provide a title of at most '+max+' characters.');return v.trim();};
export const NOTE_EXTRA_TABLES={note_layout:'owner_id id color rank version',note_blobs:'owner_id id body created_at',note_images:'id owner_id page_id mime data alt created_at',note_meetings:'id owner_id page_id block_index topic meeting_when participants project_id workstream_id plain_text text_refs project_refs'};
export const NOTE_TABLES={note_folders:'id owner_id kind parent_id title archived version updated_at',note_pages:'id owner_id section_id title doc_json plain_text project_id workstream_id archived version updated_at',note_revisions:'id owner_id page_id page_version snapshot saved_at reason'};
export function validateNoteBackup(data,owner){
 for(const [table,cols] of Object.entries(NOTE_TABLES)){const rows=data[table];if(!Array.isArray(rows)||rows.length>20000)throw Error('Invalid notes backup.');const ids=new Set();for(const r of rows){if(!r||Object.keys(r).sort().join(' ')!==cols.split(' ').sort().join(' ')||r.owner_id!==owner||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id)||Object.values(r).some(v=>v!==null&&typeof v==='object'))throw Error('Invalid note backup fields.');ids.add(r.id);}}
 const folders=new Map(data.note_folders.map(r=>[r.id,r]));const projects=new Set(data.projects.map(r=>r.id));
 const pageValid=p=>{noteText(p.title,500);const decoded=unpackFromMap(p,new Map((data.note_blobs||[]).map(b=>[b.id,b.body])));const clean=noteDocument(decoded.doc);if(clean.doc.content.filter(n=>n.type==='screenshot').some(n=>!(data.note_images||[]).some(i=>i.id===n.attrs.image_id&&i.owner_id===owner)))throw Error('Invalid screenshot backup reference.');if(clean.plain_text!==decoded.plain_text||!folders.has(p.section_id)||folders.get(p.section_id).kind!=='section'||!Number.isInteger(p.version)||p.version<1||![0,1].includes(p.archived)||p.project_id&&!projects.has(p.project_id)||p.workstream_id&&!data.workstreams.some(w=>w.id===p.workstream_id&&w.project_id===p.project_id))throw Error('Invalid note backup page.');};
 for(const f of folders.values()){noteText(f.title);if(!['notebook','section'].includes(f.kind)||f.kind==='notebook'&&f.parent_id!==null||f.kind==='section'&&(folders.get(f.parent_id)?.kind!=='notebook')||![0,1].includes(f.archived)||!Number.isInteger(f.version)||f.version<1)throw Error('Invalid notebook hierarchy.');}
 const pages=new Set(data.note_pages.map(p=>p.id));for(const p of data.note_pages)pageValid(p);
 if(data.note_meetings){const expected=new Map();for(const p of data.note_pages){const decoded=unpackFromMap(p,new Map((data.note_blobs||[]).map(b=>[b.id,b.body])));for(const entry of meetingEntries(decoded.doc,p.id))expected.set(entry.id,entry);}if(data.note_meetings.length!==expected.size)throw Error('Invalid meeting index.');for(const m of data.note_meetings){const e=expected.get(m.id);const refs=JSON.parse(m.text_refs),blobs=new Map((data.note_blobs||[]).map(b=>[b.id,b.body]));if(!e||e.page_id!==m.page_id||m.topic!==e.metadata.topic||m.meeting_when!==e.metadata.when||m.participants!==e.metadata.participants||(refs.length?refs.map(id=>blobs.get(id)||'').join(''):m.plain_text)!==meetingText(e.content))throw Error('Invalid meeting index.');}}
 for(const r of data.note_revisions){const p=JSON.parse(r.snapshot);if(!pages.has(r.page_id)||p.id!==r.page_id||p.owner_id!==owner||p.version!==r.page_version)throw Error('Invalid note history.');pageValid(p);}
}
