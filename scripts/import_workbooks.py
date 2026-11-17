"""Read originals, reconcile locally, and prepare an explicit, repeat-safe migration.

Real data is written only under the selected output directory (specified with --out).
This script never contacts a network or modifies a source workbook.
"""
import argparse
from contextlib import closing
from collections import Counter
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {'Not Started', 'In Progress', 'Waiting', 'Blocked', 'Completed'}
def normal(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).strip().casefold().split())
def stable_id(prefix, value):
    return prefix + hashlib.sha256(value.encode()).hexdigest()[:20]
def encode(value):
    if isinstance(value, (datetime, date)): return value.isoformat()
    return value
def dump(value): return json.dumps(value, ensure_ascii=False, default=encode, sort_keys=True)
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
def as_date(value, field, flags, timestamp=False):
    if value in (None, ''): return None
    if isinstance(value, datetime): return value.isoformat() if timestamp else value.date().isoformat()
    if isinstance(value, date): return value.isoformat()
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed.isoformat() if timestamp else parsed.date().isoformat()
    except ValueError:
        flags.append(f'{field}: source value retained for review; no date inferred')
        return None

def prepare(manager, plan, out, owner):
    manager, plan, out = Path(manager), Path(plan), Path(out)
    paths = [manager, plan]
    hashes = {p.name: digest(p) for p in paths}
    out.mkdir(parents=True, exist_ok=True)
    dbpath = out / 'workspace.sqlite3'
    if dbpath.exists():
        with closing(sqlite3.connect(dbpath)) as db:
            known = {r[0] for r in db.execute('SELECT sha256 FROM source_files')}
        if known == set(hashes.values()):
            report = json.loads((out / 'import-report.json').read_text(encoding='utf-8'))
            report['repeat_import'] = 'No changes: identical source hashes already staged.'
            return report
        raise ValueError('Different source revision: use a NEW output directory. Existing records will not be overwritten.')
    now = datetime.now(timezone.utc).isoformat()
    w = load_workbook(manager, read_only=True, data_only=True)
    sheet = w['Tasks']
    header_row = next((i for i, row in enumerate(sheet.iter_rows(max_row=30, values_only=True), 1)
                       if 'Task ID' in row and 'Task' in row), None)
    if header_row is None: raise ValueError('Tasks headers not found.')
    headers = list(next(sheet.iter_rows(min_row=header_row, max_row=header_row, values_only=True)))
    records = [(i, dict(zip(headers, row))) for i, row in enumerate(sheet.iter_rows(min_row=header_row+1,values_only=True),header_row+1)
               if row[headers.index('Task')] not in (None,'')]
    ids = [str(r.get('Task ID') or '') for _,r in records]
    if '' in ids or len(ids)!=len(set(ids)): raise ValueError('Missing/duplicate Task IDs. Resolve before import.')
    db = sqlite3.connect(dbpath)
    db.row_factory = sqlite3.Row
    try:
        db.executescript((ROOT/'schema.sql').read_text(encoding='utf-8'))
        with db:
            for path in paths: db.execute('INSERT INTO source_files VALUES(?,?,?)',(hashes[path.name],path.name,now))
            project_names = {str(r['Project']).strip() for _,r in records if r.get('Project')}
            if 'Settings' in w:
                settings = w['Settings']
                for row in settings.iter_rows(min_row=6,max_row=205,min_col=1,max_col=1,values_only=True):
                    if row[0] and isinstance(row[0],str) and not row[0].startswith('='): project_names.add(row[0].strip())
            projects={name:stable_id('p-',owner+'|'+normal(name)) for name in project_names}
            for name,pid in sorted(projects.items()): db.execute('INSERT INTO projects(id,owner_id,name) VALUES(?,?,?)',(pid,owner,name))
            source_lookup, title_lookup = {}, {}
            for rowno, raw in records:
                flags=[]; project=str(raw.get('Project') or '').strip(); category=str(raw.get('Category') or '').strip()
                pid=projects.get(project); sid=stable_id('s-',str(pid)+'|'+normal(category)) if pid and category else None
                if sid: db.execute('INSERT OR IGNORE INTO workstreams VALUES(?,?,?)',(sid,pid,category))
                kind=raw.get('Item Type')
                if kind not in ('Task','Milestone'): flags.append('Item Type missing/unknown: Task used for display; source retained');kind='Task'
                status=raw.get('Action Status')
                if status not in STATUSES: flags.append('Action Status missing/unknown: Not Started used; source retained');status='Not Started'
                done=raw.get('Done') is True
                if done != (status=='Completed'): flags.append('Done and Action Status disagree: retained separately')
                priority=str(raw.get('Priority') or '')
                if priority not in ('','High','Medium','Low'): flags.append('Unknown priority retained in source');priority=''
                values={'id':str(raw['Task ID']),'owner_id':owner,'project_id':pid,'workstream_id':sid,
                        'title':str(raw['Task']).strip(),'item_type':kind,'action_status':status,'done':int(done),
                        'previous_action_status':raw.get('Previous Action Status') if raw.get('Previous Action Status') in STATUSES else 'Not Started',
                        'priority':priority,'waiting_on':str(raw.get('Waiting On') or ''),'notes':str(raw.get('Notes') or ''),
                        'assignee':str(raw.get('Owner') or ''),'department':str(raw.get('Department') or ''),'updated_at':now}
                for field,label,stamp in [('due_date','Due Date',False),('follow_up_date','Follow-up Date',False),('start_date','Start Date',False),('created_on','Created On',True),('completed_on','Completed On',True)]:
                    values[field]=as_date(raw.get(label),label,flags,stamp)
                # No deadline is invented or treated as actual completion; blanks remain null.
                values['review_flags']=dump(flags)
                db.execute(f"INSERT INTO tasks({','.join(values)}) VALUES({','.join('?' for _ in values)})",list(values.values()))
                db.execute('INSERT INTO source_records VALUES(?,?,?,?,?,?)',(hashes[manager.name],'Tasks',rowno,values['id'],dump(raw),'primary'))
                db.execute('INSERT INTO audit_events(owner_id,entity_type,entity_id,action,actor,at,before_json,after_json,operation_id) VALUES(?,?,?,?,?,?,?,?,?)',
                           (owner,'task',values['id'],'imported','local-workbook-import',now,None,dump(values),'import-'+hashes[manager.name]))
                source_sheet=str(raw.get('Source Sheet') or '')
                source_row=raw.get('Source Row')
                if normal(project)=='wellbeing' and source_sheet and source_row:
                    source_lookup[(normal(source_sheet),int(source_row))]=values['id']
                title_lookup.setdefault((normal(project),normal(category),normal(values['title'])),[]).append(values['id'])
            w.close()
            plan_book=load_workbook(plan,read_only=True,data_only=True)
            plan_counts=Counter(); conflicts=[]
            for s in plan_book:
                if s.title in ('Lists',): continue
                if s.title=='Risk log':
                    for rowno,row in enumerate(s.iter_rows(values_only=True),1):
                        if any(v is not None for v in row):
                            db.execute('INSERT INTO source_records VALUES(?,?,?,?,?,?)',(hashes[plan.name],s.title,rowno,None,dump(list(row)),'reference-risk-log'))
                    continue
                h=list(next(s.iter_rows(min_row=2,max_row=2,max_col=8,values_only=True)))
                if h[0]!='Action': continue
                for rowno,row in enumerate(s.iter_rows(min_row=3,max_col=8,values_only=True),3):
                    if not row[0]: continue
                    raw=dict(zip(h,row));title=str(row[0]).strip()
                    if re.fullmatch(r'(task|milestone)\s*\d*',title,re.I):
                        plan_counts['template_rows_excluded']+=1;continue
                    matches=title_lookup.get(('wellbeing',normal(s.title),normal(title)),[])
                    match=matches[0] if len(matches)==1 else None
                    candidate=source_lookup.get((normal(s.title),rowno))
                    if not match and candidate:
                        candidate_title=db.execute('SELECT title FROM tasks WHERE id=?',(candidate,)).fetchone()[0]
                        if normal(candidate_title)==normal(title):match=candidate
                    disposition='linked-reference' if match else 'unmatched-plan-row-review'
                    if not match and candidate:
                        conflicts.append({'possible_task_id':candidate,'sheet':s.title,'row':rowno,'resolution':'Title differs at original source row: no link assumed; review required'})
                    if match:
                        task=db.execute('SELECT title,action_status,done FROM tasks WHERE id=?',(match,)).fetchone()
                        plan_status={'complete':'Completed','in progress':'In Progress','not started':'Not Started','on hold':'Waiting'}.get(normal(raw.get('Status')))
                        if normal(task['title'])!=normal(title) or (plan_status and task['action_status']!=plan_status):
                            conflicts.append({'task_id':match,'sheet':s.title,'row':rowno,'resolution':'Primary task-manager values retained; plan reference preserved'})
                    db.execute('INSERT INTO source_records VALUES(?,?,?,?,?,?)',(hashes[plan.name],s.title,rowno,match,dump(raw),disposition))
                    plan_counts[disposition]+=1
            plan_book.close()
        tasks=db.execute('SELECT * FROM tasks').fetchall()
        report={'prepared_at':now,'cloud_upload':'NOT PERFORMED','source_hashes':hashes,'tasks':len(tasks),
                'projects_with_tasks':db.execute('SELECT COUNT(DISTINCT project_id) FROM tasks').fetchone()[0],
                'projects_including_empty':len(projects),'milestones':sum(t['item_type']=='Milestone' for t in tasks),
                'done':sum(t['done'] for t in tasks),'by_action_status':dict(Counter(t['action_status'] for t in tasks)),
                'tasks_with_review_flags':sum(t['review_flags']!='[]' for t in tasks),'plan_reconciliation':dict(plan_counts),
                'source_conflicts':conflicts,'source_originals_unchanged':all(digest(p)==hashes[p.name] for p in paths),
                'database':str(dbpath),'assumptions':['Task manager is primary; plan references never overwrite it.',
                'Unmatched plan rows are retained for review, not automatically added.',
                'Unknown item type defaults to Task and is flagged.',
                'Project default Active means workspace organisation, not sponsor approval.',
                'Completion dates are not inferred from due dates.','No dependencies or milestone-task links invented.']}
        (out/'import-report.json').write_text(dump(report),encoding='utf-8')
        return report
    except Exception:
        db.close()
        dbpath.unlink(missing_ok=True)
        raise
    finally: db.close()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--manager', required=True)
    p.add_argument('--plan')
    p.add_argument('--out', required=True)
    p.add_argument('--owner',default='local-owner')
    a=p.parse_args()
    print(dump(prepare(a.manager,a.plan,a.out,a.owner)))
