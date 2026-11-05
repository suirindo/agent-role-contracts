#!/usr/bin/env node
/**
 * ARC 1.0.1 declaration-only T4/T8 column for the independent ACS comparison.
 * Source-only, fictional inputs, deterministic cases. No runtime execution.
 */
import {
  readFileSync, writeFileSync, mkdtempSync, rmSync, lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const EXPERIMENT = 'ARC G1/G3 x ACS Guardian T4/T8';
const PACKAGE_NAME = '@netsujo/agent-role-contracts';
const PACKAGE_VERSION = '1.0.1';
const PINNED_INTEGRITY = 'sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==';
const UPSTREAM = Object.freeze({
  repository: 'Noctis-dev1/acs-conformance',
  commit: '53a61a1aea173372a998f1e1038c323e2fa4100b',
  comparison_url: 'https://github.com/Noctis-dev1/acs-conformance/blob/53a61a1aea173372a998f1e1038c323e2fa4100b/COMPARISON.md',
});
const sha = (data, algorithm = 'sha256', output = 'hex') =>
  createHash(algorithm).update(data).digest(output);
const json = value => JSON.stringify(value);
const clone = value => structuredClone(value);
const die = message => {
  console.error('ACS_ARC_COLUMN_ERROR: ' + String(message).replace(/[\r\n]+/g,' '));
  process.exitCode = 2;
};
const usage = 'Usage: node arc-column.mjs --tarball /path/to/netsujo-agent-role-contracts-1.0.1.tgz';

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(usage);
    return;
  }
  if (argv.length !== 2 || argv[0] !== '--tarball' || !argv[1] || argv[1].startsWith('--')) {
    throw new Error(usage);
  }
  const tarball = resolve(argv[1]);
  if (!lstatSync(tarball).isFile()) throw new Error('Tarball must be a regular file, not symlink/directory');
  const tarballBytes = readFileSync(tarball);
  const integrity = 'sha512-' + sha(tarballBytes,'sha512','base64');
  if (integrity !== PINNED_INTEGRITY) throw new Error('Published 1.0.1 tarball integrity mismatch');
  const temp = mkdtempSync(join(tmpdir(),'arc-acs115-'));
  try {
    const extraction = spawnSync('tar', ['-xzf', tarball, '-C', temp], {encoding:'utf8',timeout:30000});
    if (extraction.error || extraction.status !== 0) throw new Error('tarball extraction failed');
    const pkgRoot = join(temp,'package');
    const meta = JSON.parse(readFileSync(join(pkgRoot,'package.json'),'utf8'));
    if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('Package name or version mismatch');
    const cli = join(pkgRoot,'bin','agent-role-contracts.mjs');
    const bundle = JSON.parse(readFileSync(join(pkgRoot,'examples','team.json'),'utf8'));
    const task = JSON.parse(readFileSync(join(pkgRoot,'examples','task.json'),'utf8'));
    const action = {
      schema_version:'0.3',id:'acs-guardian-synthetic-action-001',
      kind:'software-change',
      parameters:{target:'fictional-pool-a',method:'declaration-only'},
    };
    const files = {bundle:join(temp,'bundle.json'),task:join(temp,'task.json'),
      action:join(temp,'action.json'),binding:join(temp,'binding.json'),
      lifecycle:join(temp,'lifecycle.json')};
    function writeInputs(data) {
      for (const k of ['bundle','task','action']) writeFileSync(files[k],json(data[k]),{mode:0o600});
    }
    function invoke(command,data,extra={}) {
      writeInputs(data);
      for (const [key,val] of Object.entries(extra)) {
        if (key !== 'binding' && key !== 'lifecycle') throw new Error('Unexpected ARC input');
        writeFileSync(files[key],json(val),{mode:0o600});
      }
      const required = {
        'action-subject':['bundle','task','action'],
        'action-bind':['bundle','task','action','binding'],
        'lifecycle':['bundle','task','action','lifecycle'],
      }[command];
      if (!required) throw new Error('Unknown ARC command');
      const args=[cli,command,...required.flatMap(k=>['--'+k,files[k]]),'--format','json'];
      const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:25000,maxBuffer:1048576});
      if (r.error || r.signal || ![0,1].includes(r.status)) throw new Error('ARC CLI failed to produce a declaration result');
      let output;
      try { output=JSON.parse(r.stdout); } catch { throw new Error('ARC CLI stdout is not JSON'); }
      if (typeof output?.valid !== 'boolean' || !Array.isArray(output.errors)) throw new Error('ARC CLI result malformed');
      if (output.execution_authorized !== false) throw new Error('ARC execution_authorized must be false');
      return {exit_code:r.status, valid:output.valid, diagnostic_codes:output.errors.map(e=>e.code),
        subject_digest:output.subject_digest??output.current_subject_digest??null,
        execution_authorized:output.execution_authorized, raw:output};
    }
    const initial = {bundle,task,action};
    const described = invoke('action-subject',initial);
    if (!described.valid || !/^sha256:[0-9a-f]{64}$/.test(described.subject_digest)) throw new Error('Failed to describe valid G1 subject');
    const route = bundle.routes.find(r=>r.task_type===task.type);
    if (!route?.reviewers?.length || !route?.require_human_approval) throw new Error('Fixture has no independent review or approval route');
    const digest=described.subject_digest;
    const binding = {
      schema_version:'0.3',subject_digest:digest,
      reviews:[{subject_digest:digest,role_id:route.reviewers[0],decision:'pass'}],
      human_approval:{subject_digest:digest,role_id:route.accountable,decision:'approved'},
    };
    const cases=[];
    const push=(case_id,upstream_row,declared_change,ran,arc_command,observed,expected,classification,match,extra={})=>{
      cases.push({case_id,upstream_row,declared_change,ran,arc_command,
        exit_code:observed?.exit_code??null,valid:observed?.valid??null,
        diagnostic_codes:observed?.diagnostic_codes??[],subject_digest:observed?.subject_digest??null,
        execution_authorized:observed?.execution_authorized??false,
        expected,classification,match,...extra});
    };
    const base=invoke('action-bind',initial,{binding});
    push('t4-baseline-binding','Declared change, in the bundle, task or action','None; prior binding created on the current fictional subject',true,
      'action-subject + action-bind',base,'PASS','PRECONDITION',
      described.exit_code===0&&base.exit_code===0&&base.valid&&base.subject_digest===digest);
    const change = {
      bundle: d=>{d.bundle.policy_version='example-v2';},
      task: d=>{d.task.objective+=' Only fictional resources may be mentioned.';},
      action: d=>{d.action.parameters.target='fictional-pool-b';},
    };
    for (const [kind,mutate] of Object.entries(change)) {
      const changed=clone(initial);mutate(changed);
      const observed=invoke('action-bind',changed,{binding});
      push('t4-declared-'+kind,'Declared change, in the bundle, task or action',kind+' declaration changed; original review/approval binding reused',true,
        'action-bind',observed,'REJECT / G1_SUBJECT_MISMATCH','DETECTED',
        observed.exit_code===1&&!observed.valid&&observed.diagnostic_codes.includes('G1_SUBJECT_MISMATCH'));
    }
    const definitionBefore=json({name:'fictional-mcp-tool',schema:{destination:'fictional-pool-a'}});
    const definitionAfter=json({name:'fictional-mcp-tool',schema:{destination:'fictional-pool-b'}});
    const inputsBefore=json(initial);
    const inputsAfter=json({bundle,task,action});
    const unchanged=invoke('action-subject',initial);
    const underlying=invoke('action-bind',initial,{binding});
    push('t4-underlying-definition-only','Underlying change, the tool or MCP definition changes while the declaration is unchanged',
      'Fictional external tool definition changed; bundle/task/action not changed',true,
      'action-subject + action-bind',underlying,'G1 PASS / EXPECTED_MISS','EXPECTED_MISS',
      sha(inputsBefore)===sha(inputsAfter)&&sha(definitionBefore)!==sha(definitionAfter)
        &&unchanged.subject_digest===digest&&underlying.subject_digest===digest
        &&underlying.exit_code===0&&underlying.valid,
      {declared_inputs_sha256_before:sha(inputsBefore),declared_inputs_sha256_after:sha(inputsAfter),
        fictional_definition_sha256_before:sha(definitionBefore),
        fictional_definition_sha256_after:sha(definitionAfter),
        measured_by:'arc-column.mjs (not ARC)'});
    const event=(event_id,phase,actor_role_id,decision)=>({event_id,phase,actor_role_id,decision,subject_digest:digest});
    const lifecycle={schema_version:'0.4',run_id:'synthetic-acs-t8-declaration-only',
      subject_digest:digest,
      events:[
        event('fictional-review-001','review',route.reviewers[0],'pass'),
        event('fictional-approval-001','approval',route.accountable,'approved'),
        event('fictional-execution-001','execution',route.executors[0],'declared_success'),
      ]};
    const g3=invoke('lifecycle',initial,{lifecycle});
    push('t8-g3-lifecycle-declared','Partial fulfilment (20 of 40 confirmed), then a fill after the key closes',
      'Fictional review, approval and declared-success lifecycle; no real event or quantity',true,'lifecycle',
      g3,'G3 declaration consistency PASS','IN_SCOPE_CONSISTENT',
      g3.exit_code===0&&g3.valid&&g3.raw.event_authenticity_verified===false
      &&g3.raw.execution_verified===false&&g3.raw.runtime_acceptance_verified===false
      &&g3.raw.state_machine_enforced===false&&g3.raw.replay_protection_enforced===false,
      {runtime_acceptance_verified:g3.raw.runtime_acceptance_verified,
        event_authenticity_verified:g3.raw.event_authenticity_verified,
        execution_verified:g3.raw.execution_verified,
        state_machine_enforced:g3.raw.state_machine_enforced,
        replay_protection_enforced:g3.raw.replay_protection_enforced});
    push('t8-runtime-reconciliation','Partial fulfilment (20 of 40 confirmed), then a fill after the key closes',
      'External confirmation, partial fill quantities, late-arriving effects and ledger state',false,
      null,null,'N/A / NOT_RUN','NOT_APPLICABLE',true,
      {limitation:'ARC G3 validates declaration consistency only; runtime reconciliation has not been performed.'});
    const ok=cases.length===7&&cases.every(c=>c.match&&c.execution_authorized===false);
    const result={
      experiment:EXPERIMENT,
      verdict:ok?'EXPECTED_ARC_COLUMN_REPRODUCED':'UNEXPECTED_RESULT',
      package:{name:PACKAGE_NAME,version:meta.version,integrity,integrity_verified:true,
        tarball_sha512:sha(tarballBytes,'sha512')},
      runner_sha256:sha(readFileSync(fileURLToPath(import.meta.url))),
      environment:{node:process.version,platform:process.platform,arch:process.arch},
      upstream:UPSTREAM,
      cases,
      provenance:'MAINTAINER_RUN',
      volatile:['environment'],
      limitations:[
        'ARC checks declaration consistency offline and grants no runtime execution authority.',
        'Underlying tool/MCP definition bytes are outside G1 subject; T4 underlying change is an expected miss.',
        'G3 declarations do not authenticate events, external effects, partial fulfilment, or late-arrival reconciliation.',
        'Guardian and independent ledger are measured in upstream conformance suite, NOT_RUN by this fixture.',
      ],
    };
    console.log(JSON.stringify(result,null,2));
    if (!ok) process.exitCode=1;
  } finally {
    rmSync(temp,{recursive:true,force:true});
  }
}
try {
  await main();
} catch(e) {
  die(e?.message??e);
}
