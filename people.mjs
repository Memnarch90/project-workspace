import {z} from 'zod';
import {ukMeetingTime} from './meeting-time.mjs';

export const peoplePrivacy = 'Work-role information only. Do not enter personal details (home address, health, family or personal phone), or employee relations, grievance, disciplinary or case content.';
const id = z.string().min(1).max(100);
const version = z.number().int().positive();
const text = max => z.string().trim().max(max).refine(value => !value.includes('\0'), 'Invalid text.');
const date = z.iso.date();
const types = z.enum(['Internal','External']);
const relationships = z.enum(['Manager','Peer','Data owner','Sponsor','Supplier','Union','Network contact','Other']);
const level = z.enum(['High','Medium','Low']);
const personFields = {
  name: z.string().trim().min(1).max(180).regex(/^[^\r\n\0]+$/, 'Enter a name on one line.'),
  role: text(180), organisation: text(180), type: types, relationship: relationships,
  influence: level, closeness: level, project_ids: z.array(id).max(50),
  next_touchpoint_date: date.nullable(), keep_warm_weeks: z.number().int().min(1).max(520).nullable(),
  notes: text(1000), archived: z.boolean()
};
const personPatch = z.strictObject(personFields).partial();
const interactionFields = {
  date, channel: z.enum(['Teams','Email','Meeting','Call','In person','Other']),
  summary: z.string().trim().min(1).max(300).regex(/^[^\r\n\0]+$/, 'Enter a one-line summary.'),
  i_owe_them: text(500), they_owe_me: text(500),
  project_id: id.nullable(), task_id: id.nullable(), meeting_id: id.nullable(), archived: z.boolean()
};
const interactionPatch = z.strictObject(interactionFields).partial();
const linkRoles = ['waiting_on','assignee'];
export const taskPersonFields = Object.fromEntries(linkRoles.map(role => [role+'_person_id',role]));
export const taskPersonColumns = Object.entries(taskPersonFields).map(([field,role]) =>
  "(SELECT person_id FROM task_people l WHERE l.owner_id=t.owner_id AND l.task_id=t.id AND l.role='"+role+"') AS "+field).join(',');
export const peopleInputs = {
  find_people: z.strictObject({
    query: text(180).optional(), type: types.optional(), relationship: relationships.optional(),
    influence: level.optional(), project_id: id.optional(), due_catch_up: z.boolean().optional(),
    archived: z.boolean().optional(), after_id: id.optional(), limit: z.number().int().min(1).max(50).optional()
  }),
  get_person: z.strictObject({person_id:id, limit:z.number().int().min(1).max(50).optional(), offset:z.number().int().nonnegative().optional()}),
  create_person: z.strictObject({changes:personPatch.required({name:true,type:true})}),
  update_person: z.strictObject({person_id:id, expected_version:version, changes:personPatch}),
  log_interaction: z.strictObject({person_id:id, changes:interactionPatch.required({date:true,channel:true,summary:true})}),
  update_interaction: z.strictObject({interaction_id:id, expected_version:version, changes:interactionPatch}),
  link_task_person: z.strictObject({task_id:id, expected_version:version, role:z.enum(linkRoles), person_id:id.nullable()}),
  link_meeting_person: z.strictObject({meeting_id:id, expected_version:version, expected_link_version:z.number().int().nonnegative(), participant:text(4000), person_id:id})
};
export const participantKey = value => value.trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-GB');
export const meetingParticipants = value => [...new Map(value.split(/[,;\n]+/u)
  .map(name => [participantKey(name),name.trim()]).filter(([key]) => key)).values()];

export function dueCatchUp(person, last, today) {
  if (person.archived) return false;
  if (person.next_touchpoint_date && person.next_touchpoint_date <= today) return true;
  if (!last || !person.keep_warm_weeks) return false;
  const elapsedDays = (Date.parse(today) - Date.parse(last)) / 86400000;
  return elapsedDays > person.keep_warm_weeks * 7;
}

const unpackPerson = row => ({...row, project_ids:JSON.parse(row.project_ids), archived:Boolean(row.archived)});
const unpackInteraction = row => ({...row, archived:Boolean(row.archived), source:'logged'});
const meetingFrom = `FROM note_meetings m
  JOIN note_pages p ON p.owner_id=m.owner_id AND p.id=m.page_id
  JOIN note_folders s ON s.owner_id=m.owner_id AND s.id=p.section_id
  JOIN note_folders n ON n.owner_id=m.owner_id AND n.id=s.parent_id
  WHERE m.owner_id=?1 AND p.archived=0 AND s.archived=0 AND n.archived=0`;

