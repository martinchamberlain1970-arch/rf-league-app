const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');
function load(file){const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(process.cwd());const normal=m.require.bind(m);m.require=n=>n==='./app-roles'?load(process.cwd()+'/src/lib/app-roles.ts'):normal(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {createAdminStatusController}=load(process.cwd()+'/src/lib/admin-status-controller.ts');
const tick=()=>new Promise(r=>setTimeout(r,5));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
test('signed-in identity appears before a slow role check completes',async()=>{
 const role=deferred(),states=[];const c=createAdminStatusController(()=>role.promise,'',s=>states.push(s));
 c.accept({id:'captain'});assert.equal(states.at(-1).userId,'captain');assert.equal(states.at(-1).isAdmin,false);
 await tick();role.resolve('league_secretary');await tick();assert.equal(states.at(-1).canManageLeague,true);c.dispose();
});
test('sign-in after initial anonymous state restores navigation without reload',async()=>{
 const states=[];const c=createAdminStatusController(async()=> 'user','',s=>states.push(s));
 c.accept(null);assert.equal(states.at(-1).userId,null);c.accept({id:'player'});assert.equal(states.at(-1).userId,'player');await tick();c.dispose();
});
test('role failure keeps menu identity and a later retry recovers permissions',async()=>{
 let failed=true;const states=[];const c=createAdminStatusController(async()=>{if(failed)throw Error('offline');return 'admin'},'',s=>states.push(s));
 c.accept({id:'player'});await tick();assert.equal(states.at(-1).userId,'player');assert.equal(states.at(-1).isAdmin,false);
 failed=false;c.accept({id:'player'},true);await tick();assert.equal(states.at(-1).isAdmin,true);c.dispose();
});
test('late role results cannot restore an account after sign-out or account switch',async()=>{
 const role=deferred(),states=[];const c=createAdminStatusController(id=>id==='old'?role.promise:Promise.resolve('user'),'',s=>states.push(s));
 c.accept({id:'old'});await tick();c.accept(null);role.resolve('owner');await tick();assert.equal(states.at(-1).userId,null);assert.equal(states.at(-1).isSuper,false);
 c.accept({id:'new'});await tick();assert.equal(states.at(-1).userId,'new');assert.equal(states.at(-1).isSuper,false);c.dispose();
});
test('token refresh events do not repeat a successful role query; disposal cancels late work',async()=>{
 let reads=0;const states=[];const c=createAdminStatusController(async()=>{reads++;return 'user'},'',s=>states.push(s));
 c.accept({id:'player'});await tick();c.accept({id:'player'});await tick();assert.equal(reads,1);
 c.accept({id:'other'});c.dispose();const count=states.length;await tick();assert.equal(states.length,count);assert.equal(reads,1);
});
