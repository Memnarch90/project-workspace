'use strict';
function zipFiles(files,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){
const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
const u16=(v,o,n)=>v.setUint16(o,n,true),u32=(v,o,n)=>v.setUint32(o,n>>>0,true);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
for(const [path,text] of Object.entries(files)){const name=enc.encode(path),data=typeof text==='string'?enc.encode(text):text,sum=crc(data),head=new Uint8Array(30+name.length),h=new DataView(head.buffer);u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x800);u32(h,14,sum);u32(h,18,data.length);u32(h,22,data.length);u16(h,26,name.length);head.set(name,30);chunks.push(head,data);const cd=new Uint8Array(46+name.length),v=new DataView(cd.buffer);u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x800);u32(v,16,sum);u32(v,20,data.length);u32(v,24,data.length);u16(v,28,name.length);u32(v,42,offset);cd.set(name,46);central.push(cd);offset+=head.length+data.length;}
const length=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);u32(v,0,0x06054b50);u16(v,8,central.length);u16(v,10,central.length);u32(v,12,length);u32(v,16,offset);return new Blob([...chunks,...central,end],{type});
}
const workbookXML=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const excelDay=value=>Math.round((Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
const xCell=(ref,value,style=28)=>value===null||value===undefined||value===''?`<c r="${ref}" s="${style}"/>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${workbookXML(value)}</t></is></c>`;
const xNumber=(ref,value,style)=>value===null||value===undefined||value===''?`<c r="${ref}" s="${style}"/>`:`<c r="${ref}" s="${style}"><v>${value}</v></c>`;
const xDate=(ref,value,style)=>xNumber(ref,value?excelDay(value):null,style);
function planWorkbookFiles(items,projectName,{risks=[],workstreamName='',asOf='',includeContext=false}={}){
 const xml=workbookXML,last=Math.max(497,items.length+2),riskLast=Math.max(38,risks.length+4),used=Math.max(3,items.length+2),printLast=Math.max(26,used);
 const caption=projectName+(workstreamName?' — '+workstreamName:'');
 const safeSheet=(projectName||'Project Plan').replace(/[\[\]:*?\/\\]/g,' ').replace(/^'+|'+$/g,'').slice(0,31)||'Project Plan';
 const sheetName=['risk log','lists'].includes(safeSheet.toLocaleLowerCase())?'Project Plan':safeSheet;
 const row=(n,cells,ht)=>`<row r="${n}" spans="1:8"${ht?` ht="${ht}" customHeight="1"`:''}>${cells}</row>`;
 const firstStart=items.map(t=>t.start).filter(Boolean).sort()[0];
 const startCaption=firstStart?' - start: '+new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(firstStart+'T00:00:00Z')):'';
 let planRows=row(1,xCell('A1','1. '+caption+startCaption,39)+xCell('E1','',37)+['F','G','H'].map(c=>xCell(c+'1','',38)).join(''),25.4)+row(2,['Action','Task/ Milestone','Department','Owner','Status','Notes','Start date','End date'].map((s,i)=>xCell(String.fromCharCode(65+i)+'2',s,[40,41,42,42,42,41,41,41][i])).join(''),31);
 const mappedStatus=s=>({Completed:'Complete','Not Started':'Not started','In Progress':'In progress',Waiting:'In progress',Blocked:'At risk'}[s]||'Not started');
 for(let n=3;n<=last;n++){
  const t=items[n-3];if(!t){planRows+=row(n,['A','B','C','D','E','F','G','H'].map((c,i)=>xCell(c+n,'',[28,28,28,28,29,30,31,31][i])).join(''));continue;}
  const notes=[includeContext&&t.project?'Project: '+t.project:'',includeContext&&t.stream?'Workstream: '+t.stream:'',['Waiting','Blocked'].includes(t.status)?'Action status: '+t.status:'',t.notes||''].filter(Boolean).join(' | ');
  const lines=Math.max(Math.ceil(t.title.length/47),...notes.split('\n').map(s=>Math.max(1,Math.ceil(s.length/33))),1),height=Math.min(409,Math.max(14.5,lines*14.5));
  planRows+=row(n,xCell('A'+n,t.title,28)+xCell('B'+n,t.type,28)+xCell('C'+n,t.department||'',28)+xCell('D'+n,t.owner||'',28)+xCell('E'+n,mappedStatus(t.status),29)+xCell('F'+n,notes,30)+xDate('G'+n,t.start,31)+xDate('H'+n,t.due,31),height);
 }
 let plan=planTemplate.shells.plan.replace('__ROWS__',planRows).replace(/<dimension ref="[^"]+"\/>/,`<dimension ref="A1:H${last}"/>`).replace(/(<autoFilter[^>]*ref=")[^"]+"/,`$1A2:H${used}"`).replaceAll('H3:H497',`H3:H${last}`).replaceAll('C3:C497',`C3:C${last}`).replaceAll('D3:D497',`D3:D${last}`);
 const reviewed=risks.map(r=>r.reviewed_on).filter(Boolean).sort().at(-1)||'';
 const guidance='Events that will have a negative impact on your workstream if they occur. Risk refers to the combined likelihood the event will occur and the impact on the workstream if it does occur. If the likelihood of the event happening and impact to the workstream are both high, you identify the event as a serious risk. The log includes a description of each risk, analysis and a plan to manage it.';
 let riskRows=`<row r="1" ht="39" customHeight="1">${xCell('A1','Risk log - project: ',43)}${xCell('D1',caption,43)}</row><row r="2" ht="23.5" customHeight="1">${xCell('A2','Last Reviewed: ',44)}${xDate('D2',reviewed,17)}</row><row r="3" ht="35.5" customHeight="1">${xCell('A3',guidance,45)}</row><row r="4" ht="69.5" customHeight="1">${['ID','Date Raised','Function','Owner','Description','Date becomes an issue','Likelihood','Impact','Severity','Mitigation Plan','Status','Update Comments '].map((s,i)=>xCell(String.fromCharCode(65+i)+'4',s,[10,11,12,13,14,14,15,15,15,14,13,12][i])).join('')}</row>`;
 for(let n=5;n<=riskLast;n++){
  const r=risks[n-5],score=r?.likelihood&&r?.impact?r.likelihood*r.impact:null;
  const comments=r?[includeContext&&r.project?'Project: '+r.project:'',r.workstream?'Workstream: '+r.workstream:workstreamName?'Project-wide risk':'',r.comments||''].filter(Boolean).join(' | '):'';
  const formula=`<c r="I${n}" s="16"${score===null?' t="str"':''}><f>IF(COUNT(G${n}:H${n})=2,G${n}*H${n},&quot;&quot;)</f><v>${score??''}</v></c>`;
  const cells=xCell('A'+n,r?.reference,16)+xDate('B'+n,r?.date_raised,17)+xCell('C'+n,r?.function,16)+xCell('D'+n,r?.assignee,18)+xCell('E'+n,r?.description,19)+xDate('F'+n,r?.issue_date,21)+xNumber('G'+n,r?.likelihood,16)+xNumber('H'+n,r?.impact,16)+formula+xCell('J'+n,r?.mitigation,18)+xCell('K'+n,r?.status,16)+xCell('L'+n,comments,18);
  const height=r?Math.min(409,Math.max(15,15*Math.max(Math.ceil(r.description.length/28),Math.ceil((r.mitigation||'').length/38),Math.ceil(comments.length/50)))):15;
  riskRows+=`<row r="${n}" ht="${height}" customHeight="1">${cells}</row>`;
 }
 let risk=planTemplate.shells.risk.replace('__ROWS__',riskRows).replace('A1:L38',`A1:L${riskLast}`).replaceAll('I4:I38',`I4:I${riskLast}`).replaceAll('I5:I38',`I5:I${riskLast}`).replaceAll('G5:H38',`G5:H${riskLast}`).replaceAll('K5:K19',`K5:K${riskLast}`);
 const owners=[...new Set([...items.map(t=>t.owner),...risks.map(r=>r.assignee)].filter(Boolean))].sort(),departments=[...new Set([...items.map(t=>t.department),...risks.map(r=>r.function)].filter(Boolean))].sort();
 const listsLast=Math.max(16,owners.length+1,departments.length+1);let listRows='';const types=['Task','Milestone'],statuses=['Not started','In progress','Complete','At risk'];
 for(let n=1;n<=listsLast;n++)listRows+=`<row r="${n}">${['A','B','C','D'].map((c,i)=>xCell(c+n,n===1?['Task/Milestone','Status','Who','Department'][i]:[types[n-2],statuses[n-2],owners[n-2],departments[n-2]][i],i===1&&n>=3&&n<=5?[24,25,26][n-3]:0)).join('')}</row>`;
 const lists=planTemplate.shells.lists.replace('__ROWS__',listRows).replace('A1:D16',`A1:D${listsLast}`);
 plan=plan.replace('Lists!$C$2:$C$14',`Lists!$C$2:$C$${Math.max(2,owners.length+1)}`).replace('Lists!$D$2:$D$16',`Lists!$D$2:$D$${Math.max(2,departments.length+1)}`);
 const files={...planTemplate.parts,'xl/worksheets/sheet1.xml':plan,'xl/worksheets/sheet2.xml':risk,'xl/worksheets/sheet3.xml':lists,
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+[1,2,3].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/><sheet name="Risk log" sheetId="2" r:id="rId2"/><sheet name="Lists" sheetId="3" r:id="rId3"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheetName.replaceAll("'","''"))}'!$A$2:$H$${used}</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">'${xml(sheetName.replaceAll("'","''"))}'!$A$2:$H$${printLast}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3].map(i=>`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')+'<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>'};
 return files;
}
function createPlanWorkbook(items,projectName,options={}){return zipFiles(planWorkbookFiles(items,projectName,options));}
function workstreamExportGroups(tasks,risks,streams,projects){
 const keys=new Map();const add=(projectId,streamId)=>{const key=(projectId||'unassigned')+'|'+(streamId||'general');if(!keys.has(key))keys.set(key,{projectId,streamId,projectName:projects.find(p=>p.id===projectId)?.name||'Unassigned',workstreamName:streams.find(s=>s.id===streamId)?.name||'General'});};
 tasks.forEach(t=>add(t.project_id,t.workstream_id));risks.filter(r=>r.workstream_id).forEach(r=>add(r.project_id,r.workstream_id));if(!keys.size)risks.forEach(r=>add(r.project_id,null));
 return [...keys.values()].map(g=>({...g,tasks:tasks.filter(t=>t.project_id===g.projectId&&(t.workstream_id||null)===(g.streamId||null)),risks:risks.filter(r=>r.project_id===g.projectId&&(!r.workstream_id||r.workstream_id===g.streamId))}));
}
