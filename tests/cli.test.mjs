import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'bin/agent-role-contracts.mjs');
const file=n=>join(root,'examples',n+'.json');
const run=(args,options={})=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:5000,...options});
test('CLI positive validate exit0',()=>{const r=run(['validate','--bundle',file('team')]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).valid,true);});
for(const [n,code] of [['invalid-self-review','SELF_REVIEW_DECLARED'],['invalid-authority','AUTHORITY_CONTRADICTION'],['invalid-reference','ROLE_REFERENCE_UNKNOWN']])test(`CLI ${n} exit1`,()=>{const r=run(['validate','--bundle',file(n)]);assert.equal(r.status,1,r.stderr);assert.ok(JSON.parse(r.stdout).errors.some(e=>e.code===code));});
test('CLI explain text reports relationships',()=>{const r=run(['explain','--bundle',file('team'),'--task',file('task'),'--format','text']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/^Implementers: implementer$/m);assert.match(r.stdout,/^Reviewers: reviewer$/m);assert.equal(r.stdout.includes(String.fromCharCode(92)+'u000a'),false);assert.match(r.stdout,/execution NOT authorized/);});
test('CLI handoff exit0',()=>{const r=run(['handoff','--bundle',file('team'),'--task',file('task'),'--handoff',file('handoff')]);assert.equal(r.status,0,r.stderr);});
for(const args of [[],['run'],['validate'],['validate','--bundle',file('team'),'--unknown','x'],['validate','--bundle',file('team'),'--bundle',file('team')],['validate','--bundle',file('team'),'--format','csv'],['validate','--bundle',file('team'),'--task',file('task')]])test('CLI rejects malformed command '+JSON.stringify(args.slice(0,2)),()=>assert.equal(run(args).status,2));
test('CLI missing file is an operational error',()=>assert.equal(run(['validate','--bundle',join(root,'missing.json')]).status,2));
test('CLI help does not load configuration',()=>{const r=run(['--help'],{env:{PATH:process.env.PATH,HOME:'/nonexistent'}});assert.equal(r.status,0);assert.match(r.stdout,/Usage/);});
test('CLI refuses nonregular file and malformed UTF8',t=>{const dir=mkdtempSync(join(tmpdir(),'aos-core-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));assert.equal(run(['validate','--bundle',dir]).status,2);const path=join(dir,'bad.json');writeFileSync(path,Buffer.from([0xff,0xfe]));assert.equal(run(['validate','--bundle',path]).status,2);});
test('CLI last-component symlink rejected',t=>{const dir=mkdtempSync(join(tmpdir(),'aos-core-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'link.json');symlinkSync(file('team'),path);assert.equal(run(['validate','--bundle',path]).status,2);});
test('unrelated cwd, empty HOME and paths with spaces work',t=>{const dir=mkdtempSync(join(tmpdir(),'aos core '));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'team file.json');cpSync(file('team'),path);const before=readdirSync(dir);const r=run(['validate','--bundle',path],{cwd:dir,env:{PATH:process.env.PATH,HOME:join(dir,'absent')}});assert.equal(r.status,0,r.stderr);assert.deepEqual(readdirSync(dir),before);});
test('evidence command is inert data',t=>{const dir=mkdtempSync(join(tmpdir(),'aos-core-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const h=JSON.parse(readFileSync(file('handoff'),'utf8'));h.evidence[0].command='This string must never be invoked.';const path=join(dir,'handoff.json');writeFileSync(path,JSON.stringify(h));const r=run(['handoff','--bundle',file('team'),'--task',file('task'),'--handoff',path]);assert.equal(r.status,0,r.stderr);});
test('core source graph evaluates and runs in memory without I/O capabilities',()=>{
 const script=`import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';import path from 'node:path';
 const dir=${JSON.stringify(join(root,'src'))};
 const sources=new Map(readdirSync(dir).filter(n=>n.endsWith('.mjs')).map(n=>[path.join(dir,n),readFileSync(path.join(dir,n),'utf8')]));
 const b=readFileSync(${JSON.stringify(file('team'))},'utf8'),task=readFileSync(${JSON.stringify(file('task'))},'utf8'),h=readFileSync(${JSON.stringify(file('handoff'))},'utf8');
 let attempts=0;const deny=()=>{attempts++;throw Error('IO_DENIED')};
 const context=vm.createContext({Buffer,TextEncoder,TextDecoder,URL,fetch:deny});
 vm.runInContext('try{fetch()}catch{}',context);if(attempts!==1)throw Error('TRAP_NOT_PROVEN');attempts=0;
 const modules=new Map([...sources].map(([name,source])=>[name,new vm.SourceTextModule(source,{context,identifier:name})]));
 const linker=(specifier,ref)=>{if(!specifier.startsWith('./'))throw Error('NONLOCAL_IMPORT');const result=modules.get(path.resolve(path.dirname(ref.identifier),specifier));if(!result)throw Error('OUTSIDE_SOURCE_GRAPH');return result;};
 const sentinel=new vm.SourceTextModule('import fs from "node:fs"',{context,identifier:path.join(dir,'sentinel.mjs')});let rejected=false;try{await sentinel.link(linker)}catch{rejected=true}if(!rejected)throw Error('LINKER_NOT_PROVEN');
 const entry=modules.get(path.join(dir,'index.mjs'));await entry.link(linker);await entry.evaluate();const core=entry.namespace;
 for(const r of [core.validateBundle(b),core.explainTask(b,task),core.validateHandoff(b,task,h)])if(!r.valid)throw Error(JSON.stringify(r));if(attempts)throw Error('IO_DETECTED');console.log('CORE_APPLICATION_IO=0');`;
 const r=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/CORE_APPLICATION_IO=0/);
});
test('untrusted diagnostic control characters are escaped in text output',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aos-core-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const b=JSON.parse(readFileSync(file('team'),'utf8'));b['bad\u001b[2J']='x';b['bidi\u202ehidden']='x';b['isolate\u2066hidden']='x';const p=join(dir,'bad.json');writeFileSync(p,JSON.stringify(b));const r=run(['validate','--bundle',p,'--format','text']);assert.equal(r.status,1);for(const [raw,escaped] of [['\u001b','\\u001b'],['\u202e','\\u202e'],['\u2066','\\u2066']]){assert.equal(r.stdout.includes(raw),false);assert.ok(r.stdout.includes(escaped));}
});

test('JSON diagnostics escape bidi controls while preserving JSON data',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aos-core-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const b=JSON.parse(readFileSync(file('team'),'utf8'));b['bidi\u202ehidden']='x';const p=join(dir,'bad.json');writeFileSync(p,JSON.stringify(b));const r=run(['validate','--bundle',p]);assert.equal(r.status,1,r.stderr);assert.equal(r.stdout.includes('\u202e'),false);assert.ok(r.stdout.includes('\\u202e'));assert.ok(JSON.parse(r.stdout).errors.some(e=>e.path.includes('\u202e')));const missing=join(dir,'missing\u2066.json');const e=run(['validate','--bundle',missing]);assert.equal(e.status,2);assert.equal(e.stderr.includes('\u2066'),false);assert.ok(e.stderr.includes('\\u2066'));assert.ok(JSON.parse(e.stderr).message.includes('\u2066'));
});
// #109: exit-2 errors follow --format text; JSON stays the default and the fallback when --format itself is invalid.
test('CLI exit-2 errors are one text line on stderr when --format text was given',()=>{
 for(const [args,message] of [[['explain','--bundle',file('team'),'--task',join(root,'examples','does-not-exist.json'),'--format','text'],/ENOENT/],[['explain','--bundle',file('team'),'--task',root,'--format','text'],/INPUT_NOT_REGULAR_FILE/],[['explain','--bundle',file('team'),'--format','text'],/Missing --task/],[['bogus','--format','text'],/Unknown command/]]) {
  const r=run(args);assert.equal(r.status,2);assert.equal(r.stdout,'');assert.match(r.stderr,/^CLI_ERROR: /);assert.match(r.stderr,message);assert.match(r.stderr,/exit 2: CLI\/file error; no declaration result/);assert.throws(()=>JSON.parse(r.stderr));
 }
});
test('CLI exit-2 errors stay one JSON line without --format text or with an invalid --format',()=>{
 for(const args of [['explain','--bundle',file('team'),'--task',join(root,'examples','does-not-exist.json')],['explain','--bundle',file('team'),'--task',join(root,'examples','does-not-exist.json'),'--format','json'],['explain','--bundle',file('team'),'--task',file('task'),'--format','yaml'],['explain','--bundle',file('team')]]) {
  const r=run(args);assert.equal(r.status,2);assert.equal(r.stdout,'');const parsed=JSON.parse(r.stderr);assert.equal(parsed.error,'CLI_ERROR');assert.equal(parsed.valid,false);assert.equal(parsed.execution_authorized,false);assert.equal(typeof parsed.message,'string');
 }
});
test('CLI text exit-2 line escapes control characters from the failing path',()=>{const r=run(['validate','--bundle','nope\u001b[2J.json','--format','text']);assert.equal(r.status,2);assert.equal(r.stderr.includes('\u001b'),false);assert.ok(r.stderr.includes('\\u001b'));});
// #110: --help shows the package-bin form that an installed consumer actually runs.
test('CLI help shows the installed package bin usage',()=>{const r=run(['--help']);assert.equal(r.status,0);assert.match(r.stdout,/^Installed as a dependency, .*npx --no-install agent-role-contracts explain --bundle \.arc\/bundle\.json --task \.arc\/task\.json --format text$/m);});
// #110: one missing input required by several roles is one text line; the JSON report keeps one entry per role.
test('CLI text output merges TASK_INPUT_REQUIRED across roles while JSON keeps every entry',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aos-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const task=JSON.parse(readFileSync(file('task'),'utf8'));task.inputs.scope='';const p=join(dir,'task.json');writeFileSync(p,JSON.stringify(task));
 const text=run(['explain','--bundle',file('team'),'--task',p,'--format','text']);assert.equal(text.status,1);
 const required=text.stdout.split('\n').filter(line=>line.startsWith('TASK_INPUT_REQUIRED '));
 assert.deepEqual(required,['TASK_INPUT_REQUIRED task/inputs/scope: Required by roles coordinator, implementer, reviewer']);
 assert.match(text.stdout,/^TASK_WRITE_SCOPE_INVALID task\/inputs\/scope: /m);
 const json=run(['explain','--bundle',file('team'),'--task',p]);assert.equal(json.status,1);
 const entries=JSON.parse(json.stdout).errors.filter(e=>e.code==='TASK_INPUT_REQUIRED');
 assert.deepEqual(entries.map(e=>e.message),['Required by role coordinator','Required by role implementer','Required by role reviewer']);
 assert.ok(entries.every(e=>e.path==='task/inputs/scope'));
});
test('CLI text output keeps a single-role TASK_INPUT_REQUIRED line unchanged',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aos-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bundle=JSON.parse(readFileSync(file('team'),'utf8'));
 for(const role of bundle.roles)if(role.contract.id!=='implementer'){const c=role.contract.contract;c.required_inputs=c.required_inputs.filter(k=>k!=='scope');c.conditional_required_inputs=[];}
 const b=join(dir,'bundle.json');writeFileSync(b,JSON.stringify(bundle));
 const task=JSON.parse(readFileSync(file('task'),'utf8'));task.inputs.scope='';const p=join(dir,'task.json');writeFileSync(p,JSON.stringify(task));
 const text=run(['explain','--bundle',b,'--task',p,'--format','text']);assert.equal(text.status,1,text.stdout+text.stderr);
 assert.deepEqual(text.stdout.split('\n').filter(line=>line.startsWith('TASK_INPUT_REQUIRED ')),['TASK_INPUT_REQUIRED task/inputs/scope: Required by role implementer']);
});
// #110: JSON_INVALID keeps its code and path; the message now names the cause and position.
test('CLI text output shows the JSON_INVALID cause and position',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aos-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const [name,content,expected] of [['truncated','{ "schema_version": "0.1", ',/JSON_INVALID task: Syntax error: unexpected end of input at line 1, column 28/],['empty','',/JSON_INVALID task: Empty input/],['duplicate','{"schema_version":"0.1","schema_version":"0.1"}',/JSON_INVALID task: Duplicate key "schema_version" at line 1, column 25/],['trailing',JSON.stringify(JSON.parse(readFileSync(file('task'),'utf8')),null,2).replace('"change_kind": "docs"','"change_kind": "docs",'),/JSON_INVALID task: Syntax error: trailing comma before "}" at line \d+, column \d+/]]) {
  const p=join(dir,name+'.json');writeFileSync(p,content);const r=run(['explain','--bundle',file('team'),'--task',p,'--format','text']);assert.equal(r.status,1,name);assert.match(r.stdout,expected,name);
  const j=run(['explain','--bundle',file('team'),'--task',p]);assert.equal(j.status,1);assert.deepEqual(JSON.parse(j.stdout).errors.map(({code,path})=>({code,path})),[{code:'JSON_INVALID',path:'task'}],name);
 }
});
