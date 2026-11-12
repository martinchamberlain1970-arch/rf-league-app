const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const m = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/display-page-timing.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({useSyncExternalStore(){}}),m,m.exports);
const parse=m.exports.parseDisplayPageSeconds;
for (const value of ['', '?pageSeconds=0', '?pageSeconds=4', '?pageSeconds=121', '?pageSeconds=no', '?pageSeconds=5.5']) assert.equal(parse(value),null);
for (const value of [5,15,30,120]) assert.equal(parse('?pageSeconds='+value),value);
console.log('PASS: page timing overrides accept only whole seconds from 5 to 120; missing/invalid values preserve defaults.');
