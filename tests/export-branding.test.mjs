import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const excludedBrand=new RegExp('fed'+'ex','i');
function unzip(bytes){
 const data=new Uint8Array(bytes),view=new DataView(data.buffer,data.byteOffset,data.byteLength),out={};let i=0;
 while(i+30<=data.length&&view.getUint32(i,true)===0x04034b50){
  assert.equal(view.getUint16(i+8,true),0,'expected stored ZIP entries');
  const size=view.getUint32(i+18,true),n=view.getUint16(i+26,true),extra=view.getUint16(i+28,true),start=i+30+n+extra;
  out[new TextDecoder().decode(data.slice(i+30,i+30+n))]=data.slice(start,start+size);i=start+size;
 }
 assert.ok(Object.keys(out).length);return out;
}
function checkWorkbook(bytes){
 const entries=unzip(bytes);assert.ok(entries['xl/workbook.xml']);
 for(const [name,data] of Object.entries(entries)){
  assert.doesNotMatch(name,excludedBrand);
  assert.doesNotMatch(name,/(?:^|\/)(?:media|embeddings|fonts|printerSettings)\/|\.(?:ttf|otf|woff2?|bin)$/i,'no bundled logos, fonts or binary assets');
  const text=new TextDecoder().decode(data);assert.doesNotMatch(text,excludedBrand,name);
  assert.doesNotMatch(text,/TargetMode="External"/,'neutral fixture has no external asset links');
 }
}
test('public project, workstream ZIP and knowledge workbooks contain no excluded branding or embedded assets',async()=>{
 const context=vm.createContext({Blob,TextEncoder,Uint8Array,DataView,Date,Intl});
 for(const file of ['export-template.js','export.js','knowledge-export.js'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
 const tasks=[{title:'Synthetic action',type:'Task',status:'Not Started',owner:'Example Owner',notes:'Example notes',start:'2026-11-21',due:'2026-11-28'}];
 for(const items of [[],tasks])checkWorkbook(await context.createPlanWorkbook(items,'Example project',{risks:[]}).arrayBuffer());
 const child=new Uint8Array(await context.createPlanWorkbook(tasks,'Example project',{workstreamName:'Example workstream',risks:[]}).arrayBuffer());
 const archive=unzip(await context.zipFiles({'Example workstream.xlsx':child},'application/zip').arrayBuffer());
 for(const data of Object.values(archive))checkWorkbook(data);
 checkWorkbook(await context.createKnowledgeWorkbook({revisions:[],audit:[]}).arrayBuffer());
});
