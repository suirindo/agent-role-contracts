import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as lp from '../experiments/literal-paths/profile-0.2.mjs';
import * as lp1 from '../experiments/literal-paths/profile.mjs';
import * as stable from '../src/core.mjs';
import {scopeContains as stableContains} from '../src/validation.mjs';
const json = JSON.stringify;
const load = name => JSON.parse(fs.readFileSync(new URL('../examples/'+name+'.json',import.meta.url),'utf8'));
const DIGEST = 'sha256:'+'a'.repeat(64);
const setup = (path='src/app/[locale]/(marketing)/_components/hero.tsx', scope='src/**') => {
 const bundle=load('team'), task=load('code-task');
 bundle.schema_version=lp.VERSIONS.bundle;task.schema_version=lp.VERSIONS.task;
 bundle.roles[1].contract.authority.allowed_write_scopes=[scope];task.inputs.scope=scope;
 const action={schema_version:'0.3',id:'write-1',kind:'filesystem-write',parameters:{path,content_sha256:DIGEST}};
 return {bundle,task,action};
};
const describe = s => lp.describeTaskAction(json(s.bundle),json(s.task),json(s.action));
const mapping = async s => ({schema_version:lp.VERSIONS.mapping,subject_digest:(await describe(s)).subject_digest,operation:'write_file',...s.action.parameters});
const validateG2 = async s => lp.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(await mapping(s)));
const codes = r => r.errors.map(e => e.code);

const accepted = [
 'src', 'src/x.ts', 'src/**', 'src/app/**', '.github/workflows/ci.yml', 'a/.github/x', '.gitignore', 'a/.gitkeep', 'a/.gitattributes',
 '.env', 'src/.env.local', 'src/.hidden/x', '.well-known/x', 'src/_private/x', '_x', 'src/__tests__/a.test.ts',
 '(group)', 'src/(ja)/x', 'src/(group-1.2_3)/x', 'src/(_g)/x',
 'src/[slug]', 'src/[...slug]', 'src/[[...slug]]', 'src/[_id]/x', 'src/[locale-code]/x', 'src/[a1]/**', 'src/[a-z]/x',
 'src/app/[locale]/(marketing)/_components/hero.tsx', 'src/app/[locale]/(marketing)/.hidden/x', 'src/a..b/x', 'src/a-b_c.d/x',
 '.claude.json', 'src/.gitx/y',
];
const traversalAndMalformed = [
 '', '/', '/**', '../x', '/src/x', 'C:/x', 'C:\\x', '\\\\server\\share\\x', '//server/share/x', 'src\\x', 'src//x', 'src/', 'src/./x', 'src/../x', 'src/.', 'src/..', 'src/...',
 'src/()', 'src/((ja))/x', 'src/(ja/x)', 'src/(ja*)/x', 'src/(ja)x/x', 'src/x(ja)', 'src/%28ja%29/x', 'src/(ja)/x/**/y', 'src/%41', 'src/**/x', 'src/*', 'src/x*', 'src/?', 'src/{a,b}',
 'src/x\n', 'src/x\r', 'src/x\0', 'src/x\t', 'src/x\u007f', 'src/x\u2028', 'src/x\u202e', 'src/x\u0085',
 'src/file.', 'src/a./b', 'src/.a.',
 // F1 bracket vectors
 'src/[]', 'src/[...]', 'src/[[slug]]', 'src/[[...slug]', 'src/[...slug]]', 'src/[slug', 'src/slug]', 'src/a[slug]', 'src/[slug]a', 'src/[a][b]', 'src/[(a)]', 'src/([a])',
 'src/[.a]', 'src/[..a]', 'src/[....a]', 'src/[[[...a]]]', 'src/[sl*ug]', 'src/[slug]/**/x', 'src/[-a]x',
 '/[x]', '[', ']',
];
const reservedGit = ['.git', '.GIT', '.Git', '.gIt/hooks/pre-commit', 'a/.git/config', 'a/b/.GIT/x', '.git/**', 'a/.Git/**'];
const trailingDotGit = ['.git.', '.git./config', '.git..'];
const reservedRuntime = ['.claude', '.claude/agents/x.md', '.CLAUDE/x', 'apps/w/.codex/x', 'a/.Codex', '.cOdEx/**', 'apps/web/.Claude/settings.json'];
const unsupported = ['src/@modal/x', 'src/@slot', 'src/(.)x', 'src/(..)photo/x', 'src/(...)x', 'src/(..)(..)x', 'src/a b', 'src/ a', 'src/日本語', 'src/é', 'src/Ａ', '-x', 'src/-x', 'src/~x', 'src/[slug].tsx', 'src/[...slug].tsx'];
const rejected = [...traversalAndMalformed, ...trailingDotGit, ...reservedGit, ...reservedRuntime, ...unsupported];

