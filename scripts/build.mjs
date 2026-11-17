import {build} from 'esbuild';
import {mkdirSync,copyFileSync,appendFileSync} from 'node:fs';
import {NOTE_COLOUR_CSS} from '../notes-model.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
mkdirSync(path.join(root,'public'),{recursive:true});
for(const f of ['index.html','people-ui.js','people.css','note-media.js','note-layout.js','notes-ui.js','note-workflows.js','meeting-journal.js','notes.css','app.js','ux.js','workspace-ui.js','knowledge-ui.js','knowledge-export.js','knowledge.css','case-view.js','retry-writes.js','export.js','export-template.js','risk-ui.js','style.css','project-icons.js','icons.css','app-icon.svg','app-icon-180.png','app-icon-192.png','app-icon-512.png','site.webmanifest'])copyFileSync(path.join(root,f),path.join(root,'public',f));
appendFileSync(path.join(root,'public','notes.css'),'\n'+NOTE_COLOUR_CSS+'\n');
console.log('Static dashboard assets built.');

await build({entryPoints:[path.join(root,'notes-editor-entry.js')],bundle:true,format:'iife',target:['es2022'],outfile:path.join(root,'public','notes-editor.js'),minify:true,legalComments:'eof'});
