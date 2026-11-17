import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
import {workspace} from '../store.mjs';

test('Backup screen previews the actual current export and legacy versions without writing',async()=>{
 const db=sqliteAdapter(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 try{const s=workspace(db,'fictional-preview'),backup=await s.tools.backup();await s.tools.validateBackup(backup);
 const source=readFileSync(new URL('../workspace-ui.js',import.meta.url),'utf8'),start=source.indexOf('async function previewRestore('),end=source.indexOf('\n',start),html={innerHTML:''},requests=[];
 const ctx=vm.createContext({TextEncoder,crypto,esc:x=>String(x),$:()=>html,api:async url=>{requests.push(url);if(url==='/api/revision')return {cursor:backup.cursor};if(url==='/api/backup')return structuredClone(backup);throw Error('Unexpected request '+url);}});
 vm.runInContext('let restoreCandidate=null;'+source.slice(start,end),ctx);
 const sign=async b=>{const {sha256,...body}=b;return {...body,sha256:Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))).toString('hex')};};
 for(const version of [5,4,3,2,1]){const candidate=await sign({...backup,version});await ctx.previewRestore(candidate);assert.match(html.innerHTML,new RegExp('Backup format v'+version));assert.equal(vm.runInContext('restoreCandidate.backup.version',ctx),version);}
 assert.ok(requests.every(r=>r==='/api/revision'||r==='/api/backup'));
 await assert.rejects(()=>ctx.previewRestore(awaitableFuture()),/Choose a workspace backup/);
 function awaitableFuture(){return {...backup,version:6};}
 const damaged=structuredClone(backup);damaged.created_at+=' changed';await assert.rejects(()=>ctx.previewRestore(damaged),/damaged/);
 }finally{db.close();}
});
