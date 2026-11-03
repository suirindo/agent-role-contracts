#!/usr/bin/env node
// Source-only experiment CLI for literal-path/0.2. Not in the npm package.
import { openSync, fstatSync, lstatSync, readSync, closeSync, constants } from 'node:fs';
import { MAX_INPUT_BYTES } from '../../src/validation.mjs';
import * as profile from './profile-0.2.mjs';
const HELP=`literal-path/0.2 — source-only experiment, not in the npm package. Offline declaration checks only.
Usage:
  node experiments/literal-paths/cli.mjs validate --profile ${profile.PROFILE} --bundle B.json [--format json|text]
  node experiments/literal-paths/cli.mjs explain --profile ${profile.PROFILE} --bundle B.json --task T.json [--format json|text]
--profile is mandatory and is never inferred from input schema_version. Inputs use ${profile.VERSIONS.bundle} and ${profile.VERSIONS.task}.
Exit 0: the declaration check passed; PASS grants no permission. Exit 1: invalid declaration. Exit 2: CLI/file error.
A /** scope includes hidden, underscore and bracket descendants. Brackets are literal bytes, not globs.
No command executes agents, evidence commands, network requests, or writes files.
`;
const escapeChar = c => '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0');
const safeText = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, escapeChar);
const safeJson = (value, space) => JSON.stringify(value,null,space).replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, escapeChar);
// Reader copied from the stable executable bin; keep behavior identical.
function read(path) {
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
  if(!['validate','explain'].includes(cmd))throw new Error('Unknown command; use --help');
  const permitted=cmd==='validate'?['--profile','--bundle','--format']:['--profile','--bundle','--task','--format'];
  const args=new Map();
  for(let i=0;i<argv.length;i+=2) {
   if(!permitted.includes(argv[i])||args.has(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Unknown, duplicate, or missing option');
   args.set(argv[i],argv[i+1]);
  }
  for(const key of permitted.filter(k=>k!=='--format'))if(!args.has(key))throw new Error(`Missing ${key}`);
  if(args.get('--profile')!==profile.PROFILE)throw new Error(`Unsupported --profile; only ${profile.PROFILE} is available`);
  const format=args.get('--format')||'json';if(!['json','text'].includes(format))throw new Error('Invalid format');
  const b=read(args.get('--bundle'));
  const r=cmd==='validate'?profile.validateBundle(b):profile.explainTask(b,read(args.get('--task')));
  if(format==='json')console.log(safeJson(r,2));
  else {
   console.log(`${r.valid?'PASS':'FAIL'}: ${r.kind} (${profile.PROFILE}; declarations only; execution NOT authorized)`);
   for(const role of r.roles||[])console.log(safeText(`Role ${role.id}: ${role.authority_mode}; allowed=[${role.capabilities.join(', ')}]; prohibited=[${role.prohibited_capabilities.join(', ')}]`));
   for(const e of r.errors)console.log(safeText(`${e.code} ${e.path}: ${e.message}`));
  }
  process.exitCode=r.valid?0:1;
 }
} catch(e) {
 console.error(safeJson({valid:false,execution_authorized:false,error:'CLI_ERROR',message:String(e.message)}));
 process.exitCode=2;
}
