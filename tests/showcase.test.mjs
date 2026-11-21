import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('public showcase has no workspace network or persistence path and uses local assets',()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../docs/showcase.js',import.meta.url),'utf8');
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/Fictional data/);
 assert.match(html,/Changes reset on reload/);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie/);
 assert.doesNotMatch(html+script,new RegExp('fed'+'ex|jarvis'+'-pixel','i'));
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(match[1].startsWith('https://')){assert.ok(match[1].startsWith('https://github.com/Memnarch90/project-workspace'));continue;}
  assert.ok(existsSync(new URL('../docs/'+match[1],import.meta.url)),match[1]);
 }
});
