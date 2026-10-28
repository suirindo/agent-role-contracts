import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digest, parse } from '../experiments/cross-tool-effects/contract.mjs';
import { describeEffectRequest, evaluateEffectRequest } from '../experiments/cross-tool-effects/policy.mjs';
const j = JSON.stringify, H = 'sha256:' + 'a'.repeat(64), I = 'sha256:' + 'b'.repeat(64);
const read = name => JSON.parse(readFileSync(new URL('../examples/' + name + '.json', import.meta.url),'utf8'));
function fixture() {
 const bundle = read('starter-bundle'), task = read('starter-task');
 const contract = {
  schema_version:'0.1-draft',profile:'cross-tool-effects/0.1-draft',id:'fictional-export',revision:1,
  task_binding:{canonicalization:'JCS/RFC8785',bundle_task_digest:digest('arc-ctei-task/0.1',{bundle,task})},
  allowed_effects:['filesystem.read','network.send'],read_sources:['fixture-public','fixture-internal'],
  destinations:['lab.receiver'],flows:[{id:'public',effect:'network.send',destination_ref:'lab.receiver',source_refs:['trusted-input','fixture-public'],allowed_labels:['public']}],
  provenance:{mode:'session-union',on_missing:'deny',allow_declassification:false},
  limits:{max_read_bytes:1048576,max_egress_bytes_per_action:65536,max_egress_bytes_per_run:65536,max_egress_calls_per_run:1,max_events:256},
 };
 const request = {effect:'network.send',run_id:'run-1',session_id:'session-1',tenant:'tenant-1',source_refs:['fixture-public'],destination_ref:'lab.receiver',content_sha256:H,byte_length:12,adapter_digest:H,tool_definition_digest:H};
 const provenance = {run_id:'run-1',session_id:'session-1',tenant:'tenant-1',complete:true,
 sources:[{source_ref:'trusted-input',classification:'public',content_sha256:H},{source_ref:'fixture-public',classification:'public',content_sha256:H},{source_ref:'fixture-internal',classification:'internal',content_sha256:I}],
 exposure_source_refs:['trusted-input','fixture-public'],usage:{egress_bytes:0,egress_calls:0,event_count:1}};
 return {bundle,task,contract,request,provenance};
}
function input(f) { return Object.fromEntries(Object.entries(f).map(([k,v])=>[k+'Json',j(v)])); }
async function bind(f) {
 const i = input(f), s = await describeEffectRequest(i);
 assert.ok(s.subject_digest, j(s));
 const route = f.bundle.routes.find(r=>r.task_type===f.task.type);
 // Fictional review declarations for synthetic tests; no actual approval or execution.
 i.bindingJson = j({schema_version:'0.3',subject_digest:s.subject_digest,reviews:[{subject_digest:s.subject_digest,role_id:route.reviewers[0],decision:'pass'}],
 ...(route.require_human_approval?{human_approval:{subject_digest:s.subject_digest,role_id:route.accountable,decision:'approved'}}:{})});
 return i;
}
async function run(mutator = ()=>{}) { const f=fixture();mutator(f);return evaluateEffectRequest(await bind(f)); }
const has=(r,c)=>r.diagnostics.some(d=>d.code===c);
test('D1 authorized public send has consistent binding but no authority/execution',async()=>{
 const r=await run();assert.equal(r.policy_result,'ALLOW');assert.equal(r.binding_status,'CONSISTENT');
 assert.equal(r.authority_status,'UNKNOWN');assert.equal(r.execution_status,'NOT_PERFORMED');
 for(const key of ['execution_authorized','runtime_enforcement','identity_verified','evidence_verified','action_executed','replay_protection_enforced','source_bytes_observed','receiver_observed'])assert.equal(r[key],false);
});
test('same tool/request, read-only task contract denies send',async()=>{
 const f=fixture(), before=j(f.request);f.contract.allowed_effects=['filesystem.read'];
 const r=await evaluateEffectRequest(await bind(f));assert.equal(j(f.request),before);assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_EFFECT_NOT_DECLARED'));
});
for(const [name,mutate,code,result='DENY'] of [
 ['mixed internal exposure',f=>f.provenance.exposure_source_refs.push('fixture-internal'),'CTE_FLOW_NOT_ALLOWED'],
 ['summary/base64/hash or constant still has session exposure',f=>{f.request.source_refs=[];f.request.content_sha256=I;f.provenance.exposure_source_refs.push('fixture-internal');},'CTE_FLOW_NOT_ALLOWED'],
 ['missing initial provenance',f=>f.provenance.complete=false,'CTE_PROVENANCE_INCOMPLETE','UNKNOWN'],
 ['unknown source',f=>f.request.source_refs.push('unknown'),'CTE_PROVENANCE_INCOMPLETE','UNKNOWN'],
 ['empty lineage',f=>{f.request.source_refs=[];f.provenance.exposure_source_refs=[];},'CTE_PROVENANCE_INCOMPLETE','UNKNOWN'],
 ['wrong receiver',f=>f.request.destination_ref='lab.other','CTE_DESTINATION_NOT_ALLOWED'],
 ['foreign session',f=>f.request.session_id='session-2','CTE_REPLAY_OR_CONFLICT'],
 ['foreign tenant',f=>f.request.tenant='tenant-2','CTE_REPLAY_OR_CONFLICT'],
 ['foreign run',f=>f.request.run_id='run-2','CTE_REPLAY_OR_CONFLICT'],
 ['per action byte limit',f=>f.request.byte_length=65537,'CTE_LIMIT_EXCEEDED'],
 ['cumulative byte limit',f=>f.provenance.usage.egress_bytes=65530,'CTE_LIMIT_EXCEEDED'],
 ['call limit',f=>f.provenance.usage.egress_calls=1,'CTE_LIMIT_EXCEEDED'],
 ['event limit',f=>f.provenance.usage.event_count=256,'CTE_LIMIT_EXCEEDED'],
 ['unsupported effect',f=>f.request.effect='shell.execute','CTE_UNSUPPORTED_EFFECT'],
 ['task sidecar stale',f=>f.task.objective+=' changed','CTE_BINDING_STALE'],
]) test(name,async()=>{const r=await run(mutate);assert.equal(r.policy_result,result);assert.ok(has(r,code),j(r));});
test('one complete rule required, no flow stitching',async()=>{
 const r=await run(f=>{f.provenance.exposure_source_refs.push('fixture-internal');f.contract.flows.push({id:'internal',effect:'network.send',destination_ref:'lab.receiver',source_refs:['fixture-internal'],allowed_labels:['internal']});});
 assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_FLOW_NOT_ALLOWED'));
});
test('internal data permitted for declared internal destination/flow',async()=>{
 const r=await run(f=>{f.contract.destinations=['lab.internal'];f.request.destination_ref='lab.internal';f.provenance.exposure_source_refs.push('fixture-internal');f.contract.flows=[{id:'internal',effect:'network.send',destination_ref:'lab.internal',source_refs:['trusted-input','fixture-public','fixture-internal'],allowed_labels:['public','internal']}];});
 assert.equal(r.policy_result,'ALLOW');
});
test('known deny retained with incomplete provenance',async()=>{
 const r=await run(f=>{f.contract.allowed_effects=[];f.provenance.complete=false;});
 assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_EFFECT_NOT_DECLARED'));assert.ok(has(r,'CTE_PROVENANCE_INCOMPLETE'));
});
test('allowed read can proceed independently of incomplete send provenance',async()=>{
 const r=await run(f=>{f.request.effect='filesystem.read';f.request.destination_ref=null;f.provenance.complete=false;});
 assert.equal(r.policy_result,'ALLOW');
});
test('read source/hash/size checked',async()=>{
 for(const [m,c] of [
  [f=>f.request.source_refs=['not-permitted'],'CTE_SOURCE_NOT_ALLOWED'],
  [f=>f.request.content_sha256=I,'CTE_BINDING_STALE'],
  [f=>f.contract.limits.max_read_bytes=1,'CTE_LIMIT_EXCEEDED'],
 ]) {const r=await run(f=>{f.request.effect='filesystem.read';f.request.destination_ref=null;m(f);});assert.equal(r.policy_result,'DENY');assert.ok(has(r,c));}
});
for(const [name,mutate] of [
 ['payload digest',f=>f.request.content_sha256=I],['request length',f=>f.request.byte_length++],
 ['tool digest',f=>f.request.tool_definition_digest=I],['adapter digest',f=>f.request.adapter_digest=I],
 ['policy revision',f=>f.contract.revision++],['provenance',f=>f.provenance.usage.event_count++],
 ['task input',f=>f.task.inputs.scope='src/other.mjs'],
]) test('old G1 binding rejects changed '+name,async()=>{
 const f=fixture(), i=await bind(f);mutate(f);Object.assign(i,input(f));const r=await evaluateEffectRequest(i);
 assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_BINDING_STALE'));
});
test('missing binding held; self approval/reviewer fails',async()=>{
 let f=fixture();let r=await evaluateEffectRequest(input(f));assert.equal(r.policy_result,'UNKNOWN');assert.ok(has(r,'CTE_BINDING_REQUIRED'));
 const i=await bind(f),b=JSON.parse(i.bindingJson);b.reviews[0].role_id=f.bundle.routes.find(x=>x.task_type===f.task.type).executors[0];i.bindingJson=j(b);r=await evaluateEffectRequest(i);assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_BINDING_INVALID'));
});
for(const [name,mutate] of [
 ['unknown trust field',i=>i.provenanceJson=i.provenanceJson.replace('{','{"trusted":true,')],
 ['duplicate decoded key',i=>i.requestJson=i.requestJson.replace('{','{"effect":"network.send",')],
 ['lone surrogate',i=>i.taskJson=i.taskJson.replace('"objective":','"untrusted":"\\ud800","objective":')],
 ['unknown version',i=>i.contractJson=i.contractJson.replace('0.1-draft','9.9')],
 ['unknown flow field',i=>{const v=JSON.parse(i.contractJson);v.flows[0].trusted=true;i.contractJson=j(v);}],
 ['duplicate source identity',i=>{const p=JSON.parse(i.provenanceJson);p.sources.push(p.sources[0]);i.provenanceJson=j(p);}],
 ['duplicate flow identity',i=>{const c=JSON.parse(i.contractJson);c.flows.push(c.flows[0]);i.contractJson=j(c);}],
 ['oversize input',i=>i.requestJson=' '.repeat(1048577)],
 ['nonfinite number',i=>i.requestJson=i.requestJson.replace('"byte_length":12','"byte_length":1e999')],
 ['deep nesting',i=>i.taskJson='['.repeat(65)+'0'+']'.repeat(65)],
 ['unrecognized API input',i=>i.trusted=true],
]) test('reject '+name,async()=>{
 const i=input(fixture());mutate(i);const r=await evaluateEffectRequest(i);assert.equal(r.policy_result,'REJECT_INPUT');assert.deepEqual(r.diagnostics,[{code:'CTE_INPUT_INVALID'}]);
});
test('canonical order independent; domain separated; preserves RFC number/string rules',()=>{
 const a=parse('{"b":1e-7,"a":"€\\r\\n","n":-0}'),b=parse('{"n":0,"a":"€\\r\\n","b":1e-7}');
 assert.equal(digest('test',a),digest('test',b));assert.notEqual(digest('test',a),digest('other',a));
 assert.throws(()=>parse('{"x":1,"\\u0078":2}'));
});
test('deterministic and caller input unchanged; no payload echo',async()=>{
 const i=await bind(fixture()),before=j(i);const a=await evaluateEffectRequest(i),b=await evaluateEffectRequest(i);
 assert.deepEqual(a,b);assert.equal(j(i),before);assert.equal(Object.hasOwn(a,'request'),false);
});

