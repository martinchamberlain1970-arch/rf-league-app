const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
function load(path, overrides={}) {
 const m = new Module(path,module); m.filename=path; m.paths=module.paths;
 const base=m.require.bind(m);m.require=id=>id in overrides?overrides[id]:base(id);
 m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path);return m.exports;
}
const helper=load('src/lib/officer-scorecard.ts',{'./league-scorecard-validation':load('src/lib/league-scorecard-validation.ts')});
const frame=()=>({id:'f',fixture_id:'match',slot_no:1,slot_type:'singles',home_player1_id:'h',away_player1_id:'a',home_player2_id:null,away_player2_id:null,home_points_scored:80,away_points_scored:40,winner_side:'home'});
test('valid complete card and blank break rows',()=>assert.deepEqual(helper.validateOfficerScorecard([frame()],[{player_id:null,entered_player_name:'',break_value:''}],1,0),{errors:[],breaks:[]}));
test('all missing and invalid scores collected without silently clamping',()=>{const r=helper.validateOfficerScorecard([{...frame(),home_points_scored:201,away_points_scored:null,home_player1_id:null}],[],1,0);assert.equal(r.errors.length,3);});
test('ties and wrong winner rejected',()=>{for(const f of [{...frame(),away_points_scored:80},{...frame(),winner_side:'away'}])assert.ok(helper.validateOfficerScorecard([f],[],1,0).errors.length);});
test('doubles requires distinct players',()=>assert.ok(helper.validateOfficerScorecard([{...frame(),slot_type:'doubles',home_player2_id:'h',away_player2_id:'b'}],[],0,1).errors.some(e=>e.includes('two different'))));
test('breaks must be valid and belong to player on card with enough points',()=>{for(const b of [{player_id:'h',break_value:90},{player_id:'other',break_value:30},{player_id:'h',break_value:29}]) assert.ok(helper.validateOfficerScorecard([frame()],[{entered_player_name:'',...b}],1,0).errors.length);});
test('nominated player and no-show are supported',()=>{assert.equal(helper.validateOfficerScorecard([{...frame(),home_nominated:true,home_nominated_name:'Known player',home_player1_id:null}],[],1,0).errors.length,0);assert.equal(helper.validateOfficerScorecard([{...frame(),home_forfeit:true,home_player1_id:null,home_points_scored:0,away_points_scored:0,winner_side:'away'}],[],1,0).errors.length,0);});
process.env.NEXT_PUBLIC_OFFICER_SCORECARD_ENABLED='true';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
const {NextRequest}=require('next/server');
function routeHarness({denied=false}={}) {
 let writes=0,recomputes=0;
 const db={auth:{getUser:async()=>({data:{user:{id:'officer'}}})},from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='league_fixtures'?{season_id:'season'}:{singles_count:1,doubles_count:0}})})})}),rpc:async()=>{writes++;return {error:null}}};
 const route=load('src/app/api/league/officer-save-result/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'@/lib/server-role':{requireLeagueManager:async()=>{if(denied)throw Error('denied')}},'@/lib/officer-scorecard':helper,'../recompute-fixture/route':{POST:async()=>{recomputes++;return Response.json({ok:true})}}});
 const request=frames=>new NextRequest('http://localhost/api/league/officer-save-result',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({fixtureId:'match',frames,expectedFrames:[frame()],breaks:[],expectedBreaks:[]})});
 return {route,request,counts:()=>({writes,recomputes})};
}
test('captain cannot use officer endpoint',async()=>{const h=routeHarness({denied:true});assert.equal((await h.route.POST(h.request([frame()]))).status,403);assert.deepEqual(h.counts(),{writes:0,recomputes:0});});
test('invalid card causes no writes or Elo processing',async()=>{const h=routeHarness();assert.equal((await h.route.POST(h.request([{...frame(),home_points_scored:null}]))).status,400);assert.deepEqual(h.counts(),{writes:0,recomputes:0});});
test('complete card performs one transactional save then one rating processing call',async()=>{const h=routeHarness();assert.equal((await h.route.POST(h.request([frame()]))).status,200);assert.deepEqual(h.counts(),{writes:1,recomputes:1});});

test('rollout is disabled until explicitly enabled',async()=>{const h=routeHarness();process.env.NEXT_PUBLIC_OFFICER_SCORECARD_ENABLED='false';try{assert.equal((await h.route.POST(h.request([frame()]))).status,503);assert.deepEqual(h.counts(),{writes:0,recomputes:0});}finally{process.env.NEXT_PUBLIC_OFFICER_SCORECARD_ENABLED='true';}});
