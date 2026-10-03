import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../src/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'bin/agent-role-contracts.mjs');
const run=(entry,args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:10000});
const commands=['lifecycle-describe','lifecycle'];
const args=(cmd,paths)=>[cmd,'--bundle',paths[0],'--task',paths[1],'--action',paths[2],'--lifecycle',paths[3]];
function sandbox(t,patched=true) {
 const dir=mkdtempSync(join(tmpdir(),'arc-lifecycle-cli-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(join(dir,'bin'));mkdirSync(join(dir,'src'));
 cpSync(cli,join(dir,'bin/agent-role-contracts.mjs'));
 for(const name of readdirSync(join(root,'src')))if(name.endsWith('.mjs')&&!/finance|safe/.test(name)&&name!=='index.mjs'&&name!=='schemas.generated.mjs')cpSync(join(root,'src',name),join(dir,'src',name));
 writeFileSync(join(dir,'src/finance-profile.mjs'),"throw Error('FINANCE_IMPORT_TRIGGERED');\n");
 if(patched) {
  // Replace only the disposable core entrypoint; no production API is mocked in place.
  let source=readFileSync(join(dir,'src/core.mjs'),'utf8').replace(/^export .*\b(?:describeTaskLifecycle|validateTaskLifecycle)\b.*;$/gm,'');
  source+=`
export async function describeTaskLifecycle(...args) { return lifecycleReport('lifecycle-describe',args); }
export async function validateTaskLifecycle(...args) { return lifecycleReport('lifecycle',args); }
async function lifecycleReport(kind,args) {
 await Promise.resolve();
 if(args.length!==4||args.some((s,i)=>typeof s!=='string'||JSON.parse(s).slot!==i))throw Error('ARGUMENT_ORDER');
 const input=JSON.parse(args[3]),valid=!input.invalid;
 return {valid,kind,execution_authorized:false,task_id:'task-1',action_id:'action-1',run_id:input.run_id||'run-1',current_subject_digest:'sha256:current',declared_subject_digest:'sha256:declared',event_count:2,declared_phases:['review','execution'],artifact_count:1,...(input.absent?{}:{lifecycle_matches_subject:valid,artifact_identity_consistent:valid}),errors:valid?[]:[{code:'LIFECYCLE_INVALID',path:'lifecycle',message:'Invalid declaration'}]};
}
`;
  writeFileSync(join(dir,'src/core.mjs'),source);
 }
 const paths=Array.from({length:4},(_,slot)=>{const p=join(dir,`input ${slot}.json`);writeFileSync(p,JSON.stringify({slot}));return p;});
 return {dir,entry:join(dir,'bin/agent-role-contracts.mjs'),paths};
}
test('integration: core exports both async lifecycle APIs',()=>{
 assert.equal(typeof core.describeTaskLifecycle,'function');assert.equal(typeof core.validateTaskLifecycle,'function');
});
for(const cmd of commands)test(`integration: ${cmd} invalid declaration exits 1 through real core`,t=>{
 const {paths}=sandbox(t,false);for(const path of paths)writeFileSync(path,'{}');const r=run(cli,args(cmd,paths));assert.equal(r.status,1,r.stderr);
 const report=JSON.parse(r.stdout);assert.equal(report.valid,false);assert.equal(report.execution_authorized,false);assert.ok(report.errors.length);
});
for(const cmd of commands) {
 test(`test-double: ${cmd} dispatch, JSON, exit semantics and inert locators`,t=>{
  const {entry,paths,dir}=sandbox(t);const before=readdirSync(dir);
  writeFileSync(paths[3],JSON.stringify({slot:3,events:[{command:'exit 99',locator:'https://invalid.example/never'}],artifacts:[{locator:join(dir,'missing-artifact')}]}));
  const r=run(entry,[...args(cmd,paths),'--format','json']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).kind,cmd);assert.equal(JSON.parse(r.stdout).event_count,2);assert.deepEqual(readdirSync(dir),before);
  writeFileSync(paths[3],JSON.stringify({slot:3,invalid:true}));const bad=run(entry,args(cmd,paths));assert.equal(bad.status,1,bad.stderr);assert.equal(JSON.parse(bad.stdout).valid,false);
 });
 test(`test-double: ${cmd} text labels and declaration limits`,t=>{
  const {entry,paths}=sandbox(t);const text=()=>run(entry,[...args(cmd,paths),'--format','text']);const r=text();assert.equal(r.status,0,r.stderr);
  for(const value of ['Task: task-1','Action: action-1','Run: run-1','Current subject: sha256:current','Declared subject: sha256:declared','Event count: 2','Declared phases: review, execution','Artifact count: 1','Declarations only; actor identity, review, approval, execution, artifact bytes, runtime acceptance and replay enforcement are NOT verified/enforced.'])assert.ok(r.stdout.includes(value),r.stdout);
  assert.doesNotMatch(r.stdout,/real execution|events verified/i);
  if(cmd==='lifecycle') {
   assert.match(r.stdout,/Lifecycle matches subject: true/);assert.match(r.stdout,/Artifact identity consistent: true/);
   writeFileSync(paths[3],JSON.stringify({slot:3,invalid:true}));const bad=text();assert.equal(bad.status,1);assert.match(bad.stdout,/Lifecycle matches subject: false/);assert.match(bad.stdout,/Artifact identity consistent: false/);
   writeFileSync(paths[3],JSON.stringify({slot:3,absent:true}));assert.doesNotMatch(text().stdout,/Lifecycle matches subject:|Artifact identity consistent:/);
  }
  writeFileSync(paths[3],JSON.stringify({slot:3,run_id:'run\u001b\u202e'}));const escaped=text();assert.doesNotMatch(escaped.stdout,/[\u001b\u202e]/);assert.match(escaped.stdout,/run\\u001b\\u202e/);
 });
 test(`test-double: ${cmd} argument and bounded reader errors exit 2`,t=>{
  const {entry,paths,dir}=sandbox(t);const good=args(cmd,paths);
  for(const bad of [...[1,3,5,7].map(i=>good.filter((_,j)=>j!==i&&j!==i+1)),[...good,'--lifecycle',paths[3]],[...good,'--policy',paths[0]],[...good,'--format','yaml'],[...good,'--format'],[...good,'--at','2030']])assert.equal(run(entry,bad).status,2);
  for(const bytes of [Buffer.from([255]),Buffer.alloc(core.MAX_INPUT_BYTES+1)]) {writeFileSync(paths[3],bytes);const r=run(entry,good);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'CLI_ERROR');}
  rmSync(paths[3]);assert.equal(run(entry,good).status,2);
  symlinkSync(paths[0],paths[3]);assert.equal(run(entry,good).status,2);
  rmSync(paths[3]);mkdirSync(paths[3]);assert.equal(run(entry,good).status,2);
 });
}
for(const cmd of ['validate','explain','handoff','action-subject','action-bind',...commands])test(`generic ${cmd} never imports finance`,t=>{
 const {entry,paths}=sandbox(t);const example=n=>join(root,'examples',n+'.json');
 const generic=[cmd,'--bundle',example('team'),...(cmd==='validate'?[]:['--task',example('task')]),...(cmd==='handoff'?['--handoff',example('handoff')]:[]),...(cmd.startsWith('action')?['--action',paths[2]]:[]),...(cmd==='action-bind'?['--binding',paths[3]]:[])];
 const r=run(entry,commands.includes(cmd)?args(cmd,paths):generic);assert.ok([0,1].includes(r.status),r.stderr);assert.doesNotMatch(r.stderr,/FINANCE_IMPORT_TRIGGERED/);
});
test('static lifecycle CLI boundary and help',()=>{
 const source=readFileSync(cli,'utf8');const imports=[...source.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map(m=>m[1]);assert.deepEqual(imports.filter(s=>!s.startsWith('node:')),['../src/core.mjs']);
 assert.match(source,/cmd\.startsWith\('finance'\) \? await import\('\.\.\/src\/finance-profile\.mjs'\)/);
 assert.equal([...source.matchAll(/\bimport\(/g)].length,2);
 assert.match(source,/cmd==='adapter-filesystem-write' \? await import\('\.\.\/src\/filesystem-write-adapter\.mjs'\)/);
 for(const api of ['describeTaskLifecycle','validateTaskLifecycle'])assert.ok(source.includes('await core.'+api+'('));
 const help=run(cli,['--help']);assert.equal(help.status,0);for(const cmd of commands)assert.ok(help.stdout.includes(cmd+' --bundle B --task T --action A --lifecycle L [--format json|text]'));
});
