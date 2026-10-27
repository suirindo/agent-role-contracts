/** Explicit synthetic loopback fault observations. No generalized broker claim. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createFixtureHost } from './host.mjs';
import { startObserver, makeSyntheticDeclarations } from './run.mjs';
const J = JSON.stringify;
const load = name => readFileSync(new URL('../../../examples/'+name+'.json',import.meta.url),'utf8');
function delta(before,after){
 return {connections:after.connections-before.connections,receipts:after.receipts.slice(before.receipts.length),invalid:after.invalid-before.invalid};
}
function exactOne(observation,source){
 return observation.connections===1 && observation.receipts.length===1 && observation.invalid===0 &&
  observation.receipts[0].byte_length===source.byte_length && observation.receipts[0].content_sha256===source.content_sha256;
}
function noExtra(observation){return observation.connections===0 && observation.receipts.length===0 && observation.invalid===0;}
const brief = r => ({policy_result:r.policy_result,execution_status:r.execution_status,executor_starts:r.executor_starts,diagnostic:r.diagnostic,...(r.http_status===undefined?{}:{http_status:r.http_status})});
export async function runLoopbackFaults({loopback=false}={}){
 if(loopback!==true)throw new Error('LAB_LOOPBACK_OPT_IN_REQUIRED');
 const bundleJson=load('starter-bundle'),taskJson=load('starter-task'),bundle=JSON.parse(bundleJson),task=JSON.parse(taskJson),cases=[];
 for(const mode of ['response-loss','concurrent']){
  const receiver=await startObserver({loopback:true,dropResponse:mode==='response-loss'});
  let host;
  try{
   host=createFixtureHost({bundleJson,taskJson,allowSend:true,receiverPort:receiver.port});
   const source=host.worker.read_file(),subject=await host.owner.describe(source.handle);
   if(!subject.subject_digest)throw new Error('LAB_SUBJECT_UNAVAILABLE');
   const input=J({handle:source.handle,bindingJson:makeSyntheticDeclarations(subject,bundle,task)});
   const before=await receiver.snapshot();
   const results=mode==='response-loss'?[await host.worker.send_report(input)]:
    await Promise.all([host.worker.send_report(input),host.worker.send_report(input)]);
   const after=await receiver.snapshot(),observed=delta(before,after);
   const replay=await host.worker.send_report(input),final=await receiver.snapshot(),replayObserved=delta(after,final);
   const admitted=results.filter(r=>r.policy_result==='ALLOW'),denied=results.filter(r=>r.policy_result==='DENY');
   const match=exactOne(observed,source) && replay.policy_result==='DENY' && noExtra(replayObserved) &&
    (mode==='response-loss' ? admitted.length===1 && results[0].execution_status==='REMOTE_EFFECT_UNKNOWN' &&
      results[0].executor_starts===1 :
      admitted.length===1 && denied.length===1 && admitted[0].execution_status==='RESPONSE_OBSERVED' &&
      admitted[0].http_status===204 && admitted[0].executor_starts===1 &&
      denied[0].diagnostic==='LAB_ALREADY_CONSUMED_OR_BUSY');
   cases.push({id:mode,send_results:results.map(brief),receiver_observation:observed,replay_result:brief(replay),
    replay_observation:replayObserved,source:{byte_length:source.byte_length,content_sha256:source.content_sha256},request_digest:subject.request_digest,
    tool_definition_digest:host.tool_definition_digest,adapter_digest:host.adapter_digest,expected_observations_matched:match});
  }finally{host?.owner.close();await receiver.close();}
 }
 return {profile:'cross-tool-effects/loopback-faults/0.1',classification:'MAINTAINER_SYNTHETIC_LOOPBACK',
  expected_observations_matched:cases.every(c=>c.expected_observations_matched),cases,
  authority:'SYNTHETIC_TEST_DECLARATIONS_ONLY',coverage:'FIXED_LAB_FUNCTION_AND_RECEIVER_ONLY',
  limitations:['Post-receipt response loss is deliberately injected by the owned receiver.',
   'Concurrency/replay proof is one host closure and one process only; no durable/distributed grant claim.',
   'Receiver shares the OS account; no tamper-proof/global network capture or hostile-host claim.',
   'No complete CTE-029/037 or full56-case D2 acceptance, actual MCP integration, counterpart comparison or user-value measurement.']};
}
/**
 * Fictional DEV-feedback-inspired slice (unverified public report): the receiver records the fixed
 * 50-byte safe effect and then answers HTTP 404. Sender-observed 404 is NOT a successful remote effect;
 * only the separate observer shows the body arrived. Neither side is an exactly-once claim.
 */
