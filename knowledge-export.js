'use strict';

function createKnowledgeWorkbook({revisions,audit}) {
 const currentHeaders=['ID','Category','Title','Content','Link','Is this verified information?','Version Number','Created By','Created','Modified','Modified By'];
 const archiveHeaders=[...currentHeaders.slice(0,6),'Modified','Created','Created By','Modified By','Version Number','Reason for Archiving'];
 const articles=new Map(),first=new Map();
 for(const row of revisions){
  if(!first.has(row.article_id))first.set(row.article_id,row);
  articles.set(row.article_id,row);
 }
 const sourceFor=r=>first.get(r.article_id).source_excel;
 const base=r=>{
  const source=sourceFor(r);
  const link=source?.link_target===r.link?source.link_label:r.link;
  return [source?.id??r.article_id,r.category,r.title,r.content,link,r.verified?'Yes':'No'];
 };
 const createdBy=r=>sourceFor(r)?.created_by??first.get(r.article_id).proposed_by;
 const createdAt=r=>sourceFor(r)?.created??first.get(r.article_id).decided_at;
 const modifiedBy=r=>r.source_excel?.modified_by??r.proposed_by;
 const modifiedAt=r=>r.source_excel?.modified??r.decided_at;
 const auditMetadata=r=>[r.decided_by,r.decided_at,r.reason,r.summary,r.keywords.join(', '),r.bot_access?'Yes':'No'];
 const active=[],archive=[],activeRows=[],archivedRows=[];
 for(const r of [...articles.values()].sort((a,b)=>(sourceFor(a)?.row??Infinity)-(sourceFor(b)?.row??Infinity)||a.article_id.localeCompare(b.article_id))){
  if(r.archived){
   archive.push([...base(r),modifiedAt(r),createdAt(r),createdBy(r),modifiedBy(r),r.version,r.archive_reason]);
   archivedRows.push(r);
  }else{
   active.push([...base(r),r.version,createdBy(r),createdAt(r),modifiedAt(r),modifiedBy(r)]);
   activeRows.push(r);
  }
 }
 const sheets=[
  ['Internal Knowledge',currentHeaders,active,activeRows],
  ['Archive',archiveHeaders,archive,archivedRows],
  ['Version History',[...currentHeaders,'Approved By','Approved At (UTC)','Change Reason','Summary','Keywords','Jace Access','Archived','Reason for Archiving','Portal Article ID'],
   revisions.map(r=>[...base(r),r.version,createdBy(r),createdAt(r),modifiedAt(r),modifiedBy(r),
    ...auditMetadata(r),r.archived?'Yes':'No',r.archive_reason,r.article_id]),revisions],
  ['Approval Log',['Proposal ID','Article ID','Previous Version','Change Reason','Proposed By','Proposed At (UTC)','Status','Decided By','Decided At (UTC)'],
   audit.map(r=>[r.id,r.article_id,r.expected_version,r.reason,r.proposed_by,r.proposed_at,r.status,r.decided_by,r.decided_at])]
 ];
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const relationships='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const packageRelationships='http://schemas.openxmlformats.org/package/2006/relationships';
 const drawing='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
 const art='http://schemas.openxmlformats.org/drawingml/2006/main';
 const pieces={
  '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  '_rels/.rels':`<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${relationships}"><sheets>${sheets.map(([name],i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':`<Relationships xmlns="${packageRelationships}">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${relationships}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${relationships}/styles" Target="styles.xml"/></Relationships>`,
  'xl/styles.xml':`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5D3484"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
 };
 const sheetRelationships=items=>`<Relationships xmlns="${packageRelationships}">${items.join('')}</Relationships>`;
 let hasImages=false;
 for(const [i,[,headers,data,records=[]]] of sheets.entries()){
  const sheetNumber=i+1,sheetRels=[],links=[],images=[];
  for(const [index,r] of records.entries()){
   if(/^https?:\/\//i.test(r.link)){
    const id='link'+index;
    links.push(`<hyperlink ref="E${index+2}" r:id="${id}"/>`);
    sheetRels.push(`<Relationship Id="${id}" Type="${relationships}/hyperlink" Target="${workbookXML(r.link)}" TargetMode="External"/>`);
   }
   const src=sourceFor(r);
   if(i<2&&src?.png)images.push({index,src});
  }
  if(images.length){
   hasImages=true;
   sheetRels.push(`<Relationship Id="drawing" Type="${relationships}/drawing" Target="../drawings/drawing${sheetNumber}.xml"/>`);
   const imageRels=[],anchors=images.map(({index,src},n)=>{
    const id=n+1,name=`source-${sheetNumber}-${id}.png`;
    pieces['xl/media/'+name]=Uint8Array.from(atob(src.png),c=>c.charCodeAt(0));
    imageRels.push(`<Relationship Id="image${id}" Type="${relationships}/image" Target="../media/${name}"/>`);
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${index+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${src.png_width*9525}" cy="${src.png_height*9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Original workbook image ${id}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="image${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
   });
   pieces[`xl/drawings/drawing${sheetNumber}.xml`]=`<xdr:wsDr xmlns:xdr="${drawing}" xmlns:a="${art}" xmlns:r="${relationships}">${anchors.join('')}</xdr:wsDr>`;
   pieces[`xl/drawings/_rels/drawing${sheetNumber}.xml.rels`]=sheetRelationships(imageRels);
   pieces['[Content_Types].xml']=pieces['[Content_Types].xml'].replace('</Types>',`<Override PartName="/xl/drawings/drawing${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  if(sheetRels.length)pieces[`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`]=sheetRelationships(sheetRels);
  const col=n=>String.fromCharCode(65+n);
  const cell=(value,j,index)=>{
   const ref=col(j)+(index+1);
   if(index===0)return xCell(ref,value,1);
   if(typeof value==='number')return xNumber(ref,value,0);
   if(headers[j].match(/^(Created|Modified)$| At \(UTC\)$/)&&value){
    const time=Date.parse(/Z$/.test(value)?value:value+'Z');
    if(Number.isFinite(time))return xNumber(ref,(time-Date.UTC(1899,11,30))/86400000,3);
   }
   return xCell(ref,value,2);
  };
  const rows=[headers,...data].map((row,index)=>`<row r="${index+1}">${row.map((value,j)=>cell(value,j,index)).join('')}</row>`).join('');
  const range=`A1:${col(headers.length-1)}${data.length+1}`;
  const width=header=>({Content:76,Title:40,Summary:44,Link:36,ID:40,'Article ID':40,'Proposal ID':40,'Change Reason':36})[header]||24;
  pieces[`xl/worksheets/sheet${sheetNumber}.xml`]=`<worksheet xmlns="${ns}" xmlns:r="${relationships}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${headers.map((h,j)=>`<col min="${j+1}" max="${j+1}" width="${width(h)}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="${range}"/>${links.length?`<hyperlinks>${links.join('')}</hyperlinks>`:''}${images.length?'<drawing r:id="drawing"/>':''}</worksheet>`;
 }
 if(hasImages)pieces['[Content_Types].xml']=pieces['[Content_Types].xml'].replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
 return zipFiles(pieces);
}