export function peopleStore(db, owner, notes, today) {
  const select = async (sql,...values) => (await db.prepare(sql).bind(...values).all()).results;
  async function person(id) {
    const row = await db.prepare('SELECT * FROM people WHERE owner_id=? AND id=?').bind(owner,id).first();
    if (!row) throw Error('Person not found.');
    return unpackPerson(row);
  }
  async function active(id) {
    if ((await person(id)).archived) throw Error('Choose an active person.');
  }
  async function project(id) {
    if (id && !await db.prepare('SELECT id FROM projects WHERE owner_id=? AND id=?').bind(owner,id).first()) throw Error('Project not found.');
  }
  const keyForLink = (meeting,key) => JSON.stringify([meeting,key]);

  async function participantResolver({includeArchived=false}={}) {
    const [people, links] = await Promise.all([
      select('SELECT id,name,archived FROM people WHERE owner_id=?',owner),
      select('SELECT meeting_id,participant,person_id,version FROM meeting_people WHERE owner_id=?',owner)
    ]);
    const activeNames = new Map(), archivedNames = new Map();
    const activeIds = new Set(people.filter(p=>!p.archived).map(p=>p.id));
    for (const p of people) {
      const key = participantKey(p.name), names = p.archived?archivedNames:activeNames;
      names.set(key,names.has(key)?null:p.id);
    }
    const mapped = new Map(links.map(l => [keyForLink(l.meeting_id,l.participant),l]));
    return (id,participants) => meetingParticipants(participants).map(name => {
      const key = participantKey(name), explicit = mapped.get(keyForLink(id,key));
      const person_id = explicit ? (includeArchived||activeIds.has(explicit.person_id)?explicit.person_id:null)
        : (activeNames.has(key)?activeNames.get(key):includeArchived?archivedNames.get(key):null)||null;
      return {name,person_id,link_version:explicit?.version??0};
    });
  }

  async function decorateMeetings(items) {
    if (!items.length) return items;
    const resolve = await participantResolver();
    return items.map(m => ({...m, people_participants:resolve(m.id,m.participants)}));
  }

  async function derivedMeetings(personIds) {
    const [resolve, rows] = await Promise.all([
      participantResolver({includeArchived:true}),
      select(`SELECT m.id,m.page_id,m.topic,m.participants,m.meeting_when,m.project_id,
        json_extract(p.doc_json,'$.storage') AS storage,
        json_extract(p.doc_json,'$.content['||m.block_index||'].attrs.timezone') AS timezone
        ${meetingFrom} AND m.participants<>''`,owner)
    ]);
    const matched = rows.map(m => ({...m, person_ids:[...new Set(resolve(m.id,m.participants).map(p=>p.person_id).filter(id=>personIds.has(id)))]}))
      .filter(m => m.person_ids.length);
    const details = [];
    // Keep chunked-page reads sequential so each Worker request uses bounded parallel I/O.
    for (const m of matched) {
      const timezone = m.storage==='chunks-v1' ? (await notes.getMeeting(m.id)).metadata.timezone : m.timezone;
      details.push({
        id:m.id, person_ids:m.person_ids, channel:'Meeting', source:'meeting', summary:m.topic,
        date:ukMeetingTime(m.meeting_when,timezone).slice(0,10), meeting_id:m.id, page_id:m.page_id, project_id:m.project_id
      });
    }
    return details;
  }

  async function find(input={}, {connector=false}={}) {
    const a = peopleInputs.find_people.parse(input), limit = a.limit??50;
    const params = [owner,Number(a.archived??false)];
    const where = ['owner_id=?','archived=?'];
    if (a.after_id) {
      const anchor = await db.prepare('SELECT name FROM people WHERE owner_id=? AND id=?').bind(owner,a.after_id).first();
      if (!anchor) return {items:[],has_more:false,next_after_id:null};
      where.push('(name COLLATE NOCASE,id)>(?,?)');
      params.push(anchor.name,a.after_id);
    }
    for (const field of ['type','relationship','influence']) {
      if (a[field]) { where.push(field+'=?'); params.push(a[field]); }
    }
    if (a.project_id) {
      where.push('EXISTS (SELECT 1 FROM json_each(project_ids) WHERE value=?)');
      params.push(a.project_id);
    }
    let rows = await select('SELECT * FROM people WHERE '+where.join(' AND ')+' ORDER BY name COLLATE NOCASE,id'+
      (a.query||a.due_catch_up!==undefined?'':' LIMIT '+(limit+1)),...params);
    if (a.query) {
      const query = participantKey(a.query);
      rows = rows.filter(p => [p.name,p.role,p.organisation].some(value=>participantKey(value).includes(query)));
    }
    let items = rows.map(unpackPerson);
    if (a.due_catch_up!==undefined && items.length) {
      const day = today();
      const [logged, derived] = await Promise.all([
        select('SELECT person_id,MAX(date) AS date FROM people_interactions WHERE owner_id=? AND archived=0 AND date<=? GROUP BY person_id',owner,day),
        derivedMeetings(new Set(items.map(p=>p.id)))
      ]);
      const latest = new Map(logged.map(r=>[r.person_id,r.date]));
      for (const m of derived) {
        if (m.date > day) continue;
        for (const id of m.person_ids) if (m.date > (latest.get(id)||'')) latest.set(id,m.date);
      }
      items = items.map(p=>({...p,last_interaction_date:latest.get(p.id)||null}))
        .filter(p=>dueCatchUp(p,p.last_interaction_date,day)===a.due_catch_up);
    }
    const has_more = items.length > limit;
    items = items.slice(0,limit);
    const next_after_id=has_more?items.at(-1).id:null;
    if(connector)items=items.map(({notes,...item})=>item);
    return {items,has_more,next_after_id};
  }

  async function get(input,{connector=false}={}) {
    const {person_id,limit=30,offset=0} = peopleInputs.get_person.parse(input);
    const record = await person(person_id);
    const [logged,meetings,tasks] = await Promise.all([
      select('SELECT * FROM people_interactions WHERE owner_id=? AND person_id=? AND archived=0 ORDER BY date DESC,id DESC',owner,person_id),
      derivedMeetings(new Set([person_id])),
      select(`SELECT t.id,t.title,t.version,t.project_id,t.action_status,t.due_date,l.role
        FROM task_people l JOIN tasks t ON t.owner_id=l.owner_id AND t.id=l.task_id
        WHERE l.owner_id=? AND l.person_id=? AND t.done=0 AND t.archived=0 ORDER BY t.title,t.id,l.role`,owner,person_id)
    ]);
    const timeline = [...logged.map(unpackInteraction),...meetings.filter(m=>m.person_ids.includes(person_id)).map(({person_ids,...m})=>
      connector?{...m,summary:'Meeting Journal entry'}:m)]
      .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)||a.source.localeCompare(b.source));
    const open_tasks = [...Map.groupBy(tasks,t=>t.id).values()].map(rows=>{
      const {role,...task}=rows[0];
      return {...task,roles:rows.map(row=>row.role)};
    });
    const commitments=logged.filter(i=>i.i_owe_them||i.they_owe_me).map(unpackInteraction);
    const next_offset=offset+limit < timeline.length ? offset+limit : null;
    return {person:record,interactions:timeline.slice(offset,offset+limit),next_offset,open_tasks,...(connector?{}:{commitments})};
  }

  function recordStatement(table,after,before) {
    const data = {...after};
    if ('archived' in data) data.archived = Number(data.archived);
    if ('project_ids' in data) data.project_ids = JSON.stringify(data.project_ids);
    if (!before) {
      const keys = Object.keys(data);
      return db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...Object.values(data));
    }
    const {owner_id,id,version,...fields} = data;
    return db.prepare(`UPDATE ${table} SET ${Object.keys(fields).map(key=>key+'=?').join(',')},
      version=CASE WHEN version=? THEN ? ELSE NULL END WHERE owner_id=? AND id=?`)
      .bind(...Object.values(fields),before.version,version,owner_id,id);
  }

  async function prepareWrite(kind,input,at) {
    const a = peopleInputs[kind].parse(input);
    if (a.changes && !Object.keys(a.changes).length) throw Error('Provide changed fields.');
    let before=null, after, entity, stmt;
    if (kind==='create_person'||kind==='update_person') {
      entity='person';
      if (kind==='update_person') {
        before=await person(a.person_id);
        if (before.version!==a.expected_version) throw Error('Conflict: person changed. Read it again before saving.');
      }
      after={
        owner_id:owner,id:crypto.randomUUID(),role:'',organisation:'',relationship:'Other',
        influence:'Medium',closeness:'Medium',project_ids:[],next_touchpoint_date:null,keep_warm_weeks:null,
        notes:'',archived:false,created_at:at,...before,...a.changes,version:(before?.version??0)+1,updated_at:at
      };
      after.project_ids=[...new Set(after.project_ids)];
      for (const id of after.project_ids) await project(id);
      stmt=recordStatement('people',after,before);
    } else if (kind==='link_meeting_person') {
      entity='meeting_person';
      const key=participantKey(a.participant);
      const row=await db.prepare(`SELECT p.version,m.participants ${meetingFrom} AND m.id=?2`).bind(owner,a.meeting_id).first();
      if (!row || row.version!==a.expected_version || !meetingParticipants(row.participants).some(name=>participantKey(name)===key)) {
        throw Error('Conflict: meeting participant changed. Refresh the journal.');
      }
      await active(a.person_id);
      before=await db.prepare('SELECT * FROM meeting_people WHERE owner_id=? AND meeting_id=? AND participant=?').bind(owner,a.meeting_id,key).first();
      if ((before?.version??0)!==a.expected_link_version) throw Error('Conflict: participant link changed. Refresh the journal.');
      after={owner_id:owner,meeting_id:a.meeting_id,participant:key,person_id:a.person_id,version:(before?.version??0)+1};
      stmt=db.prepare(`INSERT INTO meeting_people(owner_id,meeting_id,participant,person_id,version)
        VALUES(?1,?2,?3,CASE WHEN EXISTS(SELECT 1 FROM people WHERE owner_id=?1 AND id=?4 AND archived=0)
          AND EXISTS(SELECT 1 ${meetingFrom} AND m.id=?2 AND p.version=?6) THEN ?4 ELSE NULL END,?5)
        ON CONFLICT(owner_id,meeting_id,participant) DO UPDATE SET person_id=excluded.person_id,
        version=CASE WHEN meeting_people.version=?7 THEN excluded.version ELSE NULL END`)
        .bind(owner,a.meeting_id,key,a.person_id,after.version,a.expected_version,before?.version??0);
    } else {
      entity='interaction';
      if (kind==='update_interaction') {
        const row=await db.prepare('SELECT * FROM people_interactions WHERE owner_id=? AND id=?').bind(owner,a.interaction_id).first();
        if (!row) throw Error('Interaction not found.');
        before={...row,archived:Boolean(row.archived)};
        if (before.version!==a.expected_version) throw Error('Conflict: interaction changed. Read it again before saving.');
      } else await active(a.person_id);
      after={
        owner_id:owner,id:crypto.randomUUID(),person_id:a.person_id,
        i_owe_them:'',they_owe_me:'',project_id:null,task_id:null,meeting_id:null,archived:false,
        ...before,...a.changes,version:(before?.version??0)+1
      };
      await project(after.project_id);
      if (after.task_id && !await db.prepare('SELECT id FROM tasks WHERE owner_id=? AND id=?').bind(owner,after.task_id).first()) throw Error('Task not found.');
      if (after.meeting_id && after.meeting_id!==before?.meeting_id) await notes.getMeeting(after.meeting_id);
      stmt=recordStatement('people_interactions',after,before);
    }
    return {before,after,entity,stmt};
  }

  return {find,get,person,active,prepareWrite,decorateMeetings};
}

export function peopleBrowserRead(service,url) {
  const p=Object.fromEntries(url.searchParams);
  if (url.pathname==='/api/people') {
    for (const key of ['due_catch_up','archived']) if (key in p) {
      if (!['true','false'].includes(p[key])) throw Error('Invalid People filter.');
      p[key]=p[key]==='true';
    }
    if ('limit' in p) p.limit=Number(p.limit);
    return service.people.find(p);
  }
  if (url.pathname==='/api/person') {
    for (const key of ['limit','offset']) if (key in p) p[key]=Number(p[key]);
    return service.people.get(p);
  }
}
