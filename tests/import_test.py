"""Synthetic import regression; no real workbooks are read."""
import importlib.util
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from openpyxl import Workbook
module_path=Path(__file__).resolve().parents[1]/'scripts'/'import_workbooks.py'
spec=importlib.util.spec_from_file_location('importer',module_path);imp=importlib.util.module_from_spec(spec);spec.loader.exec_module(imp)

class ImportTest(unittest.TestCase):
    def test_provenance_idempotence_and_unknown_completion(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);manager=root/'manager.xlsm';plan=root/'plan.xlsx'
            w=Workbook();s=w.active;s.title='Tasks';s.append(['Task ID','Task','Project','Category','Done','Action Status','Item Type','Due Date','Completed On','Notes','Source Sheet','Source Row'])
            s.append(['T-1','Synthetic task','Wellbeing','AMC',True,'Completed','Task',None,'Not recorded','Keep note','AMC',3]);w.save(manager);w.close()
            w=Workbook();s=w.active;s.title='AMC';s.append(['Project']);s.append(['Action','Task/ Milestone','Department','Owner','Status','Notes','Start date','End date']);s.append(['Synthetic task','Task','','','Not started','','','']);s.append(['Do not duplicate by row','Task','','','Not started','','','']);w.save(plan);w.close()
            before=(imp.digest(manager),imp.digest(plan));report=imp.prepare(manager,plan,root/'out','owner')
            self.assertEqual(report['tasks'],1);self.assertTrue(report['source_originals_unchanged']);self.assertEqual(report['plan_reconciliation']['unmatched-plan-row-review'],1)
            with closing(sqlite3.connect(root/'out'/'workspace.sqlite3')) as db, db:
                row=db.execute('SELECT completed_on,notes FROM tasks').fetchone();self.assertIsNone(row[0]);self.assertEqual(row[1],'Keep note')
                db.execute("UPDATE tasks SET notes='A later app edit'")
            again=imp.prepare(manager,plan,root/'out','owner');self.assertIn('No changes',again['repeat_import'])
            with closing(sqlite3.connect(root/'out'/'workspace.sqlite3')) as db, db:self.assertEqual(db.execute('SELECT notes FROM tasks').fetchone()[0],'A later app edit')
            self.assertEqual(before,(imp.digest(manager),imp.digest(plan)))
            w=Workbook();w.active.append(['Changed']);w.save(plan);w.close()
            with self.assertRaisesRegex(ValueError,'NEW output directory'):imp.prepare(manager,plan,root/'out','owner')

if __name__=='__main__':unittest.main()