test('versions are distinct from stable and 0.1 and frozen',()=>{
 assert.equal(lp.PROFILE,'literal-path/0.2');
 const v0=Object.values(lp1.VERSIONS), v2=Object.values(lp.VERSIONS);
 assert.equal(v2.length,7);for(const v of v2){assert.match(v,/\/0\.2$/);assert.equal(v0.includes(v),false);}
 assert.ok(Object.isFrozen(lp.VERSIONS));
});
for(const p of accepted)test('0.2 grammar accepts '+json(p),()=>{
 assert.equal(lp.portableScope(p),true);
 assert.equal(lp.classifyScope(p),null);
 assert.equal(lp.scopeContains(p,p),true);
});
for(const p of rejected)test('0.2 grammar rejects '+json(p),()=>{
 assert.equal(lp.portableScope(p),false);
 assert.equal(lp.scopeContains(p,p),false);
 assert.equal(lp.scopeContains('**',p),false);
 assert.equal(lp.scopeContains('src/**',p),false);
 assert.equal(lp.scopeContains(p,'src/x'),false);
});
test('non-string scopes are rejected',()=>{for(const v of [undefined,null,1,{},[],['src']])assert.equal(lp.portableScope(v),false);});

test('rejected reason classes are reported with the first rejected segment',()=>{
 for(const p of reservedGit)assert.equal(lp.classifyScope(p).reason,'reserved-git',p);
 for(const p of reservedRuntime)assert.equal(lp.classifyScope(p).reason,'runtime-reserved',p);
 for(const p of unsupported)assert.equal(lp.classifyScope(p).reason,'unsupported-shape',p);
 for(const p of ['../x','src//x','src/(ja*)/x','src/[slug','src/x\n','C:/x','src/file.','src/**/x'])assert.equal(lp.classifyScope(p).reason,'malformed',p);
 assert.deepEqual(lp.classifyScope('a/b/.GIT/c'),{index:2,reason:'reserved-git'});
 assert.deepEqual(lp.classifyScope('src/@m/x'),{index:1,reason:'unsupported-shape'});
 assert.deepEqual(lp.classifyScope(''),{index:0,reason:'malformed'});
});

