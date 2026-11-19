const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/captain-results/page.tsx','utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function loadFunction(name, context) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found=node.initializer.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast);
  assert.ok(found, name);
  return vm.runInNewContext(ts.transpileModule(`(${found})`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
}
function loadModule(file) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
  return exports;
}
const {validateCompleteLeagueScorecard}=loadModule('src/lib/league-scorecard-validation.ts');
const {matchSubmissionConfirmation}=loadModule('src/lib/match-submission-confirmation.ts');
function harness(overrides={}) {
  const events=[];
  const slots=Array.from({length:5},(_,i)=>({slot_no:i+1,slot_type:i===4?'doubles':'singles',winner_side:i===3?'away':'home',home_points_scored:i===3?30:60,away_points_scored:i===3?60:30}));
  const context={
    submitInFlightRef:{current:false}, saveFrameInFlightRef:{current:false},
    supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}},
    selectedFixture:{id:'fixture',home_team_id:'home',away_team_id:'away',status:'in_progress',fixture_date:'2026-11-19'},
    currentUserId:'scorer',canSubmit:true,scoreEntryTeamIds:new Set(['home']),
    isFixtureOpenForSubmission:()=>true,pendingByFixture:new Set(),guardAgainstRemoteOverwrite:async()=>false,
    slots,deriveWinnerFromFrame:r=>r.winner_side,selectedSeason:{singles_count:4,doubles_count:1},
    validateCompleteLeagueScorecard, setMessage:m=>events.push(['error',m]),
    getValidatedBreakRows:()=>({rows:[],error:null}),breakRowsContainUnsavedDraft:()=>false,fixtureBreaks:[],
    matchSubmissionConfirmation,teamById:new Map([['home',{name:'Greenhithe B'}],['away',{name:'Hartley CC'}]]),playerById:new Map(),
    showConfirm:async options=>{events.push(['confirm',options]);return true;},
    setScorecardReviewMode:v=>events.push(['review',v]),setSubmitting:()=>{},scorecardPhotoUrl:'',
    fetch:async()=>{events.push(['post']);return {ok:true,json:async()=>({})};},
    setPendingByFixture:()=>events.push(['pending']),setInfo:i=>events.push(['success',i]),
    setScorecardPhotoUrl:()=>{},loadAll:async()=>events.push(['reload']),normaliseCaptainApiError:e=>e.message,
    currentScorecardFrame:slots[4],validateFrameCompletion:()=>null,breakPromptAnsweredSlots:new Set([5]),
    setBreakPromptSlotNo:()=>events.push(['break-prompt']),breakRequiredSlotNo:null,configuredAsWinter:true,
    orderedScoreSlots:slots,scorecardCurrentIndex:4,setSavingFrame:()=>{},
    saveProgress:async()=>{events.push(['save']);return {saved:true,allFramesComplete:true,hasUnsavedBreakDraft:false};},
    setScorecardCurrentIndex:()=>events.push(['next']),...overrides,
  };
  context.submit=loadFunction('submit',context);
  return {context,events,finish:loadFunction('saveAndContinueCurrentFrame',context)};
}
test('final frame saves, confirms the 4–1 score, then submits exactly once',async()=>{
 const h=harness();await h.finish();
 assert.deepEqual(h.events.filter(e=>['save','confirm','post','success'].includes(e[0])).map(e=>e[0]),['save','confirm','post','success']);
 assert.match(h.events.find(e=>e[0]==='confirm')[1].description,/Greenhithe B 4–1 Hartley CC/);
 assert.match(h.events.find(e=>e[0]==='success')[1].title,/nothing else to do/);
});
test('cancel leaves saved scores for review and sends no submission',async()=>{
 const h=harness({showConfirm:async()=>false});await h.finish();
 assert.ok(h.events.some(e=>e[0]==='save'));assert.ok(h.events.some(e=>e[0]==='review'));assert.ok(!h.events.some(e=>e[0]==='post'));
});
test('save failure never opens confirmation or submits',async()=>{
 const h=harness({saveProgress:async()=>({saved:false})});await h.finish();assert.equal(h.events.length,0);
});
test('missing doubles and incomplete break drafts cannot submit',async()=>{
 const h=harness();h.context.slots=h.context.slots.slice(0,4);await h.context.submit();assert.ok(h.events.some(e=>e[0]==='error'));assert.ok(!h.events.some(e=>e[0]==='post'));
 const b=harness({breakRowsContainUnsavedDraft:()=>true,unfinishedBreakMessage:'Finish the break'});await b.context.submit();assert.ok(!b.events.some(e=>e[0]==='confirm'));
});
test('failed submission shows error, no success, and can retry',async()=>{
 const h=harness({fetch:async()=>({ok:false,json:async()=>({error:'Connection failed'})})});await h.finish();assert.ok(h.events.some(e=>e[0]==='error'));assert.ok(!h.events.some(e=>e[0]==='success'));assert.equal(h.context.submitInFlightRef.current,false);assert.equal(h.context.saveFrameInFlightRef.current,false);
});
test('double taps while confirmation is open do not submit twice',async()=>{
 let answer;const h=harness({showConfirm:()=>new Promise(r=>answer=r)});const first=h.finish();
 while(!answer) await new Promise(r=>setImmediate(r));
 await h.finish();await h.context.submit();answer(true);await first;
 assert.equal(h.events.filter(e=>e[0]==='post').length,1);
});
test('confirmation lists recorded breaks, and supports a six-singles score',()=>{
 const options=matchSubmissionConfirmation('Home','Away',Array.from({length:6},(_,i)=>({winner_side:i<3?'home':'away'})),[{slot:2,name:'Player A',value:45}]);
 assert.match(options.description,/Home 3–3 Away/);assert.match(options.description,/Frame 2: Player A — 45/);assert.equal(options.cancelLabel,'Go back and check');
});
test('last frame needs only the final confirmation, even with no breaks recorded',async()=>{
 const h=harness({breakPromptAnsweredSlots:new Set()});await h.finish();
 assert.ok(!h.events.some(e=>e[0]==='break-prompt'));assert.equal(h.events.filter(e=>e[0]==='confirm').length,1);
 assert.match(h.events.find(e=>e[0]==='confirm')[1].description,/None recorded/);
});
test('return reminder is rebuilt from saved frames, excluding submitted matches and away-only scorers',()=>{
 const base={myCurrentWeekFixtures:[{id:'f',season_id:'season',home_team_id:'home',away_team_id:'away',status:'in_progress'}],canSubmit:true,pendingByFixture:new Set(),scoreEntryTeamIds:new Set(['home']),seasons:[{id:'season',singles_count:4,doubles_count:1}],allSlots:Array.from({length:5},(_,i)=>({fixture_id:'f',slot_no:i+1,slot_type:i===4?'doubles':'singles',winner_side:'home'})),expectedLeagueScorecardFrames:loadModule('src/lib/league-scorecard-validation.ts').expectedLeagueScorecardFrames};
 assert.equal(loadFunction('unfinishedSubmissions',base).length,1);
 assert.equal(loadFunction('unfinishedSubmissions',{...base,pendingByFixture:new Set(['f'])}).length,0);
 assert.equal(loadFunction('unfinishedSubmissions',{...base,scoreEntryTeamIds:new Set(['away'])}).length,0);
 assert.equal(loadFunction('unfinishedSubmissions',{...base,allSlots:base.allSlots.slice(0,4)}).length,0);
});
