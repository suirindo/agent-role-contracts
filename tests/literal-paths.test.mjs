import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as literal from '../experiments/literal-paths/profile.mjs';
import * as stable from '../src/core.mjs';
import {scopeContains as oldContains} from '../src/validation.mjs';
import {validateFilesystemWriteMapping as oldMapping} from '../src/filesystem-write-adapter.mjs';
import {evaluate as oldEvaluate} from '../experiments/review-evidence/review-evidence.mjs';
const json = JSON.stringify;
const load = name => JSON.parse(fs.readFileSync(new URL('../examples/'+name+'.json',import.meta.url),'utf8'));
const setup = (path='src/app/(ja)/page.tsx') => {
 const bundle=load('team'), task=load('code-task');
 bundle.schema_version=literal.VERSIONS.bundle;task.schema_version=literal.VERSIONS.task;
 bundle.roles[1].contract.authority.allowed_write_scopes=['src/**'];task.inputs.scope='src/**';
 const action={schema_version:'0.3',id:'write-1',kind:'filesystem-write',parameters:{path,content_sha256:'sha256:'+'a'.repeat(64)}};
 return {bundle,task,action};
};
const describe = s => literal.describeTaskAction(json(s.bundle),json(s.task),json(s.action));
const mapping = async s => ({schema_version:literal.VERSIONS.mapping,subject_digest:(await describe(s)).subject_digest,operation:'write_file',...s.action.parameters});
const validate = async s => literal.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(await mapping(s)));
test('explicit literal versions accept group paths in role, task, G1 and G2; old APIs refuse new declarations',async()=>{
 const s=setup();s.bundle.roles[1].contract.authority.allowed_write_scopes=['src/app/(ja)/**'];s.task.inputs.scope='src/app/(ja)/**';
 assert.equal(literal.validateBundle(json(s.bundle)).valid,true);
 assert.equal(literal.explainTask(json(s.bundle),json(s.task)).valid,true);
 const d=await describe(s);assert.equal(d.valid,true);assert.equal(d.binding_profile,literal.VERSIONS.binding);
 const r=await validate(s);assert.equal(r.valid,true,json(r.errors));assert.equal(r.adapter_profile,literal.VERSIONS.adapter);
 for(const k of ['execution_authorized','content_bytes_verified','identity_verified','review_authenticated'])assert.equal(r[k],false,k);
 assert.equal(stable.explainTask(json(s.bundle),json(s.task)).valid,false);
 assert.equal((await oldMapping(json(s.bundle),json(s.task),json(s.action),json(await mapping(s)))).valid,false);
});
test('no implicit upgrade; old version and unknown profile versions remain invalid',async()=>{
 const s=setup();s.bundle.schema_version='0.1';s.task.schema_version='0.1';
 assert.equal(literal.explainTask(json(s.bundle),json(s.task)).valid,false);
 assert.equal(oldContains('src/**',s.action.parameters.path),false);
 s.bundle.schema_version='literal-path-bundle/9';assert.equal(literal.validateBundle(json(s.bundle)).valid,false);
});
const bad=['../x','/src/x','C:/x','src\\x','src//x','src/./x','src/../x','src/()','src/((ja))/x','src/(ja/x)','src/(ja*)/x','src/(ja)/../x','src/%28ja%29/x','src/(ja)/x\n','src/(ja)/x\r','src/(ja)/x\u2028','src/(ja)/x\0','src/[slug]/x','src/.hidden/x','src/(ja)x/x','src/(ja)/x/**/y'];
for(const path of bad)test('malformed literal path is rejected throughout '+json(path),async()=>{
 assert.equal(literal.portableScope(path),false);
 const s=setup(path);s.task.inputs.scope=path;
 assert.equal(literal.explainTask(json(s.bundle),json(s.task)).valid,false);
 s.task.inputs.scope='src/**';
 assert.equal((await validate(s)).valid,false);
 s.bundle.roles[1].contract.authority.allowed_write_scopes=[path];
 assert.equal(literal.validateBundle(json(s.bundle)).valid,false);
});
test('literal containment retains segment, sibling and exact-file boundaries',()=>{
 for(const [a,b,want] of [
 ['src/app/(ja)/**','src/app/(ja)/x',true],['src/app/(ja)/**','src/app/(en)/x',false],
 ['src/app/(ja)/**','src/app/(ja)-evil/x',false],['src/app/(ja)/x','src/app/(ja)/x/**',false],
 ['src/app/(ja)/x','src/app/(ja)/x',true],['src/**','src/app/(en)/x',true],
 ['src/**','src/(group-1.2_3)/x',true],
 ])assert.equal(literal.scopeContains(a,b),want,json([a,b]));
});
test('G2 additional portability restrictions remain; literal path bytes are never normalized',async()=>{
 for(const p of ['src/(ja)/CON.txt','src/(ja)/file.'])assert.equal((await validate(setup(p))).valid,false);
 const s=setup();const m=await mapping(s);m.path='src/app/(en)/page.tsx';
 const r=await literal.validateFilesystemWriteMapping(json(s.bundle),json(s.task),json(s.action),json(m));
 assert.ok(r.errors.some(e=>e.code==='G2_PATH_MISMATCH'));
});
test('profile/version identity changes invalidate old G1 bindings on ordinary paths',async()=>{
 const s=setup('src/example.mjs'), old=structuredClone(s);old.bundle.schema_version='0.1';old.task.schema_version='0.1';
 const d=await stable.describeTaskAction(json(old.bundle),json(old.task),json(old.action));
 assert.equal(d.valid,true);const current=await describe(s);assert.notEqual(d.subject_digest,current.subject_digest);
 const binding={schema_version:'0.3',subject_digest:d.subject_digest,reviews:[{subject_digest:d.subject_digest,role_id:'reviewer',decision:'pass'}],human_approval:{subject_digest:d.subject_digest,role_id:'coordinator',decision:'approved'}};
 const r=await literal.validateTaskActionBinding(json(s.bundle),json(s.task),json(s.action),json(binding));
 assert.ok(r.errors.some(e=>e.code==='G1_SUBJECT_MISMATCH'));
 binding.subject_digest=current.subject_digest;binding.reviews[0].subject_digest=current.subject_digest;binding.human_approval.subject_digest=current.subject_digest;
 assert.equal((await literal.validateTaskActionBinding(json(s.bundle),json(s.task),json(s.action),json(binding))).valid,true);
});
test('no scope-only permission escalation; G1 reviewer and role authority rules are reused',async()=>{
 const s=setup();s.bundle.roles[1].contract.authority.allowed_write_scopes=['src/app/(en)/**'];
 s.task.inputs.scope='src/app/(ja)/**';assert.equal(literal.explainTask(json(s.bundle),json(s.task)).valid,false);
 const x=setup();x.bundle.routes.find(r=>r.task_type===x.task.type).reviewers=['implementer'];
 assert.equal(literal.explainTask(json(x.bundle),json(x.task)).valid,false);
});
function repository(t){
 const root=fs.mkdtempSync(join(os.tmpdir(),'arc-literal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo'), config=join(root,'empty-git-config');
 fs.mkdirSync(repo);fs.writeFileSync(config,'');
 const git=args=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','-q']);git(['config','user.name','Synthetic Fixture']);git(['config','user.email','fixture@example.invalid']);
 fs.mkdirSync(join(repo,'src/app/(ja)'),{recursive:true});fs.writeFileSync(join(repo,'src/app/(ja)/page.tsx'),'base\n');
 git(['add','.']);git(['commit','-qm','base']);const base=git(['rev-parse','HEAD']);
 fs.writeFileSync(join(repo,'src/app/(ja)/page.tsx'),'candidate\n');fs.writeFileSync(join(repo,'src/ordinary.ts'),'new\n');
 git(['add','.']);git(['commit','-qm','candidate']);return {repo,base,candidate:git(['rev-parse','HEAD'])};
}
test('real Git inventory and faithful group envelope; no invented tests or semantic verdict',async t=>{
 const g=repository(t),s=setup();const envelope={schema_version:literal.VERSIONS.envelope,task_id:s.task.id,baseline_commit:g.base,candidate_commit:g.candidate,allowed_paths:['src/app/(ja)/page.tsx','src/ordinary.ts'],protected:[],required_tests:['real-test']};
 const args={repo:g.repo,envelope:json(envelope),bundle:json(s.bundle),task:json(s.task)};
 const r=await literal.evaluate(args);assert.equal(r.report_kind,literal.VERSIONS.report);
 assert.equal(r.inventory.count,2);assert.equal(r.dimensions.artifact_binding.status,'CONSISTENT');
 assert.equal(r.dimensions.test_evidence.status,'UNKNOWN');assert.equal(r.dimensions.semantic_acceptance.status,'UNKNOWN');
 assert.equal(r.dimensions.authority.status,'UNKNOWN');assert.equal(r.dimensions.execution.status,'NOT_PERFORMED');
 assert.equal(r.g1.binding_profile,literal.VERSIONS.binding);
 await assert.rejects(oldEvaluate(args),e=>e.code==='ENVELOPE_INVALID');
 for(const path of bad)await assert.rejects(literal.evaluate({...args,envelope:json({...envelope,allowed_paths:[path]})}),e=>e.code==='ENVELOPE_INVALID');
 const narrowed=await literal.evaluate({...args,envelope:json({...envelope,allowed_paths:['src/ordinary.ts']})});
 assert.ok(narrowed.findings.some(f=>f.code==='PATH_OUT_OF_SCOPE'&&f.path==='src/app/(ja)/page.tsx'));
 const protectedReport=await literal.evaluate({...args,envelope:json({...envelope,protected:[{id:'group',type:'path',path:'src/app/(ja)/**'}]})});
 assert.ok(protectedReport.findings.some(f=>f.code==='PROTECTED_PATH_CHANGED'));
});
