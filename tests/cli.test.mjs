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