test('unsafe integer input is outside the bounded canonical profile',()=>{
 assert.throws(()=>parse('{"n":1e30}'));
});
test('async boundary cannot replace caller input after capture',async()=>{
 const i=await bind(fixture());const pending=evaluateEffectRequest(i);
 i.bindingJson='{}';i.taskJson='{}';i.requestJson='{}';
 const r=await pending;assert.equal(r.policy_result,'ALLOW');assert.equal(r.binding_status,'CONSISTENT');
});
test('missing read snapshot is UNKNOWN; zero send allowance denies empty-body send',async()=>{
 let r=await run(f=>{f.request.effect='filesystem.read';f.request.destination_ref=null;f.provenance.sources=f.provenance.sources.filter(s=>s.source_ref!=='fixture-public');});
 assert.equal(r.policy_result,'UNKNOWN');
 r=await run(f=>{f.request.byte_length=0;f.contract.limits.max_egress_calls_per_run=0;});
 assert.equal(r.policy_result,'DENY');assert.ok(has(r,'CTE_LIMIT_EXCEEDED'));
});
test('equally informed ordinary task rule agrees on paired effect condition',async()=>{
 for(const authorized of [true,false]) {
  const f=fixture();if(!authorized)f.contract.allowed_effects=['filesystem.read'];
  const baseline=f.contract.allowed_effects.includes(f.request.effect)?'ALLOW':'DENY';
  const r=await evaluateEffectRequest(await bind(f));assert.equal(r.policy_result,baseline);
 }
});
