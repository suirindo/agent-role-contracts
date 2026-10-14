import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const publishedTarballSHA256 = '5ec610d7158bbccc377337f0272c824ce9c46381a9b0f24edd4126d32100ef13';
const maxTarballBytes = 2 * 1024 * 1024;
const schemaHashes = {
  'bundle.schema.json': '87541def31c783a2023c6de3d69004ddb83322559a202b35ef39b0e937917375',
  'filesystem-write-mapping.schema.json': '601b6f69c79ce8e315ae88cf4be6e2cc125045e0f8af42d3b276b724296d63d6',
  'financial-execution.schema.json': '2f68aad21dbbfc0eb0a10a7378b7bdd63ee9ca21dd4b83e16ee75aba74b6f3a3',
  'financial-intent.schema.json': '309f64d872af6cb7ee33538a014e9ddedbfed43dea1036bda596e429b34c8ea2',
  'financial-policy.schema.json': '2be652292eb7fd60eadb68486081b8e5322474ba047dd9e4dac78856174e8a35',
  'handoff.schema.json': '4e01c47210f670f69f5aed869b102717f250a0425fda6b5e3be8894500e9aa1e',
  'role-contract.schema.json': '2061c773d7806324880e59da25312b74a8d41f24b6d1fa673eeb85f2a94d4129',
  'safe-proposal.schema.json': '2ecc870f27dec1386d2dc259b30b92e4c211cf7c724ae47ec89db22a89d4497a',
  'task-action-binding.schema.json': 'de830fc522e29ac343c0fcef5e3529a980fcd85470b6f80def933e71beddb1dc',
  'task-action.schema.json': '4b8afd5bb26600f269248356bd40d9be5460cf3aa8ef211496104648f6a9d071',
  'task-lifecycle.schema.json': '4359acfca3fc9cba8c027e23474b5f06ba7a78336463666a74b3da5fba565528',
  'task.schema.json': 'a6ef6cbf7e439e09dbc605dbf844a623642728c17aba091f07c2f4b19e16489f',
};
const fixtureHashes = {
  'examples/starter-bundle.json': '80896fdce4b047969954275e659061031b9b5d668b4d66b6a1541d8df4caab6c',
  'examples/starter-task.json': '86845f79369bd0a5cb06715771505bc4192977d69bf57942405ed1610594cc7c',
  'examples/starter-task-outside-scope.json': 'f766593225ef76d9930a25183aed48c92c9d9d2cbbb579b986a2b3872a24e671',
  'examples/team.json': '648ad076f29d7768383059e2b740e7db8d8cf15ba925e9204d7712d9a21177e1',
  'examples/task.json': '63244fdaf01bcc5d161dda81789f17de71aa24e7c5b964832f6fa14bfb5501f7',
  'examples/handoff.json': '695c53e0f759c126dbda471e0cea525d82a3a52684cfd9018e4fce2550d4f049',
  'examples/onchain-finance/bundle.json': 'e00b2250479c61892c8fa10c31525dd5b1233ebbdb7714aa5a9d74ae6a443f69',
  'examples/onchain-finance/task.json': '6f8efab4e2ab4c1cd2a5d0c43c6c5aaa1e834b61c1ca6d49c5edf61eeeaaf156',
  'examples/onchain-finance/policy.json': '89c8f685c9e87e48333da18bd0ba9d860f03a2955d74e2417a4423dca96f92c8',
  'examples/onchain-finance/transaction.json': '5e4020130f46613476ab53b094052b4a36d0f6022823d34eb00a8bdb9c5d00ec',
  'examples/onchain-finance/intent.json': '6d3d1d8542229b9c12c54cb13bb92d63f86bc9fe8293c780a5543f4299b830f9',
  'examples/onchain-finance/execution.json': 'b2202ea22b263d19293dd2199bb7143f094082a48bdbfa3a334204c86f2baf8a',
  'examples/onchain-finance/safe-proposal.json': '1de0e25efa79a832df866c46d94f9a0146acc73807f935617dafaad8a6c66aed',
};

