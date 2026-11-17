import http from 'node:http';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {sqliteAdapter} from './sqlite-adapter.mjs';
import {DEFAULT_TASK_ASSIGNEE,workspace} from './store.mjs';
import {peopleBrowserRead} from './people.mjs';
import {knowledge,knowledgeBrowserAction} from './knowledge.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.WORKSPACE_PORT||8767);
const origin=`http://127.0.0.1:${port}`;
const dbpath=process.env.WORKSPACE_DB||path.join(process.env.LOCALAPPDATA||homedir(),'project-workspace-share','workspace.sqlite3');
mkdirSync(path.dirname(dbpath),{recursive:true});
const owner=process.env.WORKSPACE_OWNER||'local-owner';
const db=sqliteAdapter(dbpath), service=workspace(db,owner);
db.exec(readFileSync(path.join(root,'schema.sql'),'utf8'));
const session=randomBytes(32).toString('hex');
const same=value=>{const a=Buffer.from(value||''),b=Buffer.from(session);return a.length===b.length&&timingSafeEqual(a,b);};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Frame-Options':'DENY'};
const json=(res,data,status=200)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==new URL(origin).host)return json(res,{error:'Host denied.'},403);
  const url=new URL(req.url,origin), p=url.pathname;
  const assets={'/people-ui.js':['people-ui.js','text/javascript'],'/people.css':['people.css','text/css'],'/knowledge-ui.js':['knowledge-ui.js','text/javascript'],'/knowledge-export.js':['knowledge-export.js','text/javascript'],'/knowledge.css':['knowledge.css','text/css'],'/case-view.js':['case-view.js','text/javascript'],'/note-layout.js':['note-layout.js','text/javascript'],'/note-media.js':['note-media.js','text/javascript'],'/note-workflows.js':['note-workflows.js','text/javascript'],'/meeting-journal.js':['meeting-journal.js','text/javascript'],'/notes-ui.js':['notes-ui.js','text/javascript'],'/notes-editor.js':['public/notes-editor.js','text/javascript'],'/notes.css':['public/notes.css','text/css'],'/project-icons.js':['project-icons.js','text/javascript'],'/icons.css':['icons.css','text/css'],'/app-icon.svg':['app-icon.svg','image/svg+xml'],'/app-icon-180.png':['app-icon-180.png','image/png'],'/app-icon-192.png':['app-icon-192.png','image/png'],'/app-icon-512.png':['app-icon-512.png','image/png'],'/site.webmanifest':['site.webmanifest','application/manifest+json'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/ux.js':['ux.js','text/javascript'],'/workspace-ui.js':['workspace-ui.js','text/javascript'],'/retry-writes.js':['retry-writes.js','text/javascript'],'/export.js':['export.js','text/javascript'],'/export-template.js':['export-template.js','text/javascript'],'/risk-ui.js':['risk-ui.js','text/javascript'],'/style.css':['style.css','text/css']};
  if(req.method==='GET'&&assets[p]){
   res.writeHead(200,{...headers,'Content-Type':assets[p][1],...(p==='/'?{'Set-Cookie':`workspace_session=${session}; HttpOnly; SameSite=Strict; Path=/`}:{})});res.end(readFileSync(path.join(root,assets[p][0])));return;
  }
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('workspace_session='))?.split('=')[1];
  if(!same(cookie))return json(res,{error:'Open the local dashboard to establish a session.'},401);
  if(req.headers.origin&&req.headers.origin!==origin)return json(res,{error:'Origin denied.'},403);
  if(p.startsWith('/api/knowledge/')){
   let input;
   if(req.method==='POST'){
    if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'Same-origin JSON required.'},403);
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>180000)return json(res,{error:'Request too large.'},413);chunks.push(chunk);}
    input=JSON.parse(Buffer.concat(chunks));
   }
   const data=await knowledgeBrowserAction(knowledge(db,owner),req.method,url,input,owner);
   return data===undefined?json(res,{error:'Not found.'},404):json(res,data);
  }
  if(req.method==='GET'){
   const peopleData=peopleBrowserRead(service,url);
   if(peopleData!==undefined)return json(res,await peopleData);
   if(p==='/api/session')return json(res,{mode:'local',can_write:true,default_task_assignee:DEFAULT_TASK_ASSIGNEE});
   if(p==='/api/note-blob-status')return json(res,await service.notes.blobStatus((url.searchParams.get('ids')||'').split(',')));
   if(p==='/api/meetings'){
    const meetings=await service.notes.searchMeetings(Object.fromEntries(url.searchParams));
    return json(res,{...meetings,items:await service.people.decorateMeetings(meetings.items)});
   }
   if(p==='/api/meeting')return json(res,await service.notes.getMeeting(url.searchParams.get('id'),Object.fromEntries(url.searchParams)));
   if(p==='/api/note-image')return json(res,await service.notes.image(url.searchParams.get('id')));
   if(p==='/api/note-folders')return json(res,await service.notes.folders(Object.fromEntries(url.searchParams)));
   if(p==='/api/project-task-notes')return json(res,await service.tools.projectTaskNotes(url.searchParams.get('project_id'),url.searchParams.get('limit')));
   if(p==='/api/notes')return json(res,await service.notes.search(Object.fromEntries(url.searchParams)));
   if(p==='/api/note')return json(res,await service.notes.get(url.searchParams.get('id'),{allowArchived:true}));
   if(p==='/api/note-history')return json(res,await service.notes.history(url.searchParams.get('id'),Object.fromEntries(url.searchParams)));
   if(p==='/api/note-revision')return json(res,await service.notes.revision(url.searchParams.get('id'),url.searchParams.get('revision_id')));
   if(p==='/api/risks')return json(res,await service.risks.list(Object.fromEntries(url.searchParams)));
   if(p.startsWith('/api/risks/'))return json(res,await service.risks.get(decodeURIComponent(p.split('/')[3])));
   if(p==='/api/projects')return json(res,await service.projects());
   if(p==='/api/project')return json(res,await service.getProject(url.searchParams.get('id')));
   if(p==='/api/streams')return json(res,await service.streams());
   if(p==='/api/history')return json(res,await service.auditPage(url.searchParams.get('id'),Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER)));
   if(p==='/api/backup')return json(res,await service.tools.backup());
   if(p==='/api/revision')return json(res,{cursor:await service.tools.revision()});
   if(p==='/api/templates')return json(res,await service.tools.documents());
   if(p==='/api/details')return json(res,await service.tools.document(url.searchParams.get('id'),url.searchParams.get('task_notes')==='1'));
   if(p==='/api/recoveries')return json(res,await service.tools.recoveries());
   if(p==='/api/recovery')return json(res,await service.tools.recovery(url.searchParams.get('id')));
   if(p==='/api/todo-page')return json(res,await service.todoPage(url.searchParams.get('after_id')||''));
   if(p==='/api/todos')return json(res,await service.todos());
   if(p==='/api/focus')return json(res,await service.focus());
   if(p==='/api/export')return json(res,await service.exportPlan(url.searchParams.get('project_id')||undefined));
   if(p==='/api/summary')return json(res,await service.summary(url.searchParams.get('project_id')||undefined));
   if(p==='/api/tasks'){const filters=Object.fromEntries(url.searchParams);if(filters.limit)filters.limit=Number(filters.limit);return json(res,await service.findTasks(filters));}
   if(p.startsWith('/api/tasks/')){const parts=p.split('/');const id=decodeURIComponent(parts[3]);return json(res,parts[4]==='audit'?await service.audit(id):await service.getTask(id));}
   if(p==='/api/review')return json(res,await service.review());
   if(p==='/api/changes')return json(res,await service.changes(Number(url.searchParams.get('cursor')||0)));
  }
  if(req.method==='POST'&&p==='/api/write'){
   if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'Same-origin JSON required.'},403);
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12000000)return json(res,{error:'Request too large.'},413);chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks));if(['save_note','create_note_action','restore_note_revision'].includes(body.kind)&&req.headers['x-workspace-notes']!=='note-colours-v3')return json(res,{error:'Refresh this tab before saving notes. Copy any unsaved text first; the saved page has not been changed.'},409);if(body.kind!=='restore_backup'&&size>(['save_note','create_note_action'].includes(body.kind)?10000000:body.kind==='save_note_image'?1100000:body.kind==='save_note_blob'?1000000:64000))return json(res,{error:'Request too large.'},413);return json(res,await service.write(body.kind,body.input,body.operation_id,'local-browser'));
  }
  return json(res,{error:'Not found.'},404);
 }catch(error){return json(res,{error:error.message},String(error.message).startsWith('Conflict:')?409:400);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Project Workspace: ${origin}`));
function close(){server.close(()=>{db.close();process.exit();});}
process.on('SIGINT',close);process.on('SIGTERM',close);
