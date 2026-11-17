// Meeting visibility is transient editor state, independent of saved note content.
export function meetingFoldRanges(doc,legacyId){
 const ranges=[];
 doc.forEach((node,pos,index)=>{
  if(node.type.name!=='meetingMeta')return;
  if(ranges.length)ranges.at(-1).to=pos;
  ranges.push({id:node.attrs.meeting_id||(!index?legacyId:null),from:pos,bodyFrom:pos+node.nodeSize,to:doc.content.size});
 });
 return ranges;
}

export function reconcileMeetingFolds(ids,oldState,newState,transactions,legacyId){
 // Explicit fold controls already moved the caret to a visible meeting header.
 if(transactions.every(t=>t.getMeta('meeting-folds')))return new Set(ids);
 const ranges=meetingFoldRanges(newState.doc,legacyId),oldRanges=new Map(meetingFoldRanges(oldState.doc,legacyId).map(r=>[r.id,r]));
 const result=new Set(ids),changed=transactions.some(t=>t.docChanged),selection=newState.selection;
 const headerSelected=selection.node?.type.name==='meetingMeta';
 for(const id of ids){
  const range=ranges.find(r=>r.id===id),before=oldRanges.get(id);
  if(!range){result.delete(id);continue;}
  // The next header is excluded from the preceding body's range.
  const entered=!headerSelected&&(selection.empty?
   selection.from>=range.bodyFrom&&selection.from<range.to:
   selection.from<range.to&&selection.to>range.bodyFrom);
  const edited=changed&&(!before||!oldState.doc.slice(before.bodyFrom,before.to).content.eq(newState.doc.slice(range.bodyFrom,range.to).content));
  if(entered||edited)result.delete(id);
 }
 return result;
}
