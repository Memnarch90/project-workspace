import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {EditorState,NodeSelection,TextSelection} from '@tiptap/pm/state';
import {meetingFoldRanges,reconcileMeetingFolds} from '../meeting-folds.mjs';

const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'text*'},text:{group:'inline'},meetingMeta:{group:'block',atom:true,attrs:{meeting_id:{default:null}}},screenshot:{group:'block',atom:true}}});
const p=text=>schema.node('paragraph',null,schema.text(text)),m=id=>schema.node('meetingMeta',{meeting_id:id});
const fixture=()=>EditorState.create({schema,doc:schema.node('doc',null,[p('Introduction'),m('one'),p('First body'),m('two'),p('Second body'),m('three'),p('Third body'),schema.node('screenshot')])});
const reconcile=(ids,old,tr)=>reconcileMeetingFolds(new Set(ids),old,old.apply(tr),[tr],'legacy');

test('Selecting a second meeting header does not reopen the collapsed first meeting',()=>{
 const state=fixture(),ranges=meetingFoldRanges(state.doc,'legacy'),original=state.doc.toJSON();
 const tr=state.tr.setSelection(NodeSelection.create(state.doc,ranges[1].from));
 assert.deepEqual([...reconcile(['one'],state,tr)],['one']);
 assert.deepEqual([...reconcile(['one','two'],state,tr)],['one','two']);
 assert.equal(ranges[0].to,ranges[1].from);
 assert.deepEqual(state.doc.toJSON(),original);
});

test('Entering a hidden meeting opens only that meeting; explicit controls preserve every other fold',()=>{
 const state=fixture(),ranges=meetingFoldRanges(state.doc,'legacy');
 const enter=state.tr.setSelection(TextSelection.create(state.doc,ranges[1].bodyFrom+1));
 assert.deepEqual([...reconcile(['one','two','three'],state,enter)],['one','three']);
 assert.deepEqual([...reconcile(['one','two','three'],state,enter.setMeta('meeting-folds',true))],['one','two','three']);
});

test('Typing outside folded meetings preserves folds; editing a hidden body opens only its own fold',()=>{
 const state=fixture(),ranges=meetingFoldRanges(state.doc,'legacy');
 const before=state.tr.insertText('Added ',1);before.setSelection(TextSelection.create(before.doc,7));
 assert.deepEqual([...reconcile(['one','two','three'],state,before)],['one','two','three']);
 const edit=state.tr.insertText('Added ',ranges[1].bodyFrom+1);
 assert.deepEqual([...reconcile(['one','two','three'],state,edit)],['one','three']);
});

test('Deleted meeting IDs are removed without reopening surviving folds; legacy first anchors are supported',()=>{
 const state=fixture(),ranges=meetingFoldRanges(state.doc,'legacy');
 const tr=state.tr.delete(ranges[1].from,ranges[1].to);tr.setSelection(NodeSelection.create(tr.doc,ranges[0].from));
 assert.deepEqual([...reconcile(['one','two','three'],state,tr)],['one','three']);
 const legacy=schema.node('doc',null,[m(null),p('Legacy notes'),m('second'),p('Later notes')]);
 assert.deepEqual(meetingFoldRanges(legacy,'legacy-page').map(r=>r.id),['legacy-page','second']);
});
