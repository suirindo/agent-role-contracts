import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'bin/agent-role-contracts.mjs');
const run=(entry,args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:10000});
const args=paths=>['adapter-filesystem-write',...['--bundle','--task','--action','--mapping'].flatMap((key,i)=>[key,paths[i]])];
function sandbox(t) {
 const dir=mkdtempSync(join(tmpdir(),'filesystem-cli-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(join(dir,'bin'));mkdirSync(join(dir,'src'));
 const entry=join(dir,'bin/agent-role-contracts.mjs');cpSync(cli,entry);
 // Disposable stand-ins isolate CLI dispatch from adapter/core implementation.
 writeFileSync(join(dir,'src/core.mjs'),`export const MAX_INPUT_BYTES=1048576;
 const report=()=>({valid:true,kind:'core',errors:[]});
 export const validateBundle=report,explainTask=report,validateHandoff=report,describeTaskAction=report,validateTaskActionBinding=report;
 `);
 writeFileSync(join(dir,'src/finance-profile.mjs'),"throw Error('FINANCE_IMPORT_TRIGGERED');");
 writeFileSync(join(dir,'src/filesystem-write-adapter.mjs'),`export async function validateFilesystemWriteMapping(...inputs) {
 if(inputs.length!==4||inputs.some((s,i)=>JSON.parse(s).slot!==i))throw Error('ARGUMENT_ORDER');
 const m=JSON.parse(inputs[3]);await new Promise(resolve=>setTimeout(resolve,1));
 return {valid:!m.invalid,kind:'filesystem-write-mapping',execution_authorized:false,task_id:'task-1',action_id:'action-1',subject_digest:'sha256:abc',adapter_profile:'filesystem-write',mapping:m.unparsed?undefined:{operation:'write',path:m.path||'/absent/target',content_digest:'sha256:def'},eligible_executor_ids:['executor-1'],mapping_matches_subject:!m.invalid,errors:m.invalid?[{code:'MAPPING_INVALID',path:'mapping',message:'Invalid declaration'}]:[]};
 }`);
 const paths=Array.from({length:4},(_,slot)=>{const p=join(dir,`input ${slot}.json`);writeFileSync(p,JSON.stringify({slot}));return p;});
 return {dir,entry,paths};
}
test('static: adapter import and call are exclusive; finance remains independently lazy',()=>{
 const s=readFileSync(cli,'utf8');
 assert.deepEqual([...s.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map(m=>m[1]).filter(x=>!x.startsWith('node:')),['../src/core.mjs']);
 assert.equal([...s.matchAll(/import\('\.\.\/src\/filesystem-write-adapter\.mjs'\)/g)].length,1);
 assert.match(s,/cmd==='adapter-filesystem-write' \? await import\('\.\.\/src\/filesystem-write-adapter\.mjs'\) : \{\}/);
 assert.equal([...s.matchAll(/await validateFilesystemWriteMapping\(/g)].length,1);
 assert.match(s,/cmd==='adapter-filesystem-write'\?await validateFilesystemWriteMapping\(b,read\(args.get\('--task'\)\),read\(args.get\('--action'\)\),read\(args.get\('--mapping'\)\)\)/);
 assert.match(s,/cmd.startsWith\('finance'\) \? await import\('\.\.\/src\/finance-profile\.mjs'\)/);
 const help=run(cli,['--help']);assert.equal(help.status,0);assert.match(help.stdout,/adapter-filesystem-write --bundle B --task T --action A --mapping M \[--format json\|text\]/);
});
test('test-double: async argument order, JSON report, exit 0/1, no target or content access',t=>{
 const {dir,entry,paths}=sandbox(t);const before=readdirSync(dir);
 let r=run(entry,args(paths));assert.equal(r.status,0,r.stderr);
 const report=JSON.parse(r.stdout);assert.equal(report.kind,'filesystem-write-mapping');assert.equal(report.mapping.path,'/absent/target');assert.equal(report.execution_authorized,false);
 assert.deepEqual(readdirSync(dir),before);
 writeFileSync(paths[3],JSON.stringify({slot:3,invalid:true}));r=run(entry,args(paths));assert.equal(r.status,1,r.stderr);assert.equal(JSON.parse(r.stdout).valid,false);
});
test('test-double: text reports declarations, escapes controls and handles unparsed mapping',t=>{
 const {entry,paths}=sandbox(t);
 writeFileSync(paths[3],JSON.stringify({slot:3,path:'/target\nFAKE\u001b'}));
 const r=run(entry,[...args(paths),'--format','text']);assert.equal(r.status,0,r.stderr);
 for(const text of ['Task: task-1','Action: action-1','Subject: sha256:abc','Adapter profile: filesystem-write','Operation: write','Path: /target\\u000aFAKE\\u001b','Content digest: sha256:def','Eligible declared executor IDs: executor-1','Mapping match: true','Declaration consistency only; content, filesystem, permission, and execution are NOT verified/enforced.'])assert.ok(r.stdout.includes(text),r.stdout);
 assert.doesNotMatch(r.stdout,/executors? (?:authenticated|authorized)/i);
 writeFileSync(paths[3],JSON.stringify({slot:3,invalid:true,unparsed:true}));
 const bad=run(entry,[...args(paths),'--format','text']);assert.equal(bad.status,1);assert.match(bad.stdout,/Mapping match: false/);assert.match(bad.stdout,/MAPPING_INVALID/);assert.doesNotMatch(bad.stdout,/^Operation:|^Path:|^Content digest:/m);
});
test('test-double: CLI/input errors exit 2',t=>{
 const {entry,paths,dir}=sandbox(t);const good=args(paths);
 for(let i=1;i<good.length;i+=2){const bad=good.filter((_,j)=>j!==i&&j!==i+1);assert.equal(run(entry,bad).status,2);}
 for(const extra of [['--mapping',paths[3]],['--policy',paths[0]],['--at','now'],['--format','yaml'],['--format'],['--unknown','x']]){const r=run(entry,[...good,...extra]);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'CLI_ERROR');}
 writeFileSync(paths[3],'not json');assert.equal(run(entry,good).status,2);
 rmSync(paths[3]);assert.equal(run(entry,good).status,2);
 symlinkSync(paths[0],paths[3]);assert.match(run(entry,good).stderr,/INPUT_SYMLINK_REFUSED/);
 rmSync(paths[3]);mkdirSync(paths[3]);assert.equal(run(entry,good).status,2);
 rmSync(paths[3],{recursive:true});writeFileSync(paths[3],'x'.repeat(1048577));assert.match(run(entry,good).stderr,/INPUT_TOO_LARGE/);
});
test('test-double: generic commands trigger neither module; finance never imports adapter',t=>{
 const {dir,entry,paths}=sandbox(t);
 writeFileSync(join(dir,'src/filesystem-write-adapter.mjs'),"throw Error('ADAPTER_IMPORT_TRIGGERED');");
 for(const [cmd,extra] of [['validate',[]],['explain',['--task',paths[1]]],['handoff',['--task',paths[1],'--handoff',paths[2]]],['action-subject',['--task',paths[1],'--action',paths[2]]],['action-bind',['--task',paths[1],'--action',paths[2],'--binding',paths[3]]]])assert.equal(run(entry,[cmd,'--bundle',paths[0],...extra]).status,0,cmd);
 const adapter=run(entry,args(paths));assert.equal(adapter.status,2);assert.match(adapter.stderr,/ADAPTER_IMPORT_TRIGGERED/);assert.doesNotMatch(adapter.stderr,/FINANCE_IMPORT_TRIGGERED/);
 for(const [cmd,extra] of [['finance-subject',['--transaction',paths[3]]],['finance',['--intent',paths[3]]],['finance-execution',['--intent',paths[3],'--receipt',paths[3]]],['finance-safe',['--intent',paths[3],'--safe-proposal',paths[3]]]]){
 const r=run(entry,[cmd,'--bundle',paths[0],'--task',paths[1],'--policy',paths[2],...extra]);assert.equal(r.status,2);assert.match(r.stderr,/FINANCE_IMPORT_TRIGGERED/);assert.doesNotMatch(r.stderr,/ADAPTER_IMPORT_TRIGGERED/);
 }
});
// Explicit integration dependency: these must fail, rather than skip, until the
// real adapter lane supplies the module and its declaration report contract.
test('integration dependency: real adapter exports async mapping validator',async()=>{
 const adapter=await import('../src/filesystem-write-adapter.mjs');assert.equal(typeof adapter.validateFilesystemWriteMapping,'function');
 const pending=adapter.validateFilesystemWriteMapping('{}','{}','{}','{}');assert.equal(typeof pending.then,'function');const report=await pending;assert.equal(report.valid,false);assert.ok(report.errors.length);
});
test('integration dependency: real CLI rejects invalid mapping declarations with exit 1',t=>{
 const {paths}=sandbox(t);for(const p of paths)writeFileSync(p,'{}');
 const r=run(cli,args(paths));assert.equal(r.status,1,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.valid,false);assert.equal(report.execution_authorized,false);assert.ok(report.errors.length);
});
