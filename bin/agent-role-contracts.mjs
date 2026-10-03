#!/usr/bin/env node
import { openSync, fstatSync, lstatSync, readSync, closeSync, constants } from 'node:fs';
import * as core from '../src/core.mjs';
const { validateBundle, explainTask, validateHandoff, MAX_INPUT_BYTES } = core;
const HELP=`Agent Role Contracts — offline declaration checks only
Usage:
  node bin/agent-role-contracts.mjs validate --bundle examples/team.json [--format json|text]
  node bin/agent-role-contracts.mjs explain --bundle examples/team.json --task examples/task.json
  node bin/agent-role-contracts.mjs handoff --bundle examples/team.json --task examples/task.json --handoff examples/handoff.json
  node bin/agent-role-contracts.mjs action-subject --bundle B --task T --action A [--format json|text]
  node bin/agent-role-contracts.mjs action-bind --bundle B --task T --action A --binding X [--format json|text]
  node bin/agent-role-contracts.mjs adapter-filesystem-write --bundle B --task T --action A --mapping M [--format json|text]
  node bin/agent-role-contracts.mjs finance-subject --bundle B.json --task T.json --policy P.json --transaction TX.json
  node bin/agent-role-contracts.mjs finance --bundle B.json --task T.json --policy P.json --intent I.json [--at UTC_TIME] [--format json|text]
  node bin/agent-role-contracts.mjs finance-execution --bundle B.json --task T.json --policy P.json --intent I.json --receipt R.json [--at UTC_TIME] [--format json|text]
  node bin/agent-role-contracts.mjs finance-safe --bundle B.json --task T.json --policy P.json --intent I.json --safe-proposal S.json [--at UTC_TIME] [--format json|text]
Finance is a v0.2 preview. The CLI defaults --at to its current UTC clock; the API requires an explicit time.
Exit 0: declared contracts consistent. Exit 1: invalid declaration. Exit 2: CLI/file error.
No command executes agents, evidence commands, network requests, or writes files.
`;
const safeText = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, c => '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
const safeJson = (value, space) => JSON.stringify(value,null,space).replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, c => '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function read(path) {
 // Refuse an explicit last-component symlink on every supported platform.
 // POSIX O_NOFOLLOW remains the race-resistant check; lstat also covers
 // Windows where O_NOFOLLOW does not provide equivalent behavior.
 const entry=lstatSync(path);if(entry.isSymbolicLink())throw new Error('INPUT_SYMLINK_REFUSED');
 const fd=openSync(path,constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
 try {
  const s=fstatSync(fd);if(!s.isFile())throw new Error('INPUT_NOT_REGULAR_FILE');
  if(s.size>MAX_INPUT_BYTES)throw new Error('INPUT_TOO_LARGE');
  const bytes=Buffer.alloc(MAX_INPUT_BYTES+1);let n=0;
  while(n<bytes.length) {const k=readSync(fd,bytes,n,bytes.length-n,null);if(!k)break;n+=k;}
  if(n>MAX_INPUT_BYTES)throw new Error('INPUT_TOO_LARGE');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,n));
 } finally {closeSync(fd);}
}
try {
 const [cmd,...argv]=process.argv.slice(2);
 if(cmd==='--help'||cmd==='help')console.log(HELP);
 else {
  if(!['validate','explain','handoff','action-subject','action-bind','adapter-filesystem-write','finance-subject','finance','finance-execution','finance-safe'].includes(cmd))throw new Error('Unknown command; use --help');
  const permitted=cmd==='validate'?['--bundle','--format']:cmd==='explain'?['--bundle','--task','--format']:cmd==='handoff'?['--bundle','--task','--handoff','--format']:cmd==='action-subject'?['--bundle','--task','--action','--format']:cmd==='action-bind'?['--bundle','--task','--action','--binding','--format']:cmd==='adapter-filesystem-write'?['--bundle','--task','--action','--mapping','--format']:cmd==='finance-subject'?['--bundle','--task','--policy','--transaction','--format']:cmd==='finance'?['--bundle','--task','--policy','--intent','--at','--format']:cmd==='finance-execution'?['--bundle','--task','--policy','--intent','--receipt','--at','--format']:['--bundle','--task','--policy','--intent','--safe-proposal','--at','--format'];
  const args=new Map();
  for(let i=0;i<argv.length;i+=2) {
   if(!permitted.includes(argv[i])||args.has(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Unknown, duplicate, or missing option');
   args.set(argv[i],argv[i+1]);
  }
  for(const key of permitted.filter(k=>!['--format','--at'].includes(k)))if(!args.has(key))throw new Error(`Missing ${key}`);
  const format=args.get('--format')||'json';if(!['json','text'].includes(format))throw new Error('Invalid format');
  const { describeFinancialIntent, validateFinancialIntent, validateFinancialExecution, validateSafeProposal } = cmd.startsWith('finance') ? await import('../src/finance-profile.mjs') : {};
  const { validateFilesystemWriteMapping } = cmd==='adapter-filesystem-write' ? await import('../src/filesystem-write-adapter.mjs') : {};
  const b=read(args.get('--bundle'));
  const r=cmd==='validate'?validateBundle(b):cmd==='explain'?explainTask(b,read(args.get('--task'))):cmd==='handoff'?validateHandoff(b,read(args.get('--task')),read(args.get('--handoff'))):cmd==='action-subject'?await core.describeTaskAction(b,read(args.get('--task')),read(args.get('--action'))):cmd==='action-bind'?await core.validateTaskActionBinding(b,read(args.get('--task')),read(args.get('--action')),read(args.get('--binding'))):cmd==='adapter-filesystem-write'?await validateFilesystemWriteMapping(b,read(args.get('--task')),read(args.get('--action')),read(args.get('--mapping'))):cmd==='finance-subject'?await describeFinancialIntent(b,read(args.get('--task')),read(args.get('--policy')),read(args.get('--transaction'))):cmd==='finance'?await validateFinancialIntent(b,read(args.get('--task')),read(args.get('--policy')),read(args.get('--intent')),args.get('--at')||new Date().toISOString()):cmd==='finance-execution'?await validateFinancialExecution(b,read(args.get('--task')),read(args.get('--policy')),read(args.get('--intent')),read(args.get('--receipt')),args.get('--at')||new Date().toISOString()):await validateSafeProposal(b,read(args.get('--task')),read(args.get('--policy')),read(args.get('--intent')),read(args.get('--safe-proposal')),args.get('--at')||new Date().toISOString());
  if(format==='json')console.log(safeJson(r,2));
  else {
   console.log(`${r.valid?'PASS':'FAIL'}: ${r.kind} (declarations only; execution NOT authorized)`);
   if(cmd==='adapter-filesystem-write') {
    for(const [label,key] of [['Task','task_id'],['Action','action_id'],['Subject','subject_digest'],['Adapter profile','adapter_profile']])if(r[key]!==undefined)console.log(safeText(`${label}: ${r[key]}`));
    if(r.mapping)for(const [label,key] of [['Operation','operation'],['Path','path'],['Content digest','content_sha256']])if(r.mapping[key]!==undefined)console.log(safeText(`${label}: ${r.mapping[key]}`));
    console.log(safeText(`Eligible declared executor IDs: ${(r.eligible_executors||[]).join(', ')}`));
    if(r.mapping_matches_action!==undefined)console.log(safeText(`Mapping match: ${r.mapping_matches_action}`));
    console.log('Declaration consistency only; content, filesystem, permission, and execution are NOT verified/enforced.');
    console.log('Identity is not authenticated. G1 review/approval binding is separate; mapping PASS supplies no review or approval.');
   }
   if(cmd==='action-subject'||cmd==='action-bind') {
    for(const [label,key] of [['Task','task_id'],['Action','action_id'],['Subject','subject_digest']])if(r[key]!==undefined)console.log(safeText(`${label}: ${r[key]}`));
    console.log('Digest is integrity-only; execution NOT authorized.');
    if(cmd==='action-bind') {
     if(r.binding_matches_subject!==undefined)console.log(safeText(`Binding match: ${r.binding_matches_subject}`));
     for(const review of r.reviews||[])console.log(safeText(`Reviewer ${review.role_id}: ${review.decision}`));
     if(r.human_approval!=null)console.log(safeText(`Approval declaration: ${safeJson(r.human_approval)}`));
    }
   }
   if(r.accountable)for(const line of [`Accountable: ${r.accountable}`,`Implementers: ${r.executors.join(', ')}`,`Reviewers: ${r.reviewers.join(', ')}`,`Human approval required: ${r.human_approval_required}`])console.log(safeText(line));
   if(r.transaction)for(const line of [`Operation: ${r.transaction.operation}`,`Chain: ${r.transaction.chain_id}`,`Asset: ${r.transaction.asset}`,`Amount (base units): ${r.transaction.amount_base_units}`,`Target: ${r.transaction.target}`,`Subject: ${r.subject_digest}`])console.log(safeText(line));
   if(r.execution)for(const line of [`Execution status: ${r.execution.status}`,`Transaction hash: ${r.execution.transaction_hash}`,`Block: ${r.execution.block_number}`])console.log(safeText(line));
   if(r.safe_proposal)for(const line of [`Safe: ${r.safe_proposal.safe_address}`,`Safe nonce: ${r.safe_proposal.safe_nonce}`,`Safe to: ${r.safe_proposal.transaction.to}`,`Safe CALL envelope matches intent: ${r.safe_call_envelope_matches_intent}`])console.log(safeText(line));
   for(const role of r.roles||[])console.log(safeText(`Role ${role.id}: ${role.authority_mode}; allowed=[${role.capabilities.join(', ')}]; prohibited=[${role.prohibited_capabilities.join(', ')}]`));
   for(const e of r.errors)console.log(safeText(`${e.code} ${e.path}: ${e.message}`));
  }
  process.exitCode=r.valid?0:1;
 }
} catch(e) {
 console.error(safeJson({valid:false,execution_authorized:false,error:'CLI_ERROR',message:String(e.message)}));
 process.exitCode=2;
}
