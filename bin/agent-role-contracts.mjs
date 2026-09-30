#!/usr/bin/env node
import { openSync, fstatSync, lstatSync, readSync, closeSync, constants } from 'node:fs';
import { validateBundle, explainTask, validateHandoff, MAX_INPUT_BYTES } from '../src/index.mjs';
const HELP=`Agent Role Contracts — offline declaration checks only
Usage:
  node bin/agent-role-contracts.mjs validate --bundle examples/team.json [--format json|text]
  node bin/agent-role-contracts.mjs explain --bundle examples/team.json --task examples/task.json
  node bin/agent-role-contracts.mjs handoff --bundle examples/team.json --task examples/task.json --handoff examples/handoff.json
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
  if(!['validate','explain','handoff'].includes(cmd))throw new Error('Unknown command; use --help');
  const permitted=cmd==='validate'?['--bundle','--format']:cmd==='explain'?['--bundle','--task','--format']:['--bundle','--task','--handoff','--format'];
  const args=new Map();
  for(let i=0;i<argv.length;i+=2) {
   if(!permitted.includes(argv[i])||args.has(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Unknown, duplicate, or missing option');
   args.set(argv[i],argv[i+1]);
  }
  for(const key of permitted.filter(k=>k!=='--format'))if(!args.has(key))throw new Error(`Missing ${key}`);
  const format=args.get('--format')||'json';if(!['json','text'].includes(format))throw new Error('Invalid format');
  const b=read(args.get('--bundle'));
  const r=cmd==='validate'?validateBundle(b):cmd==='explain'?explainTask(b,read(args.get('--task'))):validateHandoff(b,read(args.get('--task')),read(args.get('--handoff')));
  if(format==='json')console.log(safeJson(r,2));
  else {
   console.log(`${r.valid?'PASS':'FAIL'}: ${r.kind} (declarations only; execution NOT authorized)`);
   if(r.accountable)for(const line of [`Accountable: ${r.accountable}`,`Implementers: ${r.executors.join(', ')}`,`Reviewers: ${r.reviewers.join(', ')}`,`Human approval required: ${r.human_approval_required}`])console.log(safeText(line));
   for(const role of r.roles||[])console.log(safeText(`Role ${role.id}: ${role.authority_mode}; allowed=[${role.capabilities.join(', ')}]; prohibited=[${role.prohibited_capabilities.join(', ')}]`));
   for(const e of r.errors)console.log(safeText(`${e.code} ${e.path}: ${e.message}`));
  }
  process.exitCode=r.valid?0:1;
 }
} catch(e) {
 console.error(safeJson({valid:false,execution_authorized:false,error:'CLI_ERROR',message:String(e.message)}));
 process.exitCode=2;
}
