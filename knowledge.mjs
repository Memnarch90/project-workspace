import {z} from 'zod';

export const knowledgeId = z.string().uuid();
const text = max => z.string().trim().min(1).max(max);
const source = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { return ['http:','https:'].includes(new URL(value).protocol); }
  catch { return false; }
}, 'Use an HTTP or HTTPS source link.');

export const knowledgeFields = z.object({
  title:text(180), category:text(80), summary:text(280), content:text(24000),
  keywords:z.array(text(40)).max(12).default([]), link:source.default(''),
  verified:z.boolean().default(false)
}).strict();
const ownerFields = knowledgeFields.extend({
  bot_access:z.boolean().default(true), archived:z.boolean().default(false),
  archive_reason:z.string().trim().max(500).default('')
}).strict();
const proposalInput = article => z.object({
  article_id:knowledgeId.optional(),
  expected_version:z.number().int().min(1).optional(),
  article, reason:text(500), operation_id:knowledgeId
}).strict().refine(data => Boolean(data.article_id) === Boolean(data.expected_version),
  'An amendment requires the article ID and its current version.');
export const botProposalInput = proposalInput(knowledgeFields);
const ownerProposalInput = proposalInput(ownerFields);
const decisionInput = z.object({id:knowledgeId,decision:z.enum(['approve','reject'])}).strict();
const path = id => '/?knowledge='+encodeURIComponent(id);
const proposalPath = id => '/?knowledgeProposal='+encodeURIComponent(id);
const unpack = row => {
  const {content,...metadata} = row;
  return {...JSON.parse(content),...metadata};
};
const queryTerms = query => [...new Set((query || '').slice(0,160).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].slice(0,8);
const botVisible = "json_extract(content,'$.bot_access')=1 AND json_extract(content,'$.archived')=0";
const draftSummary = p => ({
  id:p.id, article_id:p.article_id, expected_version:p.expected_version,
  status:p.status, url:proposalPath(p.id)
});

export function knowledge(db, owner) {
  const sql = (query, ...bindings) => db.prepare(query).bind(owner,...bindings);
  const current = id => sql('SELECT * FROM knowledge_current WHERE owner_id=?1 AND article_id=?2',id).first();
  const pending = id => sql('SELECT * FROM knowledge_proposals WHERE owner_id=?1 AND id=?2',id).first();
  const historyQuery = "SELECT r.article_id,r.version,p.* FROM knowledge_revisions r JOIN knowledge_proposals p ON p.owner_id=r.owner_id AND p.id=r.proposal_id WHERE r.owner_id=?1";
  async function search({query='',category='',status='current',offset=0,limit=5}={}, bot=false) {
    const terms=queryTerms(query), archived=status==='archive'&&!bot;
    const categoryFilter=String(category).slice(0,80);
    const scope=bot ? botVisible : "json_extract(content,'$.archived')="+Number(archived);
    const termPredicates=terms.map((_,i)=>`instr(lower(search_text),?${i+6})>0`);
    const titleScore=terms.length
      ? '('+terms.map((_,i)=>`(instr(lower(title),?${i+6})>0)`).join('+')+') DESC, '
      : '';
    const n=Math.min(bot?8:50,Math.max(1,Number.parseInt(limit,10)||5));
    const start=bot?0:Math.max(0,Number.parseInt(offset,10)||0);
    const exact=(query||'').toLowerCase().trim().slice(0,160);
    const {results}=await sql(`WITH matches AS (
      SELECT article_id,version,decided_at AS updated_at,
        json_extract(content,'$.title') AS title,
        json_extract(content,'$.category') AS category,
        json_extract(content,'$.summary') AS summary,
        json_extract(content,'$.verified') AS verified,
        json_extract(content,'$.title') || ' ' || json_extract(content,'$.category') || ' ' ||
        json_extract(content,'$.summary') || ' ' || json_extract(content,'$.keywords') || ' ' ||
        json_extract(content,'$.content') AS search_text
      FROM knowledge_current WHERE owner_id=?1 AND ${scope}
    ) SELECT article_id,version,title,category,summary,verified,updated_at FROM matches
      WHERE (?2='' OR category=?2) ${termPredicates.map(clause=>' AND '+clause).join('')}
      ORDER BY (lower(title)=?5) DESC, ${titleScore}updated_at DESC, article_id LIMIT ?3 OFFSET ?4`,
    categoryFilter,n+1,start,exact,...terms).all();
    const items=results.slice(0,n).map(item=>({...item,verified:!!item.verified,url:path(item.article_id)}));
    return {items,...(!bot?{next_offset:results.length>n?start+n:null}:{})};
  }
  async function get(id,bot=false,offset=0) {
    knowledgeId.parse(id);
    const row=await current(id);
    if (!row) throw Error('Article not found.');
    const article=unpack(row);
    if (bot) {
      if (article.archived || !article.bot_access) throw Error('Article not found.');
      const start=Math.max(0,Number(offset)||0),end=start+2800;
      return {
        article_id:id,title:article.title,category:article.category,verified:article.verified,
        version:article.version,updated_at:article.decided_at,link:article.link,
        content:article.content.slice(start,end),next_offset:end<article.content.length?end:null,url:path(id)
      };
    }
    const {results}=await sql(historyQuery+' AND r.article_id=?2 ORDER BY r.version DESC',id).all();
    return {article,history:results.map(unpack)};
  }
  async function propose(raw, {actor,bot=false}) {
    const input=(bot?botProposalInput:ownerProposalInput).parse(raw);
    const old=await pending(input.operation_id);
    const articleId=input.article_id || old?.article_id || crypto.randomUUID();
    const version=input.expected_version || 0;
    const live=version ? await current(articleId) : null;
    const article={...input.article};
    if (bot) {
      article.bot_access=true;
      article.archived=false;
      article.archive_reason='';
      if (live && !unpack(live).bot_access) throw Error('Article not found.');
    }
    if (article.archived&&!article.archive_reason) throw Error('Enter a reason for archiving.');
    if (!article.archived) article.archive_reason='';
    const content=JSON.stringify(article);
    function existing(row) {
      if (row.proposed_by!==actor||row.article_id!==articleId||row.expected_version!==version||
          row.content!==content||row.reason!==input.reason) throw Error('Conflict: this request ID is already in use.');
      return draftSummary(row);
    }
    if (old) return existing(old);
    if (version && (!live || (bot&&unpack(live).archived))) throw Error('Article not found.');
    if (version && live.version!==version) throw Error('Conflict: open the current article before proposing a new edit.');
    await sql(`INSERT INTO knowledge_proposals(owner_id,id,article_id,expected_version,content,reason,proposed_by,proposed_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(owner_id,id) DO NOTHING`,
    input.operation_id,articleId,version,content,input.reason,actor,new Date().toISOString()).run();
    const saved=await pending(input.operation_id);
    if (!input.article_id && saved.article_id!==articleId) {
      if (saved.proposed_by===actor && saved.expected_version===version && saved.content===content && saved.reason===input.reason) return draftSummary(saved);
    }
    return existing(saved);
  }
  async function decide(raw) {
    const {id,decision}=decisionInput.parse(raw);
    const state=decision==='approve'?'approved':'rejected';
    const timestamp=new Date().toISOString();
    const actor='GitHub account '+owner;
    const change=sql(`UPDATE knowledge_proposals SET status=?3,decided_at=?4,decided_by=?5
      WHERE owner_id=?1 AND id=?2 AND status='pending'
      AND (?3='rejected' OR EXISTS(SELECT 1 FROM knowledge_revisions r
        WHERE r.owner_id=?1 AND r.proposal_id=?2))`,id,state,timestamp,actor);
    if (decision==='approve') {
      await db.batch([sql(`INSERT INTO knowledge_revisions(owner_id,article_id,version,proposal_id)
        SELECT p.owner_id,p.article_id,p.expected_version+1,p.id FROM knowledge_proposals p
        WHERE p.owner_id=?1 AND p.id=?2 AND p.status='pending'
          AND p.expected_version=COALESCE((SELECT MAX(r.version) FROM knowledge_revisions r
            WHERE r.owner_id=p.owner_id AND r.article_id=p.article_id),0)`,id),change]);
    } else await change.run();
    const row=await pending(id);
    if (!row) throw Error('Proposal not found.');
    if (row.status!==state) throw Error(row.status==='pending'
      ?'Conflict: the article has changed since this proposal. Review the current version and submit a fresh amendment.'
      :'Conflict: this proposal has already been decided.');
    return {...draftSummary(row),decided_at:row.decided_at,decided_by:row.decided_by,
      ...(decision==='approve'?{version:row.expected_version+1,article_url:path(row.article_id),archived:unpack(row).archived}:{})};
  }
  async function proposal(id) {
    knowledgeId.parse(id);
    const row=await pending(id);
    if (!row) throw Error('Proposal not found.');
    const live=await current(row.article_id);
    return {proposal:unpack(row), current:live?unpack(live):null};
  }
  async function proposals() {
    const {results}=await sql(`SELECT id,article_id,expected_version,proposed_by,proposed_at,status,
      json_extract(content,'$.title') AS title FROM knowledge_proposals
      WHERE owner_id=?1 AND status='pending' ORDER BY proposed_at DESC,id`).all();
    return results;
  }
  async function categories() {
    const {results}=await sql(`SELECT DISTINCT json_extract(content,'$.category') AS category
      FROM knowledge_current WHERE owner_id=?1 ORDER BY category COLLATE NOCASE`).all();
    return results.map(row=>row.category);
  }
  async function exportAll() {
    const [revisions, audit]=await db.batch([
      sql(historyQuery+' ORDER BY r.article_id,r.version'),
      sql(`SELECT id,article_id,expected_version,reason,proposed_by,proposed_at,status,decided_by,decided_at
        FROM knowledge_proposals WHERE owner_id=?1 ORDER BY proposed_at,id`)
    ]);
    return {revisions:revisions.results.map(unpack),audit:audit.results};
  }
  return {search,get,propose,decide,proposal,proposals,categories,exportAll};
}

export async function knowledgeBrowserAction(store, method, url, input, owner) {
  const route=url.pathname.slice('/api/knowledge/'.length);
  const params=Object.fromEntries(url.searchParams);
  if (method==='GET') {
    if (route==='search') return store.search(params);
    if (route==='article') return store.get(params.id);
    if (route==='queue') return store.proposals();
    if (route==='proposal') return store.proposal(params.id);
    if (route==='categories') return store.categories();
    if (route==='export') return store.exportAll();
  }
  if (method==='POST' && route==='propose') return store.propose(input,{actor:'GitHub account '+owner});
  if (method==='POST' && route==='decision') return store.decide(input);
  return undefined;
}
