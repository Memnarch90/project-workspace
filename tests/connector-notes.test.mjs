import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';
import {connectorNoteInput,meetingNow} from '../connector-notes.mjs';
async function setup(){const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const s=workspace(db,'writer-test');const write=async(kind,input,op=crypto.randomUUID())=>s.notes.write(kind,input,op,'connector:synthetic-client');const book=(await write('save_note_folder',{kind:'notebook',title:'Synthetic notebook'})).record;const sec=(await write('save_note_folder',{kind:'section',title:'Synthetic notes',parent_id:book.id})).record;return {db,s,write,sec,book};}
test('Connector notes: create, append, precise edit, history, retry and stale-write protection',async()=>{const {db,s,write,sec}=await setup();try{
 const input={section_id:sec.id,title:'Synthetic page',text:'First paragraph\nSecond paragraph'},op=crypto.randomUUID();const first=await write('connector_create_note',input,op);assert.deepEqual(await write('connector_create_note',input,op),first);assert.match(first.url,/^\/\?note=/);const id=first.record.id;
 await assert.rejects(()=>write('connector_create_note',{...input,text:'Changed'},op),/already used/);
 const append={note_id:id,expected_version:1,text:'Appended paragraph'},appendOp=crypto.randomUUID();await write('connector_append_note',append,appendOp);const edit={note_id:id,expected_version:2,find_text:'Second',replacement:'Edited'};await write('connector_edit_note_text',edit);
 assert.deepEqual(await write('connector_append_note',append,appendOp),{...(await write('connector_append_note',append,appendOp))});
 const page=await s.notes.get(id,{allowArchived:true});assert.equal(page.version,3);assert.match(page.plain_text,/Edited paragraph/);assert.match(page.plain_text,/Appended paragraph/);assert.equal((await s.notes.history(id)).items.length,3);
 await assert.rejects(()=>write('connector_append_note',{...append,text:'Stale'}),/Conflict/);await assert.rejects(()=>write('connector_edit_note_text',{...edit,expected_version:3,find_text:'paragraph'}),/more than once/);await assert.rejects(()=>write('connector_edit_note_text',{...edit,expected_version:3,find_text:'Not here'}),/not found/);
 const audit=(await db.prepare("SELECT action,actor,after_json FROM audit_events WHERE entity_id=?1").bind(id).all()).results;assert.ok(audit.every(a=>a.actor==='connector:synthetic-client'&&!a.after_json.includes('paragraph')));assert.ok(audit.some(a=>a.action==='connector_edit_note_text'));
 const operations=(await db.prepare('SELECT fingerprint FROM operations').all()).results;assert.ok(operations.every(o=>/^[a-f0-9]{64}$/.test(o.fingerprint)));
 }finally{db.close();}});
test('Connector meetings: structured same-page entries, retry, range edits, index and defaults',async()=>{const {db,s,write,sec}=await setup();try{
 const p=(await write('connector_create_note',{section_id:sec.id,title:'Yearly notes',text:'Existing introduction'})).record;
 const a={note_id:p.id,expected_version:1,topic:'First meeting',participants:'Alex',text:'Shared phrase'},op=crypto.randomUUID();const first=await write('connector_create_meeting',a,op);assert.equal(first.defaulted_time,true);assert.equal(first.timezone,'Europe/London');assert.match(first.when,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);assert.deepEqual(await write('connector_create_meeting',a,op),first);
 const second=await write('connector_create_meeting',{note_id:p.id,expected_version:2,topic:'Second meeting',when:'2026-11-09T15:30',text:'Shared phrase'});assert.equal(second.defaulted_time,false);
 await write('connector_append_note',{note_id:p.id,expected_version:3,meeting_id:first.meeting_id,text:'First meeting appendix'});
 await write('connector_edit_note_text',{note_id:p.id,expected_version:4,meeting_id:first.meeting_id,find_text:'Shared phrase',replacement:'Revised first phrase'});
 const page=await s.notes.get(p.id,{allowArchived:true});assert.equal(page.meeting_count,2);assert.equal((await s.notes.search()).items.length,1);assert.match((await s.notes.getMeeting(first.meeting_id)).text,/First meeting appendix/);assert.match((await s.notes.getMeeting(first.meeting_id)).text,/Revised first phrase/);assert.match((await s.notes.getMeeting(second.meeting_id)).text,/Shared phrase/);assert.doesNotMatch((await s.notes.getMeeting(second.meeting_id)).text,/appendix/);assert.equal((await s.notes.searchMeetings({query:'First meeting appendix'})).items[0].id,first.meeting_id);
 await assert.rejects(()=>write('connector_create_meeting',{note_id:p.id,expected_version:5,topic:'Bad date',when:'2026-02-30T10:00'}),/meeting/);assert.equal((await s.notes.get(p.id)).version,5);
 }finally{db.close();}});
