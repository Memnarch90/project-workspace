import {auditSummary} from './audit.mjs';
import {ukToday} from './recurrence.mjs';
const editable=['project_id','workstream_id','date_raised','function','assignee','description','issue_date','likelihood','impact','mitigation','status','comments','reviewed_on','archived'];
export function validateRisk(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Provide risk fields.');
 for(const [key,v] of Object.entries(r)){
  if(!editable.includes(key))throw Error('Risk field cannot be changed: '+key);
  if(['likelihood','impact'].includes(key)){if(v!==null&&(!Number.isInteger(v)||v<1||v>6))throw Error('Likelihood and impact must be 1–6, or blank.');}
  else if(['date_raised','issue_date','reviewed_on'].includes(key)){if(v===null&&key!=='date_raised')continue;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Use a valid YYYY-MM-DD date.');}
  else if(key==='archived'){if(typeof v!=='boolean')throw Error('Archived must be true or false.');}
  else if(key==='status'){if(!['Open','Closed'].includes(v))throw Error('Choose Open or Closed.');}
  else if(key==='workstream_id'&&v===null)continue;
  else{const max=['mitigation','comments'].includes(key)?16000:key==='description'?4000:500;if(typeof v!=='string'||v.length>max||v.includes('\0')||['description','project_id'].includes(key)&&!v.trim())throw Error('Invalid risk '+key+'.');}
 }return r;
}
const enriched=r=>({...r,archived:!!r.archived,severity:r.likelihood&&r.impact?r.likelihood*r.impact:null});
export function riskStore(db,owner,{today=ukToday}={}){
 const raw=async id=>{const r=await db.prepare('SELECT * FROM risks WHERE owner_id=?1 AND id=?2').bind(owner,id).first();if(!r)throw Error('Risk not found.');return r;};
 async function write(kind,input,op,actor){
  if(typeof op!=='string'||op.length<8||op.length>100)throw Error('Invalid operation ID.');
  const patch=validateRisk(input.changes),fingerprint=JSON.stringify([kind,input]);
  const prior=await db.prepare('SELECT * FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(prior){if(prior.fingerprint!==fingerprint)throw Error('Operation ID already used.');return JSON.parse(prior.result_json);}
  const before=kind==='update_risk'?await raw(input.risk_id):null;
  if(before&&(!Number.isInteger(input.expected_version)||before.version!==input.expected_version))throw Error('Conflict: risk changed. Reopen it before saving.');
  const id=before?.id||crypto.randomUUID(),at=new Date().toISOString();
  const after={...(before||{id,owner_id:owner,project_id:null,workstream_id:null,reference:'R-'+id.slice(0,8).toUpperCase(),date_raised:today(),function:'',assignee:'',description:'',issue_date:null,likelihood:null,impact:null,mitigation:'',status:'Open',comments:'',reviewed_on:null,archived:0,version:0}),...patch,version:(before?.version||0)+1,updated_at:at};
  if(!after.description.trim()||!after.project_id)throw Error('Choose a project and enter a risk description.');
  if(!await db.prepare('SELECT id FROM projects WHERE id=?1 AND owner_id=?2').bind(after.project_id,owner).first())throw Error('Project not found.');
  if(after.workstream_id&&!await db.prepare('SELECT id FROM workstreams WHERE id=?1 AND project_id=?2').bind(after.workstream_id,after.project_id).first())throw Error('Workstream does not belong to this project.');
  after.archived=Number(after.archived);const result={entity:'risk',record:enriched(after)},cols=Object.keys(after),stmts=[];
  stmts.push(db.prepare('INSERT INTO operations(owner_id,operation_id,fingerprint,result_json) VALUES(?1,?2,?3,?4)').bind(owner,op,fingerprint,JSON.stringify(result)));
  if(before){const c=cols.filter(k=>!['id','owner_id','version'].includes(k));stmts.push(db.prepare(`UPDATE risks SET ${c.map((k,i)=>k+'=?'+(i+1)).join(',')},version=CASE WHEN version=?${c.length+1} THEN version+1 ELSE NULL END WHERE owner_id=?${c.length+2} AND id=?${c.length+3}`).bind(...c.map(k=>after[k]),before.version,owner,id));}
  else stmts.push(db.prepare(`INSERT INTO risks(${cols.join(',')}) VALUES(${cols.map((_,i)=>'?'+(i+1)).join(',')})`).bind(...cols.map(k=>after[k])));
  stmts.push(db.prepare("INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,before_json,after_json,operation_id) VALUES(?1,'risk',?2,?3,?4,?5,?6,?7,?8)").bind(owner,id,kind,actor,at,before?JSON.stringify(before):null,JSON.stringify(after),op));
  try{await db.batch(stmts);}catch{const retry=await db.prepare('SELECT * FROM operations WHERE owner_id=?1 AND operation_id=?2').bind(owner,op).first();if(retry?.fingerprint===fingerprint)return JSON.parse(retry.result_json);throw Error('Conflict: risk changed. Reopen it before saving.');}return result;
 }
 return {write,get:async id=>{const r=await raw(id);const history=(await db.prepare("SELECT at,action,actor,before_json,after_json FROM audit_events WHERE owner_id=?1 AND entity_type='risk' AND entity_id=?2 ORDER BY seq DESC LIMIT 25").bind(owner,id).all()).results;return {...enriched(r),history:history.map(h=>({at:h.at,action:h.action,actor:h.actor,summary:auditSummary(h)}))};},list:async({project_id,workstream_id,status,archived='0',after_id='',limit=50}={})=>{limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Limit must be 1–50.');if(!['0','1'].includes(String(archived)))throw Error('Invalid archive filter.');const where=['r.owner_id=?','r.archived=?','r.id>?'],args=[owner,Number(archived),after_id];if(project_id){where.push('r.project_id=?');args.push(project_id);}if(workstream_id){where.push('r.workstream_id=?');args.push(workstream_id);}if(status){if(!['Open','Closed'].includes(status))throw Error('Choose Open or Closed.');where.push('r.status=?');args.push(status);}const rows=(await db.prepare(`SELECT r.*,p.name AS project,w.name AS workstream FROM risks r JOIN projects p ON p.id=r.project_id LEFT JOIN workstreams w ON w.id=r.workstream_id WHERE ${where.join(' AND ')} ORDER BY r.id LIMIT ?`).bind(...args,limit+1).all()).results;return {items:rows.slice(0,limit).map(enriched),has_more:rows.length>limit,next_after_id:rows.slice(0,limit).at(-1)?.id||after_id};}};
}