// Each rejected shape fails in every position with the unchanged stable code and path.
for(const p of rejected)test('0.2 rejection codes and paths in all positions '+json(p),async()=>{
 const s=setup('src/ok.ts');
 s.bundle.roles[1].contract.authority.allowed_write_scopes=[p];
 const rb=lp.validateBundle(json(s.bundle));
 assert.equal(rb.valid,false);
 assert.ok(p===''||rb.errors.some(e=>e.code==='WRITE_SCOPE_SYNTAX'&&e.path==='bundle/roles/1'),json(rb.errors));
 const tid='task/inputs/scope',rpath='bundle/roles/1/contract/authority/allowed_write_scopes/0';
 if(p===''){
  // an empty scope is a schema failure (missing content), not a grammar rejection: no WRITE_SCOPE_SYNTAX is invented
  assert.ok(rb.errors.some(e=>e.code==='SCHEMA_PATTERN'&&e.path===rpath),json(rb.errors));
  assert.equal(codes(rb).includes('WRITE_SCOPE_SYNTAX'),false);
 }else{
  const s2=setup('src/ok.ts');s2.task.inputs.scope=p;
  const rt=lp.explainTask(json(s2.bundle),json(s2.task));
  assert.deepEqual(codes(rt),['TASK_WRITE_SCOPE_INVALID']);assert.equal(rt.errors[0].path,tid);
 }
 // G2 action position: the mapping is valid, so the action parameters themselves are what is rejected
 const s3=setup(p),m3=await mapping(s3);m3.path='src/ok.ts';
 const g=await lp.validateFilesystemWriteMapping(json(s3.bundle),json(s3.task),json(s3.action),json(m3));
 assert.equal(g.valid,false);
 assert.ok(g.errors.some(e=>e.code==='G2_ACTION_PARAMETERS'&&e.path==='action/parameters'),json(g.errors));
 // G2 mapping position
 const s4=setup('src/ok.ts');const m=await mapping(s4);m.path=p;
 const gm=await lp.validateFilesystemWriteMapping(json(s4.bundle),json(s4.task),json(s4.action),json(m));
 assert.equal(gm.valid,false);
 assert.ok(gm.errors.some(e=>e.code==='SCHEMA_PATTERN'&&e.path==='mapping/path'),json(gm.errors));
});
test('role .claude/.codex scopes also trigger the unchanged runtime-neutral rule',()=>{
 for(const p of ['.claude/**','.Codex/x','apps/w/.claude/settings.json']){
  const s=setup('src/ok.ts');s.bundle.roles[1].contract.authority.allowed_write_scopes=[p];
  const r=lp.validateBundle(json(s.bundle));
  assert.ok(codes(r).includes('WRITE_SCOPE_SYNTAX'),p);assert.ok(codes(r).includes('RUNTIME_SPECIFIC_DECLARATION'),p);
 }
});
test('B1: a broader role scope never makes a runtime-reserved task or G2 path reachable',async()=>{
 for(const p of ['apps/web/.claude/settings.json','apps/web/.Codex/x','.CLAUDE/agents/x.md']){
  const s=setup(p,'apps/**');s.task.inputs.scope=p;
  assert.deepEqual(codes(lp.explainTask(json(s.bundle),json(s.task))),['TASK_WRITE_SCOPE_INVALID']);
  assert.equal((await validateG2(setup(p,'apps/**'))).valid,false);
 }
 const s=setup('apps/web/.claude/x','apps/**');s.task.inputs.scope='apps/**';
 assert.equal(lp.explainTask(json(s.bundle),json(s.task)).valid,true,'only the declared subtree is a valid scope');
 assert.equal(lp.scopeContains('apps/**','apps/web/.claude/x'),false);
 assert.equal(lp.scopeContains('apps/**','apps/web/.claude/**'),false);
});

test('diagnostics add segment index and reason class without changing codes or paths',()=>{
 const s=setup('src/ok.ts');s.bundle.roles[1].contract.authority.allowed_write_scopes=['src/ok','a/.GIT/b'];
 const r=lp.validateBundle(json(s.bundle));
 const e=r.errors.find(x=>x.code==='WRITE_SCOPE_SYNTAX');
 assert.match(e.message,/segment 2, reason reserved-git/);assert.equal(e.path,'bundle/roles/1');
 const t=setup('src/ok.ts');t.task.inputs.scope='src/@modal/x';
 const rt=lp.explainTask(json(t.bundle),json(t.task));
 assert.match(rt.errors[0].message,/segment 2, reason unsupported-shape/);
 t.task.inputs.scope=7;
 const bad=lp.explainTask(json(t.bundle),json(t.task));
 assert.equal(bad.valid,false);
});
test('multiple bad role scopes each get their own diagnostic in order',()=>{
 const s=setup('src/ok.ts');s.bundle.roles[1].contract.authority.allowed_write_scopes=['x/.git','src/ok','y/@m'];
 const msgs=lp.validateBundle(json(s.bundle)).errors.filter(x=>x.code==='WRITE_SCOPE_SYNTAX').map(x=>x.message).sort();
 assert.equal(msgs.length,2);
 assert.ok(msgs.some(m=>/reserved-git/.test(m)));assert.ok(msgs.some(m=>/unsupported-shape/.test(m)));
});