function runNode(args, cwd, env = process.env, timeout = 60_000) {
  return spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024});
}
function pass(result, label) {
  assert.equal(result.signal, null, `${label}: signal ${result.signal}`);
  assert.equal(result.error, undefined, `${label}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

// Guard the deliberately small workflow's literal include rows, without adding
// a YAML dependency to this dependency-free checker.
test('CI retains all four required compatibility jobs and their checks', () => {
  const workflow = readFileSync(new URL('../.github/workflows/core.yml', import.meta.url), 'utf8');
  const rows = [...workflow.matchAll(/^          - os: ([\w-]+)\r?\n            node: '([^']+)'$/gm)]
    .map(([, os, node]) => `${os}/${node}`);
  for (const required of ['ubuntu-latest/22.5.0', 'ubuntu-latest/24', 'macos-latest/22', 'windows-latest/22']) {
    assert.ok(rows.includes(required), `Missing compatibility job: ${required}`);
  }
  assert.match(workflow, /^    runs-on: \$\{\{ matrix\.os \}\}$/m);
  assert.match(workflow, /^          node-version: \$\{\{ matrix\.node \}\}$/m);
  for (const command of ['npm run check', 'node --test .github/release/*.test.mjs', 'npm run pack:smoke']) {
    assert.ok(workflow.includes(`      - run: ${command}`), `Missing matrix check: ${command}`);
  }
});

const observer = String.raw`
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as root from '@netsujo/agent-role-contracts';
import * as core from '@netsujo/agent-role-contracts/core';
import * as finance from '@netsujo/agent-role-contracts/profiles/onchain-finance';
import * as adapter from '@netsujo/agent-role-contracts/adapters/filesystem-write';
const [fixtureRoot, expectedSchemaHashesJson] = process.argv.slice(1);
const expectedSchemaHashes=JSON.parse(expectedSchemaHashesJson), read=p=>readFileSync(join(fixtureRoot,p),'utf8');
const json=JSON.stringify, hash=b=>createHash('sha256').update(b).digest('hex');
const coreNames=['MAX_INPUT_BYTES','VERSION','describeTaskAction','describeTaskLifecycle','explainTask','validateBundle','validateHandoff','validateTaskActionBinding','validateTaskLifecycle'].sort();
const financeNames=['describeFinancialIntent','validateFinancialExecution','validateFinancialIntent','validateSafeProposal'].sort();
assert.deepEqual(Object.keys(core).sort(),coreNames);assert.deepEqual(Object.keys(finance).sort(),financeNames);
assert.deepEqual(Object.keys(adapter),['validateFilesystemWriteMapping']);assert.deepEqual(Object.keys(root).sort(),[...coreNames,...financeNames].sort());
for(const [name,value] of Object.entries({...core,...finance}))assert.equal(root[name],value,name);
const schemas={};for(const [name,expected] of Object.entries(expectedSchemaHashes)){
 const url=import.meta.resolve('@netsujo/agent-role-contracts/schemas/'+name),bytes=readFileSync(fileURLToPath(url));
 assert.equal(hash(bytes),expected,name);const imported=await import(url,{with:{type:'json'}});assert.equal(imported.default.type,'object');schemas[name]=hash(bytes);
}
const b=read('examples/starter-bundle.json'),t=read('examples/starter-task.json'),route=JSON.parse(b).routes[0];
const action={schema_version:'0.3',id:'baseline-action',kind:'propose-change',parameters:{revision:1}};
const subject=await core.describeTaskAction(b,t,json(action));assert.equal(subject.subject_digest,'sha256:84eb08c51c7945bf8bcc781e780f3dc62c7d9097655707e7561375cc61556310');
const binding={schema_version:'0.3',subject_digest:subject.subject_digest,reviews:[{role_id:route.reviewers[0],decision:'pass',subject_digest:subject.subject_digest}],human_approval:{role_id:route.accountable,decision:'approved',subject_digest:subject.subject_digest}};
const bound=await core.validateTaskActionBinding(b,t,json(action),json(binding));assert.equal(bound.valid,true);
const staleAction=structuredClone(action);staleAction.parameters.revision=2;const stale=await core.validateTaskActionBinding(b,t,json(staleAction),json(binding));assert.equal(stale.valid,false);assert.ok(stale.errors.some(e=>e.code==='G1_SUBJECT_MISMATCH'));
const outside=core.explainTask(b,read('examples/starter-task-outside-scope.json'));assert.equal(outside.valid,false);assert.ok(outside.errors.some(e=>e.code==='TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'));
const writeAction={schema_version:'0.3',id:'packed-write',kind:'filesystem-write',parameters:{path:JSON.parse(t).inputs.scope,content_sha256:'sha256:'+'a'.repeat(64)}};
const writeDigest='sha256:9d29fe0f0b420780db56aeaf168c83ce2cdfcb42b06511f491674a962fb39a8b';
const mapping={schema_version:'0.1',subject_digest:writeDigest,operation:'write_file',...writeAction.parameters};
const mapped=await adapter.validateFilesystemWriteMapping(b,t,json(writeAction),json(mapping));assert.equal(mapped.valid,true);
const lifecycle={schema_version:'0.4',run_id:'packed-conformance',subject_digest:subject.subject_digest,events:[{event_id:'review',phase:'review',actor_role_id:route.reviewers[0],decision:'pass',subject_digest:subject.subject_digest},{event_id:'approval',phase:'approval',actor_role_id:route.accountable,decision:'approved',subject_digest:subject.subject_digest}]};
const described=await core.describeTaskLifecycle(b,t,json(action),json(lifecycle)),life=await core.validateTaskLifecycle(b,t,json(action),json(lifecycle));assert.equal(life.valid,true);
const fb=read('examples/onchain-finance/bundle.json'),ft=read('examples/onchain-finance/task.json'),fp=read('examples/onchain-finance/policy.json'),fi=read('examples/onchain-finance/intent.json');
const reports={
 bundle:core.validateBundle(read('examples/team.json')),explain:core.explainTask(read('examples/team.json'),read('examples/task.json')),handoff:core.validateHandoff(read('examples/team.json'),read('examples/task.json'),read('examples/handoff.json')),
 subject,bound,stale,outside,mapped,described,life,
 financeSubject:await finance.describeFinancialIntent(fb,ft,fp,read('examples/onchain-finance/transaction.json')),
 finance:await finance.validateFinancialIntent(fb,ft,fp,fi,'2030-01-01T00:00:05Z'),
 financeExecution:await finance.validateFinancialExecution(fb,ft,fp,fi,read('examples/onchain-finance/execution.json'),'2030-01-01T00:00:05Z'),
 financeSafe:await finance.validateSafeProposal(fb,ft,fp,fi,read('examples/onchain-finance/safe-proposal.json'),'2030-01-01T00:00:05Z')};
for(const report of Object.values(reports)){assert.equal(report.execution_authorized,false);assert.equal(typeof report.kind,'string');assert.ok(Array.isArray(report.errors));}
assert.equal(typeof core.validateBundle(b)?.then,'undefined');assert.equal(typeof core.explainTask(b,t)?.then,'undefined');
assert.equal(typeof core.validateHandoff(read('examples/team.json'),read('examples/task.json'),read('examples/handoff.json'))?.then,'undefined');
for(const promise of [core.describeTaskAction(b,t,json(action)),core.validateTaskActionBinding(b,t,json(action),json(binding)),core.describeTaskLifecycle(b,t,json(action),json(lifecycle)),core.validateTaskLifecycle(b,t,json(action),json(lifecycle)),adapter.validateFilesystemWriteMapping(b,t,json(writeAction),json(mapping)),finance.validateFinancialIntent(fb,ft,fp,fi,'2030-01-01T00:00:05Z'),finance.describeFinancialIntent(fb,ft,fp,read('examples/onchain-finance/transaction.json')),finance.validateFinancialExecution(fb,ft,fp,fi,read('examples/onchain-finance/execution.json'),'2030-01-01T00:00:05Z'),finance.validateSafeProposal(fb,ft,fp,fi,read('examples/onchain-finance/safe-proposal.json'),'2030-01-01T00:00:05Z')])assert.equal(typeof promise.then,'function');
const pkgRoot=dirname(dirname(fileURLToPath(import.meta.resolve('@netsujo/agent-role-contracts/core')))),cli=join(pkgRoot,'bin','agent-role-contracts.mjs');
const metadata=JSON.parse(readFileSync(join(pkgRoot,'package.json'),'utf8'));assert.equal(metadata.name,'@netsujo/agent-role-contracts');assert.equal(core.VERSION,metadata.version);assert.equal(core.MAX_INPUT_BYTES,1048576);
const p=x=>join(fixtureRoot,x), cliRun=args=>{const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024});assert.equal(r.signal,null);assert.equal(r.error,undefined);return {status:r.status,stdout:r.stdout,stderr:r.stderr};};
const commandArgs={
 validate:['--bundle',p('examples/team.json')],explain:['--bundle',p('examples/team.json'),'--task',p('examples/task.json')],handoff:['--bundle',p('examples/team.json'),'--task',p('examples/task.json'),'--handoff',p('examples/handoff.json')],
 'action-subject':['--bundle',p('examples/starter-bundle.json'),'--task',p('examples/starter-task.json'),'--action',p('generated/action.json')],
 'action-bind':['--bundle',p('examples/starter-bundle.json'),'--task',p('examples/starter-task.json'),'--action',p('generated/action.json'),'--binding',p('generated/binding.json')],
 'adapter-filesystem-write':['--bundle',p('examples/starter-bundle.json'),'--task',p('examples/starter-task.json'),'--action',p('generated/write-action.json'),'--mapping',p('generated/mapping.json')],
 'lifecycle-describe':['--bundle',p('examples/starter-bundle.json'),'--task',p('examples/starter-task.json'),'--action',p('generated/action.json'),'--lifecycle',p('generated/lifecycle.json')],
 lifecycle:['--bundle',p('examples/starter-bundle.json'),'--task',p('examples/starter-task.json'),'--action',p('generated/action.json'),'--lifecycle',p('generated/lifecycle.json')],
 'finance-subject':['--bundle',p('examples/onchain-finance/bundle.json'),'--task',p('examples/onchain-finance/task.json'),'--policy',p('examples/onchain-finance/policy.json'),'--transaction',p('examples/onchain-finance/transaction.json')],
 finance:['--bundle',p('examples/onchain-finance/bundle.json'),'--task',p('examples/onchain-finance/task.json'),'--policy',p('examples/onchain-finance/policy.json'),'--intent',p('examples/onchain-finance/intent.json'),'--at','2030-01-01T00:00:05Z'],
 'finance-execution':['--bundle',p('examples/onchain-finance/bundle.json'),'--task',p('examples/onchain-finance/task.json'),'--policy',p('examples/onchain-finance/policy.json'),'--intent',p('examples/onchain-finance/intent.json'),'--receipt',p('examples/onchain-finance/execution.json'),'--at','2030-01-01T00:00:05Z'],
 'finance-safe':['--bundle',p('examples/onchain-finance/bundle.json'),'--task',p('examples/onchain-finance/task.json'),'--policy',p('examples/onchain-finance/policy.json'),'--intent',p('examples/onchain-finance/intent.json'),'--safe-proposal',p('examples/onchain-finance/safe-proposal.json'),'--at','2030-01-01T00:00:05Z']};
