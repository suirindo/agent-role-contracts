import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'experiments/literal-paths/cli.mjs');
const stableBin=join(root,'bin/agent-role-contracts.mjs');
const P='literal-path/0.2';
const run=(args,options={})=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10000,...options});
const example=n=>JSON.parse(readFileSync(join(root,'examples',n+'.json'),'utf8'));
function fixture(t,scope='src/app/[locale]/(marketing)/_components/**'){
 const dir=mkdtempSync(join(tmpdir(),'arc-lp02-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bundle=example('team'),task=example('code-task');
 bundle.schema_version='literal-path-bundle/0.2';task.schema_version='literal-path-task/0.2';
 bundle.roles[1].contract.authority.allowed_write_scopes=[scope];task.inputs.scope=scope;
 const b=join(dir,'bundle.json'),k=join(dir,'task.json');
 writeFileSync(b,JSON.stringify(bundle));writeFileSync(k,JSON.stringify(task));return {dir,b,k,bundle,task};
}
const errorOf=r=>JSON.parse(r.stderr);

test('explain on a Next.js-shaped fixture passes and names the profile',t=>{
 const f=fixture(t);const r=run(['explain','--profile',P,'--bundle',f.b,'--task',f.k]);
 assert.equal(r.status,0,r.stderr);const o=JSON.parse(r.stdout);assert.equal(o.valid,true);assert.equal(o.scope_profile,P);assert.equal(o.execution_authorized,false);
});
test('validate passes and text output states that nothing is authorized',t=>{
 const f=fixture(t);const r=run(['validate','--profile',P,'--bundle',f.b,'--format','text']);
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/^PASS: .*literal-path\/0\.2.*execution NOT authorized/m);
});
test('a malformed or reserved scope is exit 1 with a diagnostic',t=>{
 for(const scope of ['src/../x','src/.GIT/x','src/@modal','a/.claude/x','src/[slug']){
  const f=fixture(t,scope);const r=run(['explain','--profile',P,'--bundle',f.b,'--task',f.k,'--format','text']);
  assert.equal(r.status,1,scope+r.stderr);assert.match(r.stdout,/^FAIL/m);
 }
});
test('--profile is mandatory, exact, and never inferred from schema_version',t=>{
 const f=fixture(t);
 for(const args of [[],['--profile','literal-path/0.1'],['--profile','literal-path/0.20'],['--profile','LITERAL-PATH/0.2'],['--profile','stable'],['--profile',''],['--profile',P+' ']]){
  const r=run(['validate',...args,'--bundle',f.b]);assert.equal(r.status,2,json(args));assert.equal(errorOf(r).error,'CLI_ERROR');assert.equal(r.stdout,'');
 }
});
const json=JSON.stringify;
test('only validate and explain exist; options are strict',t=>{
 const f=fixture(t);
 for(const args of [[],['run'],['handoff','--profile',P,'--bundle',f.b],['validate','--profile',P],['validate','--profile',P,'--bundle',f.b,'--task',f.k],
  ['validate','--profile',P,'--bundle',f.b,'--unknown','x'],['validate','--profile',P,'--profile',P,'--bundle',f.b],['validate','--profile',P,'--bundle',f.b,'--bundle',f.b],
  ['validate','--profile',P,'--bundle',f.b,'--format','csv'],['validate','--profile',P,'--bundle','--format'],['validate','--profile',P,'--bundle',f.b,'--format'],
  ['explain','--profile',P,'--bundle',f.b],['explain','--profile',P,'--task',f.k],['validate','--profile',P,'--bundle',f.b,'extra']]){
  const r=run(args);assert.equal(r.status,2,json(args));assert.equal(r.stdout,'');
 }
});
test('help is offline and states the source-only and non-authorizing nature',()=>{
 const r=run(['--help'],{env:{PATH:process.env.PATH,HOME:'/nonexistent'}});
 assert.equal(r.status,0);assert.match(r.stdout,/source-only/);assert.match(r.stdout,/not in the npm package/);assert.match(r.stdout,/PASS grants no permission/);assert.match(r.stdout,/hidden, underscore and bracket/);
});
test('input hardening: missing, directory, symlink, FIFO-like, oversized and malformed UTF-8 are exit 2',t=>{
 const f=fixture(t);const d=join(f.dir,'sub');mkdirSync(d);
 const link=join(f.dir,'link.json');symlinkSync(f.b,link);
 const big=join(f.dir,'big.json');writeFileSync(big,Buffer.alloc(1024*1024+1,0x20));
 const bad=join(f.dir,'bad.json');writeFileSync(bad,Buffer.from([0xff,0xfe,0x7b]));
 for(const p of [join(f.dir,'missing.json'),d,link,big,bad]){
  const r=run(['validate','--profile',P,'--bundle',p]);assert.equal(r.status,2,p);assert.equal(errorOf(r).error,'CLI_ERROR');assert.equal(r.stdout,'');
 }
 const r=run(['explain','--profile',P,'--bundle',f.b,'--task',link]);assert.equal(r.status,2);
 assert.match(errorOf(run(['validate','--profile',P,'--bundle',link])).message,/SYMLINK/);
 assert.match(errorOf(run(['validate','--profile',P,'--bundle',big])).message,/TOO_LARGE/);
});
test('a leading UTF-8 BOM is stripped exactly as in the stable bin; truncated JSON and duplicate keys never pass',t=>{
 const f=fixture(t);const BOM=Buffer.from([0xef,0xbb,0xbf]);
 const withBom=(name,bytes,n=1)=>{const p=join(f.dir,name);writeFileSync(p,Buffer.concat([...Array(n).fill(BOM),bytes]));return p;};
 const stableRun=p=>spawnSync(process.execPath,[stableBin,'validate','--bundle',p],{encoding:'utf8',timeout:10000});
 const stableBytes=readFileSync(join(root,'examples/team.json'));
 // direct comparison: a stable-versioned input on the stable bin and a 0.2 input on the 0.2 CLI
 assert.equal(stableRun(withBom('stable-bom.json',stableBytes)).status,0,'stable bin accepts one BOM');
 assert.equal(run(['validate','--profile',P,'--bundle',withBom('bom.json',readFileSync(f.b))]).status,0);
 // a second BOM is not stripped by either reader and both refuse the file
 const sd=stableRun(withBom('stable-bom2.json',stableBytes,2)).status,ld=run(['validate','--profile',P,'--bundle',withBom('bom2.json',readFileSync(f.b),2)]).status;
 assert.notEqual(sd,0);assert.equal(ld,sd);
 const trunc=join(f.dir,'trunc.json');writeFileSync(trunc,readFileSync(f.b,'utf8').slice(0,-5));
 const dup=join(f.dir,'dup.json');writeFileSync(dup,'{"schema_version":"literal-path-bundle/0.2","schema_version":"literal-path-bundle/0.2"}');
 for(const p of [trunc,dup])assert.notEqual(run(['validate','--profile',P,'--bundle',p]).status,0,p);
});
test('v0.1 or stable-versioned inputs are refused by the 0.2 CLI and 0.2 inputs by the stable CLI',t=>{
 const f=fixture(t);const o=example('team');const old=join(f.dir,'old.json');writeFileSync(old,JSON.stringify(o));
 assert.equal(run(['validate','--profile',P,'--bundle',old]).status,1);
 const s=spawnSync(process.execPath,[stableBin,'validate','--bundle',f.b],{encoding:'utf8',timeout:10000});assert.equal(s.status,1);
});
test('control and bidirectional characters are escaped in text output',t=>{
 const f=fixture(t);const b=structuredClone(f.bundle);
 b['bad\u001b[2J']='x';b['bidi\u202ehidden']='x';b['isolate\u2066hidden']='x';b['c1\u009bhidden']='x';b['alm\u061chidden']='x';
 writeFileSync(f.b,JSON.stringify(b));
 const r=run(['validate','--profile',P,'--bundle',f.b,'--format','text']);assert.equal(r.status,1);
 for(const [raw,esc] of [['\u001b','\\u001b'],['\u202e','\\u202e'],['\u2066','\\u2066'],['\u009b','\\u009b'],['\u061c','\\u061c']]){assert.equal(r.stdout.includes(raw),false,esc);assert.ok(r.stdout.includes(esc),esc);}
 const j=run(['validate','--profile',P,'--bundle',f.b]);for(const raw of ['\u202e','\u2066','\u009b','\u061c'])assert.equal(j.stdout.includes(raw),false);
 const hostile=join(f.dir,'we\u202eird.json');
 const e=run(['validate','--profile',P,'--bundle',hostile]);assert.equal(e.status,2);assert.equal(e.stderr.includes('\u202e'),false);
});
test('stable bin parity on hostile file conditions',t=>{
 const f=fixture(t);const link=join(f.dir,'l.json');symlinkSync(f.b,link);
 const big=join(f.dir,'big.json');writeFileSync(big,Buffer.alloc(1024*1024+1,0x20));
 const bad=join(f.dir,'bad.json');writeFileSync(bad,Buffer.from([0xff]));
 for(const p of [link,big,bad,f.dir,join(f.dir,'nope')]){
  const a=spawnSync(process.execPath,[stableBin,'validate','--bundle',p],{encoding:'utf8',timeout:10000});
  assert.equal(run(['validate','--profile',P,'--bundle',p]).status,a.status,p);
 }
});
test('CLI performs no writes and leaves its working directory untouched',t=>{
 const f=fixture(t);const before=readdirSync(f.dir).sort();
 const r=run(['explain','--profile',P,'--bundle',f.b,'--task',f.k],{cwd:f.dir,env:{PATH:process.env.PATH,HOME:join(f.dir,'absent')}});
 assert.equal(r.status,0,r.stderr);assert.deepEqual(readdirSync(f.dir).sort(),before);
});
test('the experiment is not part of the published package',()=>{
 const r=spawnSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:root,encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,r.stderr);const files=JSON.parse(r.stdout)[0].files.map(f=>f.path);
 assert.ok(files.length>0);assert.equal(files.some(p=>p.startsWith('experiments/')||p.includes('literal-paths')),false);
});
