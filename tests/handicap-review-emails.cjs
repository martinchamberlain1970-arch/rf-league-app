const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
function load(path,overrides={}) {
 const m=new Module(path,module);m.filename=path;m.paths=module.paths;
 const base=m.require.bind(m);m.require=(id)=>id in overrides?overrides[id]:base(id);
 m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path);return m.exports;
}
const t=load('src/lib/handicap-review-email-template.ts');
test('start explanations work across zero and for giving handicaps',()=>{
 assert.match(t.startExplanation(12,8),/reduces by 4/);
 assert.match(t.startExplanation(-12,-8),/improves by 4/);
 assert.match(t.startExplanation(4,-4),/reduces by 8/);
 assert.match(t.startExplanation(-4,4),/improves by 8/);
});
test('player preview includes evidence, fallback date, effective date, escaped names',()=>{
 const b=t.exampleHandicapBatch();b.players[0].name='<script>alert(1)</script>';
 const email=t.buildPlayerHandicapEmail(b,'example-player','https://example.invalid');
 assert.match(email.text,/940 → 960/);assert.match(email.text,/Week 12/);assert.match(email.text,/date not yet available/);
 assert.match(email.text,/Effective from/);assert.match(email.html,/&lt;script&gt;/);assert.ok(!email.html.includes('<script>'));
});
test('previous snapshot filters unchanged results and labels rebuilt records',()=>{
 const b=t.exampleHandicapBatch();const prev=structuredClone(b);prev.players[0].rating=940;
 let email=t.buildPlayerHandicapEmail(b,'example-player','https://example.invalid',prev);
 assert.ok(!email.text.includes('Jamie Example'));assert.match(email.text,/was 940/);
 prev.events[0].after=959;
 email=t.buildPlayerHandicapEmail(b,'example-player','https://example.invalid',prev);
 assert.match(email.text,/Revised record/);
});
test('captain summary contains only their team changes',()=>{
 const b=t.exampleHandicapBatch();b.players.push({id:'other',name:'Other Team Player',rating:900,handicap:20});b.changes.push({playerId:'other',before:24,after:20,reason:'Review'});
 const email=t.buildCaptainHandicapEmail(b,'example-team','https://example.invalid');
 assert.match(email.text,/Alex Example: \+12 → \+8/);assert.ok(!email.text.includes('Other Team Player'));
});
test('delivery gates prevent all database and provider access before approval',async()=>{
 let calls=0;
 const w=load('src/lib/handicap-review-emails.ts',{'@/lib/email':{sendNotificationEmail:()=>{calls++;throw Error('must not send');}},'@/lib/handicap-review-email-template':t});
 const before={enabled:process.env.HANDICAP_REVIEW_EMAILS_ENABLED,from:process.env.HANDICAP_REVIEW_EMAILS_FROM};
 try {
  delete process.env.HANDICAP_REVIEW_EMAILS_ENABLED;delete process.env.HANDICAP_REVIEW_EMAILS_FROM;
  assert.deepEqual(await w.deliverHandicapReviewEmails(new Proxy({},{get(){throw Error('must not access database');}})),{enabled:false,sent:0});
  process.env.HANDICAP_REVIEW_EMAILS_ENABLED='true';assert.equal(w.emailDeliveryEnabled(),false);
  process.env.HANDICAP_REVIEW_EMAILS_FROM='invalid';assert.equal(w.emailDeliveryEnabled(),false);
  process.env.HANDICAP_REVIEW_EMAILS_FROM='2026-11-01T00:00:00Z';assert.equal(w.emailDeliveryEnabled(),true);assert.equal(calls,0);
 } finally {for(const [key,val]of Object.entries({HANDICAP_REVIEW_EMAILS_ENABLED:before.enabled,HANDICAP_REVIEW_EMAILS_FROM:before.from})){if(val===undefined)delete process.env[key];else process.env[key]=val;}}
});
if(process.argv.includes('--preview')){
 const b=t.exampleHandicapBatch();const prev=structuredClone(b);prev.players[0].rating=940;prev.events=[];
 const emails=[t.buildPlayerHandicapEmail(b,'example-player','https://example.invalid',prev),t.buildCaptainHandicapEmail(b,'example-team','https://example.invalid')];
 for(let i=0;i<emails.length;i++)fs.writeFileSync(`deliverables/Handicap-${i?'Captain':'Player'}-Email-Example.html`,emails[i].html.replace('<main ','<p style="text-align:center;font-family:Arial;color:#526272">ILLUSTRATIVE EXAMPLE — fictional players and dates — no email sent</p><main '));
}