test('accepted Next.js-style path passes bundle, task, G1 and G2 with fail-closed claims',async()=>{
 const s=setup();
 assert.equal(lp.validateBundle(json(s.bundle)).valid,true);
 const e=lp.explainTask(json(s.bundle),json(s.task));assert.equal(e.valid,true);assert.equal(e.scope_profile,lp.PROFILE);
 const d=await describe(s);assert.equal(d.valid,true);assert.equal(d.binding_profile,lp.VERSIONS.binding);
 const g=await validateG2(s);assert.equal(g.valid,true,json(g.errors));assert.equal(g.adapter_profile,lp.VERSIONS.adapter);
 for(const k of ['execution_authorized','content_bytes_verified','identity_verified','review_authenticated'])assert.equal(g[k],false,k);
 for(const p of accepted.filter(p=>!p.endsWith('/**'))){
  const x=setup(p,p);assert.equal((await validateG2(x)).valid,true,p);
 }
});
test('portableScope and the G2 mapping schema pattern agree on every vector',async()=>{
 for(const p of [...accepted.filter(p=>!p.endsWith('/**')),...rejected]){
  const x=setup('src/ok.ts');const m=await mapping(x);m.path=p;
  const r=await lp.validateFilesystemWriteMapping(json(x.bundle),json(x.task),json(x.action),json(m));
  const schemaRejected=r.errors.some(e=>e.code==='SCHEMA_PATTERN'&&e.path==='mapping/path');
  assert.equal(schemaRejected,!lp.portableScope(p),json(p)+json(r.errors));
 }
 for(const p of accepted.filter(p=>p.endsWith('/**'))){
  const x=setup('src/ok.ts');const m=await mapping(x);m.path=p;
  const r=await lp.validateFilesystemWriteMapping(json(x.bundle),json(x.task),json(x.action),json(m));
  assert.equal(r.valid,false,p);
 }
});
test('G2-only restrictions: device names are scope-valid but not concrete file paths',async()=>{
 for(const p of ['src/CON.txt','src/(ja)/nul','src/aux','src/com1.log','src/LPT9']){
  assert.equal(lp.portableScope(p),true,p);
  assert.equal(lp.explainTask(json(setup('src/ok.ts',p).bundle),json(setup('src/ok.ts',p).task)).valid,true,p);
  assert.ok(codes(await validateG2(setup(p))).includes('G2_ACTION_PARAMETERS'),p);
 }
});
test('G2 mapping must equal the action path byte for byte',async()=>{
 const s=setup('src/app/[locale]/page.tsx');const m=await mapping(s);m.path='src/app/[other]/page.tsx';
 const r=await lp.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(m));
 assert.ok(codes(r).includes('G2_PATH_MISMATCH'));
 m.path='src/App/[locale]/page.tsx';
 assert.ok(codes(await lp.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(m))).includes('G2_PATH_MISMATCH'));
});
test('task scope outside role authority is a distinct outcome from grammar rejection',async()=>{
 const s=setup('lib/x.ts','lib/**');s.task.inputs.scope='src/x';
 assert.deepEqual(codes(lp.explainTask(json(s.bundle),json(s.task))),['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY']);
 const g=setup('src/x',  'lib/**');
 assert.ok(codes(await validateG2(g)).includes('G2_TASK_SCOPE'));
});

