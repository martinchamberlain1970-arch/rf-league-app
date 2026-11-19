const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(file) {
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(process.cwd());
  m.require = name => load(path.resolve(path.dirname(file), name + '.ts'));
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, file);
  return m.exports;
}
const {liveMatchStatus} = load(path.resolve('src/lib/live-match-status.ts'));
const frames = Array.from({length:5}, (_,i) => ({slot_no:i+1,slot_type:i===4?'doubles':'singles',winner_side:'home',home_forfeit:false,away_forfeit:false}));
const base = {approved:false,submitted:false,frames,singles:4,doubles:1,hasSavedScore:true,lineupsSubmitted:true};
test('saved final frame is awaiting submission; submission is awaiting approval', () => {
  assert.equal(liveMatchStatus(base).matchState,'awaiting_submission');
  assert.equal(liveMatchStatus({...base,submitted:true}).matchState,'awaiting_approval');
  assert.equal(liveMatchStatus({...base,submitted:true,approved:true}).matchState,'match_ended');
});
test('missing doubles or unfinished frame must still show in progress', () => {
  assert.equal(liveMatchStatus({...base,frames:frames.slice(0,4)}).matchState,'in_progress');
  assert.equal(liveMatchStatus({...base,frames:frames.map((f,i)=>i===4?{...f,winner_side:null}:f)}).matchState,'in_progress');
});
test('six singles uses its own format and forfeits count as recorded', () => {
  const singles = Array.from({length:6},(_,i)=>({...frames[0],slot_no:i+1}));
  assert.equal(liveMatchStatus({...base,singles:6,doubles:0,frames:singles.slice(0,5)}).matchState,'in_progress');
  singles[5]={...singles[5],winner_side:null,home_forfeit:true};
  assert.equal(liveMatchStatus({...base,singles:6,doubles:0,frames:singles}).matchState,'awaiting_submission');
});
test('unstarted match keeps lineup and score waiting states', () => {
  assert.equal(liveMatchStatus({...base,frames:[],hasSavedScore:false}).matchState,'awaiting_scores');
  assert.equal(liveMatchStatus({...base,frames:[],hasSavedScore:false,lineupsSubmitted:false}).matchState,'awaiting_lineup');
});
