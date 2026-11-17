'use strict';

const WorkspaceKnowledge=(()=>{
 const endpoint='/api/knowledge/';
 const labels={current:'Current',archive:'Archive',queue:'Pending approval'};
 const filters={tab:'current',query:'',category:''};
 let root, listRequest=0, detailRequest=0, active=null, articleHistory=[], timer;
 const call=(route,params)=>api(endpoint+route+(params?'?'+new URLSearchParams(params):''));
 const time=value=>value?value.replace('T',' ').slice(0,19)+' UTC':'';
 const flag=(label,value)=>`<span class="knowledge-badge ${value?'is-on':''}">${label}</span>`;
 const metadata=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
 const button=(action,label,style='secondary')=>`<button type="button" class="${style}" data-knowledge-action="${action}">${label}</button>`;
 const attached=element=>state.view==='knowledge'&&root===element&&element?.isConnected;
 function notice(text){root.querySelector('[data-knowledge-notice]').textContent=text;}
 function updateAddress(key,id){
  const url=new URL(location.href);
  url.searchParams.delete('knowledge');
  url.searchParams.delete('knowledgeProposal');
  if(key&&id)url.searchParams.set(key,id);
  history.replaceState(null,'',url.pathname+url.search);
 }
 function render(){
  $('workspaceTitle').textContent='Internal Knowledge';
  $('viewTitle').textContent='Internal Knowledge';
  $('viewDescription').textContent='';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='knowledge')));
  for(const id of ['planFilterWrap','completionFilterWrap','exportPanel','newTask','projectFilterWrap','dayProjectWrap','filterContext','savedViews'])$(id).hidden=true;
  document.querySelector('.filters .search').hidden=true;
  if(attached(root))return;
  $('content').replaceChildren();
  root=node('section',undefined,'knowledge');
  $('content').append(root);
  root.innerHTML=`<div class="knowledge-toolbar">
   <div class="knowledge-tabs" aria-label="Knowledge views">${Object.entries(labels).map(([tab,label])=>`<button type="button" data-knowledge-tab="${tab}" aria-pressed="${filters.tab===tab}">${label}</button>`).join('')}</div>
   <div class="knowledge-actions">${state.canWrite?button('new','New article'):''}${button('export','Export Excel','primary')}</div>
   </div><div class="knowledge-filters">
   <label>Search articles<input type="search" maxlength="160" placeholder="Title, keyword or content" value="${esc(filters.query)}" data-knowledge-query></label>
   <label>Category<select data-knowledge-category><option value="">All categories</option></select></label>
   </div><p class="sub" role="status" data-knowledge-notice></p>
   <div class="knowledge-grid"><div class="knowledge-list" aria-label="Knowledge results"></div><div class="knowledge-detail" aria-label="Knowledge details"></div></div>`;
  root.addEventListener('click',click);
  root.addEventListener('submit',submit);
  root.querySelector('[data-knowledge-query]').addEventListener('input',e=>{
   filters.query=e.target.value;
   clearTimeout(timer);
   timer=setTimeout(()=>void loadList(),200);
  });
  root.querySelector('[data-knowledge-category]').addEventListener('change',e=>{
   filters.category=e.target.value;
   void loadList();
  });
  const params=new URLSearchParams(location.search),pending=params.get('knowledgeProposal'),id=params.get('knowledge');
  if(pending){setTab('queue');void showDetail('proposal',pending);}
  else if(id){setTab('current');void showDetail('article',id);}
  else{setTab(filters.tab);emptyDetail();}
  void loadCategories();
 }
 function emptyDetail(){
  detailRequest++;
  active=null;
  root.querySelector('.knowledge-detail').innerHTML='<p class="sub">Select an article or proposal to open it.</p>';
 }
 function setTab(tab){
  filters.tab=tab;
  root.querySelector('.knowledge-filters').hidden=tab==='queue';
  root.querySelectorAll('[data-knowledge-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.knowledgeTab===tab)));
  root.querySelector('[data-knowledge-tab=queue]').textContent=labels.queue;
  void loadList();
 }
 async function loadCategories(){
  const element=root;
  try{
   const categories=await call('categories');
   if(!attached(element))return;
   const select=root.querySelector('[data-knowledge-category]');
   select.replaceChildren(new Option('All categories',''));
   for(const category of categories)select.add(new Option(category,category));
   select.value=filters.category;
  }catch(error){if(attached(element))notice(error.message);}
 }
 async function loadList(offset=0){
  if(!attached(root))return;
  const element=root, request=++listRequest, tab=filters.tab;
  const pane=root.querySelector('.knowledge-list');
  if(!offset)pane.textContent='Loading…';
  try{
   const result=tab==='queue'?{items:await call('queue')}:await call('search',{
    status:tab,query:filters.query,category:filters.category,limit:30,offset
   });
   if(!attached(element)||request!==listRequest)return;
   if(tab==='queue')root.querySelector('[data-knowledge-tab=queue]').textContent=`Pending approval (${result.items.length})`;
   if(!offset)pane.replaceChildren();
   pane.querySelector('[data-knowledge-more]')?.remove();
   for(const article of result.items){
    const entry=node('button',undefined,'knowledge-result');
    entry.type='button';
    entry.dataset.knowledgeEntry=tab==='queue'?article.id:article.article_id;
    entry.setAttribute('aria-current',String(entry.dataset.knowledgeEntry===active));
    entry.append(node('strong',article.title),node('span',tab==='queue'?
     `${article.expected_version?'Amendment':'New article'} · ${time(article.proposed_at)}`:
     `${article.category} · v${article.version}`,'sub'));
    pane.append(entry);
   }
   if(!result.items.length&&!offset)pane.append(node('p',tab==='queue'?'No proposals awaiting approval.':'No matching articles.','sub'));
   if(result.next_offset!==undefined&&result.next_offset!==null){
    const more=node('button','Show more','secondary');
    more.dataset.knowledgeMore=String(result.next_offset);
    pane.append(more);
   }
  }catch(error){if(attached(element)&&request===listRequest)pane.textContent=error.message;}
 }
 function articleBody(a){
  return `<p class="sub">${esc(a.category)}</p><h3>${esc(a.title)}</h3>
  <div class="knowledge-badges">${flag(a.verified?'Verified':'Unverified',a.verified)} ${flag(a.bot_access?'Jace access on':'Jace access off',a.bot_access)} ${a.archived?flag('Archived',false):''}</div>
  <p class="knowledge-summary">${esc(a.summary)}</p><div class="knowledge-body">${esc(a.content)}</div>
  ${a.link?`<p><a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">Open source guide ↗</a></p>`:''}
  ${a.keywords.length?`<p class="sub">Keywords · ${esc(a.keywords.join(', '))}</p>`:''}
  ${a.archived?`<p>Archive reason · ${esc(a.archive_reason)}</p>`:''}`;
 }
 function renderArticle({article,history}){
  articleHistory=history;
  const saved=history[0],created=history.at(-1);
  const source=created.source_excel;
  const imported=saved.version===created.version&&source;
  const sourceTime=value=>value.replace('T',' ').slice(0,19);
  const metadataBlock=`<dl class="knowledge-metadata">${source?metadata('Excel ID',String(source.id)):metadata('Article ID',article.article_id)}
   ${metadata('Version',String(article.version))}${metadata('Created',source?sourceTime(source.created):time(created.decided_at))}${metadata('Created by',source?.created_by||created.proposed_by)}
   ${metadata('Updated',imported?sourceTime(source.modified):time(article.decided_at))}${metadata('Updated by',imported?source.modified_by:saved.proposed_by)}
   ${metadata('Approved by',saved.decided_by)}${metadata('Approved at',time(saved.decided_at))}</dl>`;
  const referenceImage=source?.png
   ?`<details class="knowledge-source-image"><summary>Image from the original workbook</summary><img src="data:image/png;base64,${esc(source.png)}" loading="lazy" alt="Reference image from the original workbook"></details>`:'';
  const originalReference=source&&!source.link_target&&!article.link&&source.link_label
   ?`<p>Original reference · ${esc(source.link_label)}</p>`:'';
  return `${articleBody(article)}${originalReference}${referenceImage}${metadataBlock}${state.canWrite?button('edit','Propose an edit'):''}
   <h4>Version history</h4><div class="knowledge-history">${history.map(r=>`<details><summary>Version ${r.version} · ${time(r.decided_at)} · ${esc(r.reason)}</summary>
    <p class="sub">Proposed by ${esc(r.proposed_by)} · Approved by ${esc(r.decided_by)} at ${time(r.decided_at)}</p>
    ${r.version!==article.version?`${articleBody(r)}${state.canWrite?button('restore:'+r.version,'Propose restoring this version'):''}`:''}</details>`).join('')}</div>`;
 }
 function renderProposal({proposal,current}){
  const stale=proposal.status==='pending'&&(current?.version||0)!==proposal.expected_version;
  const actions=proposal.status==='pending'&&state.canWrite?
   `<div class="knowledge-actions">${stale?'':button('approve','Approve and publish','primary')}${button('reject','Reject proposal')}</div>`:'';
  return `<h3>${proposal.expected_version?'Review amendment':'Review new article'}</h3>
   <dl class="knowledge-metadata">${metadata('Status',proposal.status)}${metadata('Proposed by',proposal.proposed_by)}
   ${metadata('Proposed at',time(proposal.proposed_at))}${metadata('Change reason',proposal.reason)}
   ${proposal.decided_at?metadata('Decided by',proposal.decided_by)+metadata('Decided at',time(proposal.decided_at)):''}</dl>
   ${stale?'<p role="alert">The article has changed since this proposal. Reject it and request a fresh amendment.</p>':''}
   <div class="${current?'knowledge-compare':''}">
   ${current?`<section><h4>Current · version ${current.version}</h4>${articleBody(current)}</section>`:''}
   <section><h4>Proposed contents</h4>${articleBody(proposal)}</section></div>
   ${actions}${proposal.status==='approved'?button('open-published:'+proposal.article_id,'Open published article'):''}`;
 }
 async function showDetail(kind,id){
  const element=root,request=++detailRequest;
  active=id;
  articleHistory=[];
  updateAddress(kind==='proposal'?'knowledgeProposal':'knowledge',id);
  root.querySelectorAll('[data-knowledge-entry]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.knowledgeEntry===id)));
  const pane=root.querySelector('.knowledge-detail');
  pane.textContent='Loading…';
  try{
   const result=await call(kind,{id});
   if(attached(element)&&request===detailRequest){
    if(kind==='article'&&result.article.archived&&filters.tab==='current')setTab('archive');
    pane.innerHTML=kind==='article'?renderArticle(result):renderProposal(result);
   }
  }catch(error){if(attached(element)&&request===detailRequest)pane.textContent=error.message;}
 }
 function compose(draft={},base=null,reason=''){
  detailRequest++;
  const pane=root.querySelector('.knowledge-detail');
  pane.innerHTML=`<h3>${base?'Propose an amendment':'Propose a new article'}</h3>
   <form data-knowledge-form data-id="${esc(base?.article_id||'')}" data-version="${base?.version||0}">
    <label>Title<input name="title" required maxlength="180" value="${esc(draft.title||'')}"></label>
    <label>Category<input name="category" required maxlength="80" value="${esc(draft.category||'')}"></label>
    <label>Summary<input name="summary" required maxlength="280" value="${esc(draft.summary||'')}"></label>
    <label>Article content<textarea name="content" rows="8" maxlength="24000" required>${esc(draft.content||'')}</textarea></label>
    <label>Keywords <span class="sub">Separate with commas</span><input name="keywords" maxlength="500" value="${esc(draft.keywords?.join(', ')||'')}"></label>
    <label>Source link<input name="link" type="url" maxlength="2000" value="${esc(draft.link||'')}"></label>
    <div class="knowledge-options"><label><input name="verified" type="checkbox" ${draft.verified?'checked':''}> Verified</label>
     <label><input name="bot_access" type="checkbox" ${draft.bot_access!==false?'checked':''}> Jace access</label>
     ${base?`<label><input name="archived" type="checkbox" ${draft.archived?'checked':''}> Archive article</label>`:''}</div>
    ${base?`<label>Archive reason<input name="archive_reason" maxlength="500" value="${esc(draft.archive_reason||'')}"></label>`:''}
    <label>Change reason<input name="reason" required maxlength="500" value="${esc(reason)}"></label>
    <div class="knowledge-actions"><button type="submit" class="primary">Review proposal</button>${button('cancel','Cancel')}</div>
    <p role="alert" class="sub" data-knowledge-form-error></p>
   </form>`;
  pane.querySelector('input').focus();
 }
 async function submit(event){
  const form=event.target.closest('[data-knowledge-form]');
  if(!form)return;
  event.preventDefault();
  const element=root,data=new FormData(form),get=name=>String(data.get(name)||'').trim();
  const body={
   ...(form.dataset.id?{article_id:form.dataset.id,expected_version:Number(form.dataset.version)}:{}),
   reason:get('reason'),
   article:{title:get('title'),category:get('category'),summary:get('summary'),content:get('content'),
    keywords:get('keywords').split(',').map(s=>s.trim()).filter(Boolean),link:get('link'),
    verified:data.has('verified'),bot_access:data.has('bot_access'),archived:data.has('archived'),archive_reason:get('archive_reason')}
  };
  const signature=JSON.stringify(body);
  if(form.lastKnowledgeWrite?.signature!==signature)form.lastKnowledgeWrite={signature,id:crypto.randomUUID()};
  const save=form.querySelector('[type=submit]');
  save.disabled=true;
  try{
   const proposal=await api(endpoint+'propose',{...body,operation_id:form.lastKnowledgeWrite.id});
   if(!attached(element))return;
   setTab('queue');
   await showDetail('proposal',proposal.id);
  }catch(error){form.querySelector('[data-knowledge-form-error]').textContent=error.message;}
  finally{save.disabled=false;}
 }
 async function click(event){
  const target=event.target.closest('button');
  if(!target)return;
  if(target.dataset.knowledgeTab){
   emptyDetail();updateAddress();notice('');
   setTab(target.dataset.knowledgeTab);
  }
  if(target.dataset.knowledgeMore)await loadList(Number(target.dataset.knowledgeMore));
  if(target.dataset.knowledgeEntry){
   notice('');
   await showDetail(filters.tab==='queue'?'proposal':'article',target.dataset.knowledgeEntry);
  }
  const action=target.dataset.knowledgeAction;
  if(!action)return;
  if(action==='new'){notice('');updateAddress();active=null;compose();}
  if(action==='edit'&&articleHistory.length)compose(articleHistory[0],articleHistory[0]);
  if(action.startsWith('restore:')){
   const revision=articleHistory.find(r=>r.version===Number(action.split(':')[1]));
   if(revision)compose(revision,articleHistory[0],`Restore version ${revision.version}`);
  }
  if(action==='cancel'){
   if(active)await showDetail('article',active);
   else emptyDetail();
  }
  if(action.startsWith('open-published:')){
   setTab('current');
   await showDetail('article',action.split(':')[1]);
  }
  const element=root;
  if(action==='approve'||action==='reject'){
   const id=active;
   const actions=[...target.parentElement.querySelectorAll('button')];
   actions.forEach(b=>b.disabled=true);
   try{
    const result=await api(endpoint+'decision',{id,decision:action});
    if(!attached(element))return;
    notice(action==='approve'?`Approved and published version ${result.version}.`:'Proposal rejected.');
    if(action==='approve'){
     filters.query='';filters.category='';
     root.querySelector('[data-knowledge-query]').value='';
     setTab(result.archived?'archive':'current');
     await showDetail('article',result.article_id);
     void loadCategories();
    }else{
     void loadList();
     await showDetail('proposal',id);
    }
   }catch(error){if(attached(element))notice(error.message);}
   finally{actions.forEach(b=>b.disabled=false);}
  }
  if(action==='export'){
   target.disabled=true;
   try{
    const records=await call('export');
    downloadPrivate(createKnowledgeWorkbook(records),`Internal Knowledge Database - ${new Date().toISOString().slice(0,10)}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(attached(element))notice('Excel export downloaded. It contains private knowledge and approval history.');
   }catch(error){if(attached(element))notice(error.message);}
   finally{target.disabled=false;}
  }
 }
 return {render};
})();