const kinds={validate:'bundle',explain:'explain',handoff:'handoff','action-subject':'task-action','action-bind':'task-action-binding','adapter-filesystem-write':'filesystem-write-mapping','lifecycle-describe':'task-lifecycle',lifecycle:'task-lifecycle-validation','finance-subject':'financial-subject',finance:'financial-intent','finance-execution':'financial-execution','finance-safe':'safe-proposal'};
const positive={},missing={};for(const [cmd,args] of Object.entries(commandArgs)){
 const good=cliRun([cmd,...args]);assert.equal(good.status,0,good.stderr);assert.equal(good.stderr,'');const parsed=JSON.parse(good.stdout);assert.equal(parsed.kind,kinds[cmd]);assert.equal(parsed.execution_authorized,false);positive[cmd]=good;
 const absent=cliRun([cmd]);assert.equal(absent.status,2);assert.equal(absent.stdout,'');assert.equal(JSON.parse(absent.stderr).error,'CLI_ERROR');missing[cmd]=absent;
}
const invalid=cliRun(['validate','--bundle',p('examples/invalid-authority.json')]);assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).valid,false);
for(const args of [['unknown'],['validate','--bundle',p('examples/team.json'),'--bundle',p('examples/team.json')],['validate','--bundle',p('examples/team.json'),'--at','2030-01-01T00:00:05Z']]){const r=cliRun(args);assert.equal(r.status,2);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).error,'CLI_ERROR');}
const text=cliRun(['adapter-filesystem-write',...commandArgs['adapter-filesystem-write'],'--format','text']);assert.equal(text.status,0);assert.equal(text.stderr,'');assert.match(text.stdout,/mapping PASS supplies no review or approval/);assert.doesNotMatch(text.stdout,/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/);
const help=cliRun(['--help']);assert.equal(help.status,0);assert.equal(help.stderr,'');assert.match(help.stdout,/(?:optional finance declaration profile uses schema version 0\.2|Finance is a v0\.2 preview)/i);assert.match(help.stdout,/Exit 0: (?:the invoked declaration check passed|declared contracts consistent)/i);
console.log(JSON.stringify({exports:{root:Object.keys(root).sort(),core:Object.keys(core).sort(),finance:Object.keys(finance).sort(),adapter:Object.keys(adapter).sort(),lengths:Object.fromEntries(Object.entries({...core,...finance,...adapter}).filter(([,v])=>typeof v==='function').map(([k,v])=>[k,v.length]))},schemas,reports,cli:{positive,missing,invalid,text,help}}));
`;

test('packed public consumer corpus and optional published differential', {timeout: 180_000}, t => {
  assert.ok(process.env.npm_execpath, 'Run through npm so npm_execpath identifies the cross-platform npm CLI');
  const scratch = mkdtempSync(join(tmpdir(), 'arc-compatibility-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const fixtures = join(scratch, 'fixtures'); mkdirSync(fixtures); mkdirSync(join(fixtures, 'examples')); mkdirSync(join(fixtures, 'examples', 'onchain-finance')); mkdirSync(join(fixtures, 'generated'));
  for (const [relative, expected] of Object.entries(fixtureHashes)) {
    const bytes = readFileSync(join(root, relative)); assert.equal(sha256(bytes), expected, relative);
    writeFileSync(join(fixtures, relative), bytes);
  }
  writeFileSync(join(fixtures, 'examples', 'invalid-authority.json'), readFileSync(join(root, 'examples', 'invalid-authority.json')));
  const digest = 'sha256:84eb08c51c7945bf8bcc781e780f3dc62c7d9097655707e7561375cc61556310';
  const bundle = JSON.parse(readFileSync(join(fixtures, 'examples', 'starter-bundle.json'))), task = JSON.parse(readFileSync(join(fixtures, 'examples', 'starter-task.json'))), route = bundle.routes[0];
  const action = {schema_version: '0.3', id: 'baseline-action', kind: 'propose-change', parameters: {revision: 1}};
  const binding = {schema_version: '0.3', subject_digest: digest, reviews: [{role_id: route.reviewers[0], decision: 'pass', subject_digest: digest}], human_approval: {role_id: route.accountable, decision: 'approved', subject_digest: digest}};
  const writeAction = {schema_version: '0.3', id: 'packed-write', kind: 'filesystem-write', parameters: {path: task.inputs.scope, content_sha256: 'sha256:' + 'a'.repeat(64)}};
  const mapping = {schema_version: '0.1', subject_digest: 'sha256:9d29fe0f0b420780db56aeaf168c83ce2cdfcb42b06511f491674a962fb39a8b', operation: 'write_file', ...writeAction.parameters};
  const lifecycle = {schema_version: '0.4', run_id: 'packed-conformance', subject_digest: digest, events: [{event_id: 'review', phase: 'review', actor_role_id: route.reviewers[0], decision: 'pass', subject_digest: digest}, {event_id: 'approval', phase: 'approval', actor_role_id: route.accountable, decision: 'approved', subject_digest: digest}]};
  for (const [name, value] of Object.entries({action, binding, 'write-action': writeAction, mapping, lifecycle})) writeFileSync(join(fixtures, 'generated', name + '.json'), JSON.stringify(value));
  const env = {...process.env, npm_config_cache: join(scratch, 'npm-cache')};
  const packOutput = pass(runNode([process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', scratch], root, env), 'candidate pack');
  const packed = JSON.parse(packOutput)[0], candidateTarball = join(scratch, packed.filename), candidateStat = lstatSync(candidateTarball);
  assert.ok(candidateStat.isFile() && candidateStat.size > 0 && candidateStat.size <= maxTarballBytes, 'candidate tarball must be a bounded regular file');
  const candidateSHA256 = sha256(readFileSync(candidateTarball));
  function installAndObserve(label, tarball) {
    const consumer = join(scratch, label); mkdirSync(consumer); writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
    pass(runNode([process.env.npm_execpath, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer, env), `${label} install`);
    return JSON.parse(pass(runNode(['--input-type=module', '-e', observer, fixtures, JSON.stringify(schemaHashes)], consumer, env), `${label} observation`));
  }
  const candidate = installAndObserve('candidate-consumer', candidateTarball);
  assert.match(candidate.cli.help.stdout, /optional finance declaration profile uses schema version 0\.2/i);
  assert.match(candidate.cli.help.stdout, /Exit 0: the invoked declaration check passed; it does not mean another operation passed/i);
  const supplied = process.env.ARC_COMPATIBILITY_BASELINE_TARBALL;
  if (!supplied) {
    console.log(JSON.stringify({type: 'ARC_COMPATIBILITY_DIAGNOSTIC', mode: 'NOT_REQUESTED', comparison: 'NOT_REQUESTED', candidateTarballSHA256: candidateSHA256, baselineTarballSHA256: null, fixtureCount: Object.keys(fixtureHashes).length, schemaCount: Object.keys(schemaHashes).length, cliPositiveCount: Object.keys(candidate.cli.positive).length, cliMissingCount: Object.keys(candidate.cli.missing).length}));
    return;
  }
  const suppliedStat = lstatSync(supplied);
  assert.ok(suppliedStat.isFile(), 'ARC_COMPATIBILITY_BASELINE_TARBALL must directly name a regular file');
  const baselinePath = realpathSync(supplied), stat = lstatSync(baselinePath);
  assert.ok(stat.size > 0 && stat.size <= maxTarballBytes, 'baseline tarball must be non-empty and bounded');
  const baselineSHA256 = sha256(readFileSync(baselinePath)); assert.equal(baselineSHA256, publishedTarballSHA256, 'baseline tarball must be the reviewed published 0.5.0 bytes');
  const baseline = installAndObserve('baseline-consumer', baselinePath);
  const oldHelp = 'Finance is a v0.2 preview. The CLI defaults --at to its current UTC clock; the API requires an explicit time.\nExit 0: declared contracts consistent.';
  const newHelp = 'The optional finance declaration profile uses schema version 0.2; this is independent of package stability. The CLI defaults --at to its current UTC clock; the API requires an explicit time.\nExit 0: the invoked declaration check passed; it does not mean another operation passed.';
  assert.equal(baseline.cli.help.stdout.replace(oldHelp, newHelp), candidate.cli.help.stdout, 'only the reviewed help lines may differ');
  delete baseline.cli.help; delete candidate.cli.help;
  assert.deepEqual(candidate, baseline, 'candidate packed observations must match the archived published consumer');
  console.log(JSON.stringify({type: 'ARC_COMPATIBILITY_DIAGNOSTIC', mode: 'DIFFERENTIAL', comparison: 'PASS', candidateTarballSHA256: candidateSHA256, baselineTarballSHA256: baselineSHA256, fixtureCount: Object.keys(fixtureHashes).length, schemaCount: Object.keys(schemaHashes).length, cliPositiveCount: Object.keys(candidate.cli.positive).length, cliMissingCount: Object.keys(candidate.cli.missing).length}));
});
