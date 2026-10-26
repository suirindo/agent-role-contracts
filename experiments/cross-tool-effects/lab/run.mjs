/** Explicit opt-in, fixed synthetic loopback experiment. Never imported by ARC package. */
import { fork } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createFixtureHost, FIXTURE } from './host.mjs';
const J = JSON.stringify;
export function makeSyntheticDeclarations(subject, bundle, task) {
 const route = bundle.routes.find(r => r.task_type === task.type);
 return J({ schema_version:'0.3',subject_digest:subject.subject_digest,
  reviews:[{subject_digest:subject.subject_digest,role_id:route.reviewers[0],decision:'pass'}],
  ...(route.require_human_approval ? {human_approval:{subject_digest:subject.subject_digest,role_id:route.accountable,decision:'approved'}} : {}) });
}
export async function startObserver({ loopback = false, dropResponse = false } = {}) {
 if (loopback !== true || typeof dropResponse !== 'boolean') throw new Error('LAB_LOOPBACK_OPT_IN_REQUIRED');
 const child = fork(fileURLToPath(new URL('./observer.mjs',import.meta.url)), ['--loopback-observer', ...(dropResponse ? ['--drop-response'] : [])], {
  execArgv:[], env:{PATH:process.env.PATH??'',LANG:'C',LC_ALL:'C'}, stdio:['ignore','ignore','ignore','ipc'],
 });
 let sequence=0, readyResolve, readyReject;
 const pending=new Map();
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const timer=setTimeout(()=>readyReject(new Error('LAB_OBSERVER_START_TIMEOUT')),3000);
 child.on('message',m=>{
  if(m?.type==='ready'){clearTimeout(timer);readyResolve(m);}
  else if(m?.type==='fault'){clearTimeout(timer);readyReject(new Error('LAB_OBSERVER_FAILED'));}
  else if(m && pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);p.resolve(m);}
 });
 child.on('error',()=>{clearTimeout(timer);readyReject(new Error('LAB_OBSERVER_FAILED'));});
 child.on('exit',()=>{clearTimeout(timer);readyReject(new Error('LAB_OBSERVER_EXIT'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('LAB_OBSERVER_EXIT'));}pending.clear();});
 function rpc(type){
  return new Promise((resolve,reject)=>{
   const id=++sequence;
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('LAB_OBSERVER_TIMEOUT'));},3000);
   pending.set(id,{resolve,reject,timer});
   child.send({type,id},error=>{if(error && pending.has(id)){pending.delete(id);clearTimeout(timer);reject(new Error('LAB_OBSERVER_IPC'));}});
  });
 }
 try {
  const address=await ready;
  return {port:address.port,snapshot:()=>rpc('snapshot'),async close(){
   try {await rpc('close');} finally {if(child.connected)child.disconnect();if(child.exitCode===null)child.kill('SIGTERM');}
  }};
 } catch(error){if(child.connected)child.disconnect();child.kill('SIGTERM');throw error;}
}
export async function runLoopbackLab({ loopback = false } = {}) {
 if(loopback!==true)throw new Error('LAB_LOOPBACK_OPT_IN_REQUIRED');
 const bundle=JSON.parse(readFileSync(new URL('../../../examples/starter-bundle.json',import.meta.url),'utf8'));
 const task=JSON.parse(readFileSync(new URL('../../../examples/starter-task.json',import.meta.url),'utf8'));
 const receiver=await startObserver({loopback:true}),cases=[];
 let host;
 try {
  for(const spec of [
   {id:'allowed-before',allowSend:true,complete:true,expected:'ALLOW'},
   {id:'read-only',allowSend:false,complete:true,expected:'DENY'},
   {id:'missing-provenance',allowSend:true,complete:false,expected:'UNKNOWN'},
   {id:'allowed-after',allowSend:true,complete:true,expected:'ALLOW'},
  ]){
   host=createFixtureHost({bundleJson:J(bundle),taskJson:J(task),allowSend:spec.allowSend,complete:spec.complete,receiverPort:receiver.port});
   const source=host.worker.read_file();
   const subject=await host.owner.describe(source.handle);
   if(!subject.subject_digest)throw new Error('LAB_SUBJECT_UNAVAILABLE');
   // Fictional test-only declarations, supplied by trusted lab setup, not product approval.
   const bindingJson=makeSyntheticDeclarations(subject,bundle,task);
   const before=await receiver.snapshot();
   const result=await host.worker.send_report(J({handle:source.handle,bindingJson}));
   const after=await receiver.snapshot();
   const newReceipts=after.receipts.slice(before.receipts.length);
   const observed={receiver_receipts:newReceipts.length,receiver_connections:after.connections-before.connections,invalid_requests:after.invalid-before.invalid,receipts:newReceipts};
   const expectedSend=spec.expected==='ALLOW';
   const matched=result.policy_result===spec.expected && observed.invalid_requests===0 &&
    (expectedSend ? result.execution_status==='RESPONSE_OBSERVED' && result.http_status===204 && result.executor_starts===1 &&
     observed.receiver_receipts===1 && observed.receiver_connections===1 &&
     newReceipts[0].content_sha256===source.content_sha256 && newReceipts[0].byte_length===source.byte_length
     : result.executor_starts===0 && observed.receiver_receipts===0 && observed.receiver_connections===0);
   const replayBefore=await receiver.snapshot();
   let replay=null;
   if(expectedSend){
    const second=await host.worker.send_report(J({handle:source.handle,bindingJson}));
    const replayAfter=await receiver.snapshot();
    replay={policy_result:second.policy_result,extra_connections:replayAfter.connections-replayBefore.connections,extra_receipts:replayAfter.receipts.length-replayBefore.receipts.length};
    if(replay.policy_result!=='DENY'||replay.extra_connections||replay.extra_receipts)throw new Error('LAB_REPLAY_CONTROL_FAILED');
   }
   cases.push({id:spec.id,policy_result:result.policy_result,diagnostic:result.diagnostic,execution_status:result.execution_status,
    executor_starts:result.executor_starts,source_sha256:source.content_sha256,source_bytes:source.byte_length,
    request_digest:subject.request_digest,tool_definition_digest:host.tool_definition_digest,adapter_digest:host.adapter_digest,
    receiver_observation:observed,replay,expected_observations_matched:matched});
   host.owner.close();host=null;
  }
  const final=await receiver.snapshot();
  const expected_observations_matched=cases.every(c=>c.expected_observations_matched) &&
   new Set(cases.map(c=>c.request_digest)).size===1 && new Set(cases.map(c=>c.tool_definition_digest)).size===1 &&
   final.receipts.length===2 && final.connections===2 && final.invalid===0;
  return {profile:'cross-tool-effects/loopback-lab/0.1',classification:'MAINTAINER_SYNTHETIC_LOOPBACK',
   expected_observations_matched,cases,receiver_total:final,
   fixture_sha256:'sha256:'+createHash('sha256').update(FIXTURE).digest('hex'),
   authority:'SYNTHETIC_TEST_DECLARATIONS_ONLY',coverage:'FIXED_LAB_FUNCTION_AND_RECEIVER_ONLY',
   limitations:['No agent/MCP server executed; no counterpart product comparison.',
    'Receiver is a separate child observer, not a tamper-proof host/kernel audit.',
    'No global network capture, authenticated actor, production grant, durable counter or D2 56-case acceptance.',
    'One-use reservation is in-process only; fixture data and approvals are fictional.',
    'No human time-saving, adoption or second-task value measurement.']};
 } finally {host?.owner.close();await receiver.close();}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (process.argv.length !== 3 || process.argv[2] !== '--loopback') {
  process.stderr.write('LAB_ERROR: EXPLICIT_LOOPBACK_FLAG_REQUIRED\n'); process.exitCode = 2;
 } else {
  try {
   const report = await runLoopbackLab({ loopback:true });
   process.stdout.write(JSON.stringify(report,null,2)+'\n');
   if (!report.expected_observations_matched) process.exitCode = 1;
  } catch {
   process.stderr.write('LAB_ERROR: LOOPBACK_LAB_FAILED\n'); process.exitCode = 2;
  }
 }
}