test('containment is byte-exact, case-sensitive and symmetric across hidden, underscore and bracket shapes',()=>{
 for(const [a,b,want] of [
  ['src/app/(ja)/**','src/app/(ja)/x',true],['src/app/(ja)/**','src/app/(en)/x',false],['src/app/(ja)/**','src/app/(ja)-evil/x',false],
  ['src/app/(ja)/x','src/app/(ja)/x/**',false],['src/app/(ja)/x','src/app/(ja)/x',true],['src/**','src/app/(en)/x',true],['src/**','src/(group-1.2_3)/x',true],
  ['src/[slug]/**','src/[slug]/x',true],['src/[slug]/**','src/[other]/x',false],['src/[slug]/**','src/slug/x',false],['src/[a-z]/**','src/b/x',false],['src/[a-z]/**','src/[a-z]/x',true],['src/[0-9]','src/5',false],['src/slug/**','src/[slug]/x',false],
  ['src/[...slug]','src/[...slug]',true],['src/[...slug]','src/[[...slug]]',false],['src/[[...slug]]/**','src/[[...slug]]/a',true],
  ['src/**','src/.env',true],['src/**','src/.env/**',true],['src/**','src/_private/x',true],['src/**','src/[slug]/x',true],
  ['src/**','src',true],['src/**','srcx/y',false],['src/**','src2',false],['src/x','src/x/**',false],['src/**','src/**',true],['src/a/**','src/**',false],
  ['src/App/**','src/app/x',false],['src/app/**','src/App/x',false],['src/**','Src/x',false],
  ['src/.hidden/**','src/.hidden/a',true],['src/.hidden','src/.hidden2',false],['.github/**','.github/workflows/ci.yml',true],['.github/**','.git/x',false],['.git/**','.git/x',false],
  ['src/**','src/.git/x',false],['src/**','src/.CLAUDE/x',false],
  ['src/**','src/a\u0301',false],['src/**','src/a b',false],
 ])assert.equal(lp.scopeContains(a,b),want,json([a,b]));
});
test('B2: a /** scope is wider in 0.2 than in stable and 0.1; protected scopes use the same rule',()=>{
 for(const p of ['src/.env','src/_x','src/[slug]/x']){
  assert.equal(stableContains('src/**',p),false,p);assert.equal(lp1.scopeContains('src/**',p),false,p);assert.equal(lp.scopeContains('src/**',p),true,p);
 }
 assert.equal(lp1.portableScope('src/[slug]/x'),false);assert.equal(lp1.portableScope('src/.hidden/x'),false);
});
test('trailing dot is the one documented exception to "0.2 accepts every 0.1-valid path"',()=>{
 assert.equal(lp1.portableScope('src/file.'),true);assert.equal(lp.portableScope('src/file.'),false);
 const samples=['a','a/b','a.b/c-d_e','(g)/x','src/(ja)/page.tsx','src/**','A1.b2-c3/**','x..y','a-/b'];
 for(const p of samples){assert.equal(lp1.portableScope(p),true,p);assert.equal(lp.portableScope(p),true,p);}
});
test('no normalization: look-alike, encoded and decomposed forms are rejected, never converted',()=>{
 for(const p of ['src/%2e%2e/x','src/%2Egit/x','src/.g\u0131t/x','src/\uff0egit/x','src/\u2024git','src/.\u0067it\u200b','src/a\u0301','src/\u212Aey'])assert.equal(lp.portableScope(p),false,json(p));
});
test('long pathological segments are rejected without catastrophic backtracking',()=>{
 const t=Date.now();
 for(const p of ['a'.repeat(200000)+'.','.'+'a'.repeat(200000)+'.','['.repeat(50000),'('.repeat(50000),'a/'.repeat(50000)+'*','a.'.repeat(100000)+'.'])lp.portableScope(p);
 assert.ok(Date.now()-t<3000,'elapsed '+(Date.now()-t));
 assert.equal(lp.portableScope('a'.repeat(100000)),true);
});

