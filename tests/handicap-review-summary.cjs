const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');
const m=new Module('summary',module);m._compile(ts.transpileModule(fs.readFileSync('src/lib/handicap-review-summary.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'summary');
const {buildHandicapReviewSummary:build}=m.exports;
const fixtures=[{week_no:8,fixture_date:'2026-10-29',status:'complete'},{week_no:12,fixture_date:'2026-12-03',status:'pending'},{week_no:12,fixture_date:'2026-12-10',status:'pending'}];
const reviews=[{week_no:8,completed_at:'2026-10-30T13:21:02Z',changed_player_count:32}];
test('recorded completion and next date reflect latest fixture including postponement',()=>{const r=build(8,fixtures,reviews);assert.equal(r.reportReview.changed_player_count,32);assert.deepEqual(r.nextReview,{week:12,date:'2026-12-10',outstanding:2});});
test('completed fixtures alone do not imply review completed',()=>{const r=build(8,fixtures,[]);assert.equal(r.reportReview,null);assert.equal(r.nextReview.week,8);assert.equal(r.nextReview.outstanding,0);});
test('ordinary week is Elo only; historical report retains its review',()=>{assert.equal(build(7,fixtures,reviews).reportReviewDue,false);assert.equal(build(8,fixtures,[...reviews,{week_no:12,completed_at:'2026-12-11',changed_player_count:0}]).reportReview.week_no,8);});
test('no future fixture schedule does not invent a date',()=>assert.equal(build(8,fixtures.filter(f=>f.week_no===8),reviews).nextReview,null));
