import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixtureHost, FIXTURE } from '../experiments/cross-tool-effects/lab/host.mjs';
import { runLoopbackLab } from '../experiments/cross-tool-effects/lab/run.mjs';
const bundleJson=readFileSync(new URL('../examples/starter-bundle.json',import.meta.url),'utf8');
const taskJson=readFileSync(new URL('../examples/starter-task.json',import.meta.url),'utf8');
const bundle=JSON.parse(bundleJson), task=JSON.parse(taskJson),J=JSON.stringify;
function host(t,options={}){
 const h=createFixtureHost({bundleJson,taskJson,allowSend:true,...options});
 t.after(()=>h.owner.close());return h;
}
async function submission(h){
 const source=h.worker.read_file(),subject=await h.owner.describe(source.handle);
 assert.ok(subject.subject_digest);
 const route=bundle.routes.find(r=>r.task_type===task.type);
 const binding={schema_version:'0.3',subject_digest:subject.subject_digest,
  reviews:[{subject_digest:subject.subject_digest,role_id:route.reviewers[0],decision:'pass'}],
  ...(route.require_human_approval?{human_approval:{subject_digest:subject.subject_digest,role_id:route.accountable,decision:'approved'}}:{})};
 return {source,input:{handle:source.handle,bindingJson:J(binding)}};
}
test('fixed read observes known fixture bytes and opaque handle; offline transport stays disabled',async t=>{
 const h=host(t),s=await submission(h);assert.equal(s.source.byte_length,Buffer.byteLength(FIXTURE));
 assert.match(s.source.content_sha256,/^sha256:[0-9a-f]{64}$/);
 const r=await h.worker.send_report(J(s.input));assert.equal(r.policy_result,'UNKNOWN');
 assert.equal(r.diagnostic,'LAB_TRANSPORT_DISABLED');assert.equal(r.executor_starts,0);
});
test('read-only contract denies before any transport',async t=>{
 const h=host(t,{allowSend:false}),s=await submission(h);
 const r=await h.worker.send_report(J(s.input));assert.equal(r.policy_result,'DENY');
 assert.equal(r.diagnostic,'CTE_EFFECT_NOT_DECLARED');assert.equal(r.executor_starts,0);
});
test('missing provenance remains UNKNOWN with no transport',async t=>{
 const h=host(t,{complete:false}),s=await submission(h);
 const r=await h.worker.send_report(J(s.input));assert.equal(r.policy_result,'UNKNOWN');
 assert.equal(r.diagnostic,'CTE_PROVENANCE_INCOMPLETE');assert.equal(r.executor_starts,0);
});
test('worker cannot substitute URL, body, actor or trust',async t=>{
 for(const key of ['url','body','actor','trusted']){
  const h=host(t),s=await submission(h);const r=await h.worker.send_report(J({...s.input,[key]:'synthetic'}));
  assert.equal(r.policy_result,'REJECT_INPUT');assert.equal(r.executor_starts,0);
 }
});
test('read API rejects caller-selected path',t=>{
 const h=host(t);assert.throws(()=>h.worker.read_file('{"path":"other.txt"}'),/LAB_INPUT_INVALID/);
});
test('foreign handle rejected between isolated fixture hosts',async t=>{
 const a=host(t),b=host(t);const s=await submission(a);b.worker.read_file();
 const r=await b.worker.send_report(J(s.input));assert.equal(r.policy_result,'DENY');assert.equal(r.diagnostic,'LAB_HANDLE_UNAVAILABLE');
});
test('missing or stale declared approval does not dispatch',async t=>{
 const h=host(t),s=await submission(h);
 let r=await h.worker.send_report(J({handle:s.source.handle}));assert.equal(r.policy_result,'UNKNOWN');assert.equal(r.executor_starts,0);
 const binding=JSON.parse(s.input.bindingJson);binding.subject_digest='sha256:'+'f'.repeat(64);
 r=await h.worker.send_report(J({...s.input,bindingJson:J(binding)}));assert.equal(r.policy_result,'DENY');assert.equal(r.executor_starts,0);
});
test('concurrent submission reserves the local critical section before await',async t=>{
 const h=host(t),s=await submission(h);
 const first=h.worker.send_report(J(s.input)),second=h.worker.send_report(J(s.input));
 const r=await second;assert.equal(r.policy_result,'DENY');assert.equal(r.diagnostic,'LAB_ALREADY_CONSUMED_OR_BUSY');await first;
});
test('closed fixture cannot read or submit',async t=>{
 const h=host(t),s=await submission(h);h.owner.close();assert.throws(()=>h.worker.read_file(),/LAB_READ_UNAVAILABLE/);
 const r=await h.worker.send_report(J(s.input));assert.equal(r.policy_result,'DENY');assert.equal(r.diagnostic,'LAB_CLOSED');
});
test('lab function requires explicit opt-in',async()=>{await assert.rejects(runLoopbackLab(),/LAB_LOOPBACK_OPT_IN_REQUIRED/);});
test('actual loopback receiver paired controls and replay observations',
 {skip:process.env.ARC_CTEI_LOOPBACK_LAB!=='1'},async()=>{
 const r=await runLoopbackLab({loopback:true});assert.equal(r.expected_observations_matched,true);
 assert.equal(r.receiver_total.receipts.length,2);assert.equal(r.receiver_total.connections,2);
});