test('domain separation: stable, 0.1 and 0.2 produce three distinct digests for the same ordinary declaration',async()=>{
 const s=setup('src/example.mjs');
 const old=structuredClone(s);old.bundle.schema_version='0.1';old.task.schema_version='0.1';
 const v1=structuredClone(s);v1.bundle.schema_version=lp1.VERSIONS.bundle;v1.task.schema_version=lp1.VERSIONS.task;
 const dStable=await stable.describeTaskAction(json(old.bundle),json(old.task),json(old.action));
 const d01=await lp1.describeTaskAction(json(v1.bundle),json(v1.task),json(v1.action));
 const d02=await describe(s);
 for(const d of [dStable,d01,d02])assert.equal(d.valid,true,json(d.errors));
 assert.equal(new Set([dStable.subject_digest,d01.subject_digest,d02.subject_digest]).size,3);
 for(const [d,profile] of [[dStable,'stable'],[d01,'0.1']]){
  const b={schema_version:'0.3',subject_digest:d.subject_digest,reviews:[{subject_digest:d.subject_digest,role_id:'reviewer',decision:'pass'}],human_approval:{subject_digest:d.subject_digest,role_id:'coordinator',decision:'approved'}};
  const r=await lp.validateTaskActionBinding(json(s.bundle),json(s.task),json(s.action),json(b));
  assert.ok(codes(r).includes('G1_SUBJECT_MISMATCH'),profile);assert.equal(r.valid,false);
 }
 const cur=d02.subject_digest;
 const good={schema_version:'0.3',subject_digest:cur,reviews:[{subject_digest:cur,role_id:'reviewer',decision:'pass'}],human_approval:{subject_digest:cur,role_id:'coordinator',decision:'approved'}};
 assert.equal((await lp.validateTaskActionBinding(json(s.bundle),json(s.task),json(s.action),json(good))).valid,true);
 // A 0.2 digest cannot validate under 0.1 either.
 assert.ok(codes(await lp1.validateTaskActionBinding(json(v1.bundle),json(v1.task),json(v1.action),json(good))).includes('G1_SUBJECT_MISMATCH'));
});
test('G1 subject changes when the path text changes within 0.2',async()=>{
 const a=await describe(setup('src/[a]/x.ts')),b=await describe(setup('src/[b]/x.ts'));
 assert.notEqual(a.subject_digest,b.subject_digest);
});
test('mixed or unknown versions fail closed on every 0.2 API and 0.2 inputs fail on stable and 0.1',async()=>{
 const s=setup('src/ok.ts');
 for(const [bv,tv] of [['0.1','0.1'],[lp1.VERSIONS.bundle,lp1.VERSIONS.task],[lp.VERSIONS.bundle,lp1.VERSIONS.task],[lp1.VERSIONS.bundle,lp.VERSIONS.task],[lp.VERSIONS.bundle,'0.1'],['0.1',lp.VERSIONS.task],['literal-path-bundle/9',lp.VERSIONS.task],[lp.VERSIONS.bundle,'literal-path-task/0.20']]){
  const x=structuredClone(s);x.bundle.schema_version=bv;x.task.schema_version=tv;
  assert.equal(lp.explainTask(json(x.bundle),json(x.task)).valid,false,bv+tv);
  assert.equal((await describe(x)).valid,false,bv+tv);
  assert.equal((await validateG2(x)).valid,false,bv+tv);
 }
 const x=structuredClone(s);x.bundle.schema_version=lp1.VERSIONS.bundle;assert.equal(lp.validateBundle(json(x.bundle)).valid,false);
 assert.equal(stable.explainTask(json(s.bundle),json(s.task)).valid,false);
 assert.equal(lp1.explainTask(json(s.bundle),json(s.task)).valid,false);
 const m=await mapping(s);m.schema_version=lp1.VERSIONS.mapping;
 assert.equal((await lp.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(m))).valid,false);
 const m1=await mapping(s);m1.schema_version='0.1';
 assert.equal((await lp.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(m1))).valid,false);
});