test('provider requests carry stable idempotency keys (mock transport only)',async()=>{
 const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY,oldSender=process.env.EMAIL_FROM;
 const requests=[];
 try {
  process.env.RESEND_API_KEY='test-only';process.env.EMAIL_FROM='Test <test@example.invalid>';
  global.fetch=async(url,options)=>{requests.push({url,options});return {ok:true};};
  const mail=load('src/lib/email.ts');
  const message={to:'recipient@example.invalid',subject:'Test',text:'Test',idempotencyKey:'handicap-review-test'};
  await mail.sendNotificationEmail(message);await mail.sendNotificationEmail(message);
  assert.equal(requests.length,2);assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);
  assert.equal(requests[0].options.body,requests[1].options.body);
 }finally{global.fetch=oldFetch;for(const [key,val]of Object.entries({RESEND_API_KEY:oldKey,EMAIL_FROM:oldSender})){if(val===undefined)delete process.env[key];else process.env[key]=val;}}
});

test('worker suppresses unregistered, changed-email and stale-handicap recipients; sends eligible recipients',async()=>{
 const old={...process.env};
 try{
  process.env.HANDICAP_REVIEW_EMAILS_ENABLED='true';process.env.HANDICAP_REVIEW_EMAILS_FROM='2026-11-01T00:00:00Z';process.env.NEXT_PUBLIC_SITE_URL='https://example.invalid';
  for(const scenario of ['unregistered','changed-email','stale','eligible']) {
   let sent=0,claimed=false;const updates=[];
   const row={id:'row',kind:'player',player_id:'p',batch_id:'b',team_id:null,expected_handicaps:{p:8},recipient:scenario==='changed-email'?'old@example.invalid':null,recipient_user_id:'u',payload:{subject:'Subject',text:'Body',html:'<p>Body</p>'}};
   const db={
    rpc:async()=>({data:claimed?[]:(claimed=true,[row]),error:null}),
    auth:{admin:{getUserById:async()=>({data:{user:{id:'u',email:'current@example.invalid',email_confirmed_at:'2026-01-01'}},error:null})}},
    from(table){let fields='',update;const q={select(x){fields=x;return q;},eq(){return q;},gte(){return q;},is(){return q;},order(){return q;},limit(){return q;},in(){return q;},maybeSingle(){return q;},update(x){update=x;return q;},then(resolve){
     if(update){updates.push(update);return Promise.resolve({data:null,error:null}).then(resolve);}
     const data=table==='handicap_email_batches'?[]:fields.includes('snooker_handicap')?[{id:'p',snooker_handicap:scenario==='stale'?12:8,is_archived:false}]:{claimed_by:scenario==='unregistered'?null:'u',is_archived:false};
     return Promise.resolve({data,error:null}).then(resolve);
    }};return q;}
   };
   const worker=load('src/lib/handicap-review-emails.ts',{'@/lib/email':{notificationEmailIsConfigured:()=>true,sendNotificationEmail:async()=>{sent++;return {sent:true};}},'@/lib/handicap-review-email-template':t});
   const result=await worker.deliverHandicapReviewEmails(db);
   assert.equal(sent,scenario==='eligible'?1:0,scenario);assert.equal(result.skipped,scenario==='eligible'?0:1,scenario);
   assert.ok(updates.some(u=>u.status===(scenario==='eligible'?'sent':'skipped')));
  }
 } finally {for(const key of ['HANDICAP_REVIEW_EMAILS_ENABLED','HANDICAP_REVIEW_EMAILS_FROM','NEXT_PUBLIC_SITE_URL']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