test('Connector text changes preserve rich marks and protected nodes; foreign and archived targets fail',async()=>{const {db,s,write,sec,book}=await setup();try{
 const p=(await write('connector_create_note',{section_id:sec.id,title:'Protected page',text:'Original'})).record;const task=(await s.write('create_task',{changes:{title:'Linked task'}},crypto.randomUUID(),'test')).record;
 const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bold ',marks:[{type:'bold'}]},{type:'text',text:'and italic',marks:[{type:'italic'}]}]},{type:'systemTask',attrs:{task_id:task.id,label:'Do not edit reference'}},{type:'meetingMeta',attrs:{meeting_id:'protected-anchor',topic:'Do not edit header',when:'2026-11-09T15:00',participants:''}},{type:'paragraph'}]};
 await write('save_note',{id:p.id,expected_version:1,doc});await write('connector_edit_note_text',{note_id:p.id,expected_version:2,find_text:'Bold and',replacement:'Changed'});const saved=await s.notes.get(p.id,{allowArchived:true});assert.deepEqual(saved.doc.content.slice(1),doc.content.slice(1));assert.equal(saved.doc.content[0].content[0].marks[0].type,'bold');assert.equal(saved.doc.content[0].content[1].text,' italic');
 await assert.rejects(()=>write('connector_edit_note_text',{note_id:p.id,expected_version:3,find_text:'Do not edit header',replacement:'No'}),/not found/);
 await assert.rejects(()=>workspace(db,'stranger').notes.write('connector_append_note',{note_id:p.id,expected_version:3,text:'Intrusion'},crypto.randomUUID(),'connector:other'),/not found/);
 await write('save_note_folder',{id:book.id,expected_version:1,title:'Synthetic notebook',archived:true});await assert.rejects(()=>write('connector_append_note',{note_id:p.id,expected_version:3,text:'Archived'}),/active/);
 }finally{db.close();}});
test('Connector replacement handles repeated passages, deletion and inline reference boundaries',()=>{const current={id:'p',version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'One two three'}]}]}};
 assert.equal(connectorNoteInput('connector_edit_note_text',{note_id:'p',expected_version:1,find_text:'two ',replacement:''},current).input.doc.content[0].content[0].text,'One ');
 assert.throws(()=>connectorNoteInput('connector_edit_note_text',{expected_version:1,find_text:'One\ntwo',replacement:'x'},current),/one passage/);
 const refs={...current,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Before'},{type:'systemTask',attrs:{task_id:'task',label:'x'}},{type:'text',text:'After'}]}]}};
 assert.throws(()=>connectorNoteInput('connector_edit_note_text',{expected_version:1,find_text:'BeforeAfter',replacement:'x'},refs),/not found/);
});


test('Connector edits preserve screenshots and unrelated table cells byte-for-byte',()=>{
 const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Change this sentence.'}]},{type:'screenshot',attrs:{image_id:'private-image',alt:'Existing image'}},{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null,align:null},content:[{type:'paragraph',content:[{type:'text',text:'Keep this table'}]}]}]}]}]};
 const result=connectorNoteInput('connector_edit_note_text',{expected_version:1,find_text:'Change this',replacement:'Updated'}, {id:'p',version:1,doc});
 assert.deepEqual(result.input.doc.content.slice(1),doc.content.slice(1));assert.equal(doc.content[0].content[0].text,'Change this sentence.');
});


test('Meetings default to UK winter and summer time, independent of machine timezone',()=>{
 assert.equal(meetingNow(new Date('2026-01-15T15:30:00Z')),'2026-01-15T15:30');
 assert.equal(meetingNow(new Date('2026-07-15T15:30:00Z')),'2026-07-15T16:30');
 const page={id:'page',version:1,doc:{type:'doc',content:[{type:'paragraph'}]}};
 const result=connectorNoteInput('connector_create_meeting',{expected_version:1,topic:'UK meeting',when:'2026-11-10T09:00'},page);
 assert.equal(result.input.doc.content[1].attrs.timezone,'Europe/London');assert.equal(result.receipt.timezone,'Europe/London');
});