function repository(t,files){
 const root=fs.mkdtempSync(join(os.tmpdir(),'arc-lp02-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo'), config=join(root,'empty-git-config');
 fs.mkdirSync(repo);fs.writeFileSync(config,'');
 const git=args=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','-q']);git(['config','user.name','Synthetic Fixture']);git(['config','user.email','fixture@example.invalid']);
 const write=(p,c)=>{fs.mkdirSync(join(repo,p,'..'),{recursive:true});fs.writeFileSync(join(repo,p),c);};
 write('README.md','base\n');git(['add','.']);git(['commit','-qm','base']);const base=git(['rev-parse','HEAD']);
 for(const p of files)write(p,'candidate\n');
 git(['add','.']);git(['commit','-qm','candidate']);return {repo,base,candidate:git(['rev-parse','HEAD'])};
}
const envelope=(s,g,over={})=>({schema_version:lp.VERSIONS.envelope,task_id:s.task.id,baseline_commit:g.base,candidate_commit:g.candidate,allowed_paths:['src/**'],protected:[],required_tests:['t'],...over});
const args=(s,g,env)=>({repo:g.repo,envelope:json(env),bundle:json(s.bundle),task:json(s.task)});
test('real Git inventory over hidden, underscore, bracket and group files; no invented evidence',async t=>{
 const files=['src/app/[locale]/(m)/_c/hero.tsx','src/.hidden/a','src/_p/b','src/[...slug]/c','src/[[...opt]]/d'];
 const g=repository(t,files),s=setup();
 const r=await lp.evaluate(args(s,g,envelope(s,g,{allowed_paths:files})));
 assert.equal(r.report_kind,lp.VERSIONS.report);assert.equal(r.inventory.count,files.length);
 assert.equal(r.dimensions.artifact_binding.status,'CONSISTENT');
 assert.equal(r.dimensions.test_evidence.status,'UNKNOWN');assert.equal(r.dimensions.semantic_acceptance.status,'UNKNOWN');
 assert.equal(r.dimensions.execution.status,'NOT_PERFORMED');assert.equal(r.g1.binding_profile,lp.VERSIONS.binding);
 const tree=await lp.evaluate(args(s,g,envelope(s,g)));
 assert.equal(tree.dimensions.artifact_binding.status,'CONSISTENT');
});
test('B2: protected src/** reports a changed hidden descendant; an inexpressible changed path is never silently in scope',async t=>{
 // the only change under protected src/** is a hidden descendant: no ordinary changed file under src makes this pass
 const g=repository(t,['lib/ok.ts','src/.env']),s=setup();
 const prot=await lp.evaluate(args(s,g,envelope(s,g,{allowed_paths:['lib/**'],protected:[{id:'src-tree',type:'path',path:'src/**'}]})));
 assert.ok(prot.findings.some(f=>f.code==='PROTECTED_PATH_CHANGED'&&f.path==='src/**'),json(prot.findings));
 assert.equal(prot.protected.find(p=>p.id==='src-tree').status,'CHANGED');
 // control: nothing under the protected scope changes
 const gc=repository(t,['lib/ok.ts']);
 const ctl=await lp.evaluate(args(s,gc,envelope(s,gc,{allowed_paths:['lib/**'],protected:[{id:'src-tree',type:'path',path:'src/**'}]})));
 assert.equal(ctl.findings.some(f=>f.code==='PROTECTED_PATH_CHANGED'),false,json(ctl.findings));
 assert.equal(ctl.protected.find(p=>p.id==='src-tree').status,'UNCHANGED');
 const gw=repository(t,['src/.env','src/ok.ts','src/a b.ts']);
 const wide=await lp.evaluate(args(s,gw,envelope(s,gw)));
 assert.ok(wide.findings.some(f=>f.code==='PATH_OUT_OF_SCOPE'&&f.path==='src/a b.ts'),json(wide.findings));
 assert.equal(wide.findings.some(f=>f.code==='PATH_OUT_OF_SCOPE'&&f.path==='src/.env'),false);
 assert.equal(wide.dimensions.artifact_binding.status==='CONSISTENT',false);
 // a committed runtime-reserved path is never in scope, even under a broad grant
 const gr=repository(t,['src/.claude/settings.json']);
 const rsv=await lp.evaluate(args(s,gr,envelope(s,gr,{allowed_paths:['src/**']})));
 assert.ok(rsv.findings.some(f=>f.code==='PATH_OUT_OF_SCOPE'&&f.path==='src/.claude/settings.json'),json(rsv.findings));
 assert.notEqual(rsv.dimensions.artifact_binding.status,'CONSISTENT');
});
test('envelope validation rejects every unsupported or reserved allowed/protected path and other versions',async t=>{
 const g=repository(t,['src/ok.ts']),s=setup();
 for(const p of rejected.filter(p=>p!==''||true))await assert.rejects(lp.evaluate(args(s,g,envelope(s,g,{allowed_paths:[p]}))),e=>e.code==='ENVELOPE_INVALID',json(p));
 for(const p of ['.GIT/x','a/.claude/x','src/a b','src/@m'])await assert.rejects(lp.evaluate(args(s,g,envelope(s,g,{protected:[{id:'p',type:'path',path:p}]}))),e=>e.code==='ENVELOPE_INVALID',p);
 await assert.rejects(lp.evaluate(args(s,g,envelope(s,g,{schema_version:lp1.VERSIONS.envelope}))),e=>e.code==='ENVELOPE_INVALID');
 await assert.rejects(lp1.evaluate(args(s,g,envelope(s,g))),e=>e.code==='ENVELOPE_INVALID');
});
test('package metadata keeps the experiment out of the published files',()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.files.some(f=>f.startsWith('experiments')||f==='.'||f==='*'),false);
 assert.equal(Object.keys(pkg.exports||{}).some(k=>/literal/.test(k)),false);
});
