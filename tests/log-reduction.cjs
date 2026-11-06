const {test}=require('node:test'); const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require(process.cwd()+'/node_modules/typescript');const Module=require('node:module');
function load(file){const m=new Module(process.cwd()+'/'+file,module);m.filename=process.cwd()+'/'+file;m.paths=Module._nodeModulePaths(process.cwd());m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.filename);return m.exports;}
const {startVisiblePolling}=load('src/lib/visible-polling.ts');
test('polling pauses hidden screens, resumes immediately, prevents overlap and cleans up',async()=>{
 let tick,visible,clear=false,removed=false,resolve,calls=0;
 global.window={setInterval:fn=>(tick=fn,7),clearInterval:id=>{assert.equal(id,7);clear=true;}};
 global.document={visibilityState:'hidden',addEventListener:(n,fn)=>visible=fn,removeEventListener:(n,fn)=>{assert.equal(fn,visible);removed=true;}};
 const stop=startVisiblePolling(()=>{calls++;return new Promise(r=>resolve=r)},10000);
 assert.equal(calls,0);tick();assert.equal(calls,0);document.visibilityState='visible';visible();assert.equal(calls,1);tick();assert.equal(calls,1);resolve();await Promise.resolve();tick();assert.equal(calls,2);stop();resolve();await Promise.resolve();tick();assert.equal(calls,2);assert.ok(clear&&removed);
});
const {createOptionalRequestFetch}=load('src/lib/optional-request-fetch.ts');
test('confirmed absent optional reads are skipped, supported reads and all writes pass through',async()=>{
 global.window={};let discovery=0,requests=[];
 const base=async(input,init)=>{if(input==='/api/public/request-capabilities'){discovery++;return Response.json({admin_requests:false,profile_merge_requests:true});}requests.push([input,init]);return Response.json({error:'real error'},{status:403});};
 const wrapped=createOptionalRequestFetch(base,'https://example.supabase.co');
 const responses=await Promise.all([wrapped('https://example.supabase.co/rest/v1/admin_requests'),wrapped('https://example.supabase.co/rest/v1/admin_requests',{method:'HEAD'})]);
 assert.deepEqual(await responses[0].json(),[]);assert.equal(responses[1].headers.get('content-range'),'*/0');assert.equal(discovery,1);assert.equal(requests.length,0);
 for(const [url,init] of [['admin_requests',{method:'POST',body:'{}'}],['profile_merge_requests',{}],['players',{}]]) assert.equal((await wrapped('https://example.supabase.co/rest/v1/'+url,init)).status,403);
 assert.equal(requests.length,3);
});
test('discovery failure preserves real request and error rather than inventing empty data',async()=>{global.window={};let n=0;const old=console.warn;console.warn=()=>{};try{const f=createOptionalRequestFetch(async input=>{n++;return new Response(null,{status:input==='/api/public/request-capabilities'?503:404});},'https://example.supabase.co');assert.equal((await f('https://example.supabase.co/rest/v1/admin_requests')).status,404);assert.equal(n,2);}finally{console.warn=old;}});
const {publicJson}=load('src/lib/public-response.ts');
test('only successful public payloads receive shared cache headers; errors are never cached',()=>{assert.match(publicJson({season:'A'}).headers.get('cache-control'),/s-maxage=60/);assert.equal(publicJson({error:'failed'},{status:500}).headers.get('cache-control'),'private, no-store');assert.equal(publicJson({error:'failed'}).headers.get('cache-control'),'private, no-store');});
const {staticDisplayRefreshMs}=load('src/lib/visible-polling.ts');
test('static refresh follows Thursday UK evening boundaries in winter and summer',()=>{
 for(const date of ['2026-11-05T18:59:59Z','2026-11-06T00:00:00Z','2026-07-02T17:59:59Z','2026-07-02T23:00:00Z','2026-11-04T20:00:00Z']) assert.equal(staticDisplayRefreshMs(new Date(date)),3600000,date);
 for(const date of ['2026-11-05T19:00:00Z','2026-11-05T23:59:59Z','2026-07-02T18:00:00Z','2026-07-02T22:59:59Z']) assert.equal(staticDisplayRefreshMs(new Date(date)),300000,date);
});
test('dynamic polling adapts to match window without waiting for an hourly timer',async()=>{
 let tick,calls=0,now=0,interval=3600000;const originalNow=Date.now;Date.now=()=>now;
 global.window={setInterval:(fn,ms)=>{assert.equal(ms,60000);tick=fn;return 1;},clearInterval:()=>{}};
 global.document={visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}};
 try {
  const stop=startVisiblePolling(async()=>{calls++},()=>interval);await Promise.resolve();assert.equal(calls,1);
  now=600000;tick();await Promise.resolve();assert.equal(calls,1);
  interval=300000;tick();await Promise.resolve();assert.equal(calls,2);
  now+=60000;tick();await Promise.resolve();assert.equal(calls,2);
  now+=240000;tick();await Promise.resolve();assert.equal(calls,3);
  interval=3600000;now+=300000;tick();await Promise.resolve();assert.equal(calls,3);
  stop();
 } finally {Date.now=originalNow;}
});
