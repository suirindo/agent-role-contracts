import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../src/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'bin/agent-role-contracts.mjs');
const run=(entry,args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:10000});
const example=name=>join(root,'examples',name+'.json');
function sandbox(t,patched=false) {
 const dir=mkdtempSync(join(tmpdir(),'arc-action-cli-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(join(dir,'bin'));mkdirSync(join(dir,'src'));
 cpSync(cli,join(dir,'bin/agent-role-contracts.mjs'));
 for(const name of readdirSync(join(root,'src'))) {
  if(name.endsWith('.mjs')&&!/finance|safe/.test(name)&&name!=='index.mjs'&&name!=='schemas.generated.mjs')cpSync(join(root,'src',name),join(dir,'src',name));
 }
 // A throwing profile proves the dynamic import is never evaluated by generic commands.
 writeFileSync(join(dir,'src/finance-profile.mjs'),"throw new Error('FINANCE_IMPORT_TRIGGERED');\n");
 if(patched) {
  // Only this disposable copy is patched; it tests CLI dispatch, not core validation.
  const source=readFileSync(join(dir,'src/core.mjs'),'utf8');
  writeFileSync(join(dir,'src/core.mjs'),source+`
export async function describeTaskAction(...args) { return actionReport('action-subject',args,3); }
export async function validateTaskActionBinding(...args) { return actionReport('action-binding',args,4); }
function actionReport(kind,args,count) {
 if(args.length!==count||args.some((s,i)=>JSON.parse(s).slot!==i))throw Error('ARGUMENT_ORDER');
 const valid=!JSON.parse(args[2]).invalid;
 return {valid,kind,execution_authorized:false,task_id:'task-1',action_id:'action-1',subject_digest:'sha256:abc',binding_matches:valid,reviews:[{role_id:'reviewer-1',decision:'approved'},{role_id:'reviewer-2',decision:'rejected'}],human_approval:JSON.parse(args[2]).noApproval?null:{role_id:'human-1',decision:'approved'},errors:valid?[]:[{code:'ACTION_INVALID',path:'action',message:'Invalid declaration'}]};
}
`);
 }
 const paths=Array.from({length:4},(_,slot)=>{
  const path=join(dir,`input ${slot}.json`);writeFileSync(path,JSON.stringify({slot}));return path;
 });
 return {dir,entry:join(dir,'bin/agent-role-contracts.mjs'),paths};
}
const actionArgs=(cmd,paths)=>[cmd,'--bundle',paths[0],'--task',paths[1],'--action',paths[2],...(cmd==='action-bind'?['--binding',paths[3]]:[])];
test('integration: core exports both async action APIs',()=>{
 assert.equal(typeof core.describeTaskAction,'function');
 assert.equal(typeof core.validateTaskActionBinding,'function');
});
for(const cmd of ['action-subject','action-bind'])test(`integration: ${cmd} invalid declaration exits 1 via real core`,t=>{
 const {paths}=sandbox(t);
 writeFileSync(paths[0],'{}');
 const r=run(cli,actionArgs(cmd,paths));
 assert.equal(r.status,1,r.stderr);
 const report=JSON.parse(r.stdout);assert.equal(report.valid,false);assert.equal(report.execution_authorized,false);assert.ok(report.errors.length);
});
for(const [cmd,extra] of [['validate',[]],['explain',['--task',example('task')]],['handoff',['--task',example('task'),'--handoff',example('handoff')]]])test(`${cmd} never evaluates finance import`,t=>{
 const {entry}=sandbox(t);const r=run(entry,[cmd,'--bundle',example('team'),...extra]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).valid,true);
});
for(const cmd of ['action-subject','action-bind']) {
 test(`${cmd} uses only core, awaits result and preserves JSON / exit semantics (test-only core)`,t=>{
  const {entry,paths,dir}=sandbox(t,true);const before=readdirSync(dir);
  const r=run(entry,actionArgs(cmd,paths));assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).subject_digest,'sha256:abc');assert.deepEqual(readdirSync(dir),before);
  writeFileSync(paths[2],JSON.stringify({slot:2,invalid:true}));
  const invalid=run(entry,actionArgs(cmd,paths));assert.equal(invalid.status,1,invalid.stderr);assert.equal(JSON.parse(invalid.stdout).valid,false);
 });
 test(`${cmd} text declares integrity and no execution authority (test-only core)`,t=>{
  const {entry,paths}=sandbox(t,true);const r=run(entry,[...actionArgs(cmd,paths),'--format','text']);assert.equal(r.status,0,r.stderr);
  for(const value of ['Task: task-1','Action: action-1','Subject: sha256:abc','Digest is integrity-only','execution NOT authorized'])assert.ok(r.stdout.includes(value));
  assert.doesNotMatch(r.stdout,/authenticated|verified/i);
  if(cmd==='action-bind') {
   assert.match(r.stdout,/Binding match: true/);assert.match(r.stdout,/Reviewer reviewer-1: approved/);assert.match(r.stdout,/Reviewer reviewer-2: rejected/);assert.match(r.stdout,/Approval declaration:.*human-1.*approved/);
   writeFileSync(paths[2],JSON.stringify({slot:2,noApproval:true,invalid:true}));
   const absent=run(entry,[...actionArgs(cmd,paths),'--format','text']);assert.equal(absent.status,1);assert.match(absent.stdout,/Binding match: false/);assert.doesNotMatch(absent.stdout,/Approval declaration:/);
  }
 });
 test(`${cmd} rejects malformed arguments and file errors with exit 2 (test-only core)`,t=>{
  const {entry,paths}=sandbox(t,true);const args=actionArgs(cmd,paths);
  for(const bad of [args.slice(0,-2),[...args,'--action',paths[2]],[...args,'--policy',paths[0]],[...args,'--at','2030-01-01'],[...args,'--format','yaml'],[...args,'--format'],[...args,'--unknown','x']]) {
   const r=run(entry,bad);assert.equal(r.status,2,r.stdout);assert.equal(JSON.parse(r.stderr).error,'CLI_ERROR');
  }
  rmSync(paths[2]);const r=run(entry,args);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'CLI_ERROR');
 });
}
test('static CLI boundary imports core and keeps finance lazy',()=>{
 const source=readFileSync(cli,'utf8');
 const imports=[...source.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map(m=>m[1]);
 assert.deepEqual(imports.filter(s=>!s.startsWith('node:')),['../src/core.mjs']);
 assert.match(source,/cmd\.startsWith\('finance'\) \? await import\('\.\.\/src\/finance-profile\.mjs'\)/);
 assert.match(source,/await core\.describeTaskAction\(/);assert.match(source,/await core\.validateTaskActionBinding\(/);
 const help=run(cli,['--help']);assert.equal(help.status,0);assert.match(help.stdout,/action-subject --bundle B --task T --action A/);assert.match(help.stdout,/action-bind --bundle B --task T --action A --binding X/);
});