export async function runLoopbackHttp404({loopback=false}={}){
 if(loopback!==true)throw new Error('LAB_LOOPBACK_OPT_IN_REQUIRED');
 const bundleJson=load('starter-bundle'),taskJson=load('starter-task'),bundle=JSON.parse(bundleJson),task=JSON.parse(taskJson),cases=[];
 const specs=[
  {id:'healthy-204-control',allowSend:true,respondNotFound:false},
  {id:'http-404-after-effect',allowSend:true,respondNotFound:true},
  {id:'no-send-control',allowSend:false,respondNotFound:true},
 ];
 for(const spec of specs){
  const receiver=await startObserver({loopback:true,respondNotFound:spec.respondNotFound});
  let host;
  try{
   host=createFixtureHost({bundleJson,taskJson,allowSend:spec.allowSend,receiverPort:receiver.port});
   const source=host.worker.read_file(),subject=await host.owner.describe(source.handle);
   if(!subject.subject_digest)throw new Error('LAB_SUBJECT_UNAVAILABLE');
   const input=J({handle:source.handle,bindingJson:makeSyntheticDeclarations(subject,bundle,task)});
   const before=await receiver.snapshot();
   const result=await host.worker.send_report(input);
   const after=await receiver.snapshot(),observed=delta(before,after);
   const replay=await host.worker.send_report(input),final=await receiver.snapshot(),replayObserved=delta(after,final);
   const sentStatus=result.http_status,senderSuccess=result.execution_status==='RESPONSE_OBSERVED'&&sentStatus>=200&&sentStatus<300;
   let match=source.byte_length===50&&replayObserved.connections===0&&replayObserved.receipts.length===0&&replayObserved.invalid===0;
   if(spec.id==='healthy-204-control')
    match=match&&result.policy_result==='ALLOW'&&sentStatus===204&&senderSuccess&&result.executor_starts===1&&exactOne(observed,source)&&replay.policy_result==='DENY';
   else if(spec.id==='http-404-after-effect')
    match=match&&result.policy_result==='ALLOW'&&result.execution_status==='RESPONSE_OBSERVED'&&sentStatus===404&&!senderSuccess&&
     result.executor_starts===1&&exactOne(observed,source)&&replay.policy_result==='DENY'&&replay.executor_starts===1;
   else
    match=match&&result.policy_result==='DENY'&&result.executor_starts===0&&result.http_status===undefined&&noExtra(observed)&&replay.policy_result==='DENY'&&replay.executor_starts===0;
   cases.push({id:spec.id,send_result:brief(result),sender_observed_success:senderSuccess,receiver_observation:observed,
    replay_result:brief(replay),replay_observation:replayObserved,source:{byte_length:source.byte_length,content_sha256:source.content_sha256},
    request_digest:subject.request_digest,tool_definition_digest:host.tool_definition_digest,adapter_digest:host.adapter_digest,expected_observations_matched:match});
  }finally{host?.owner.close();await receiver.close();}
 }
 return {profile:'cross-tool-effects/loopback-http404/0.1',classification:'MAINTAINER_SYNTHETIC_LOOPBACK',
  expected_observations_matched:cases.every(c=>c.expected_observations_matched),cases,
  authority:'SYNTHETIC_TEST_DECLARATIONS_ONLY',coverage:'FIXED_LAB_FUNCTION_AND_RECEIVER_ONLY',
  limitations:['Inspired by unverified public DEV feedback; the report is not confirmed and no ARC adoption is claimed.',
   'The receiver deliberately records the fixed 50-byte body and then returns HTTP 404; sender-observed 404 is not a successful remote effect, while the observer receipt shows the body arrived.',
   'No remote exactly-once, atomicity, durable recovery or authenticated receipt reconciliation claim; replay denial is one host closure and one process only.',
   'Receiver shares the OS account; no tamper-proof/global network capture or hostile-host claim.']};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const flag=process.argv[2];
 if(process.argv.length!==3 || !['--loopback','--loopback-http404'].includes(flag)){
  process.stderr.write('LAB_ERROR: EXPLICIT_LOOPBACK_FLAG_REQUIRED\n');process.exitCode=2;
 }else{
  try{
   const report=flag==='--loopback-http404'?await runLoopbackHttp404({loopback:true}):await runLoopbackFaults({loopback:true});process.stdout.write(J(report,null,2)+'\n');
   if(!report.expected_observations_matched)process.exitCode=1;
  }catch{process.stderr.write('LAB_ERROR: LOOPBACK_FAULT_LAB_FAILED\n');process.exitCode=2;}
 }
}
