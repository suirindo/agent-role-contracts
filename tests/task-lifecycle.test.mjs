import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTaskAction, describeTaskLifecycle, validateTaskLifecycle } from '../src/core.mjs';
import * as root from '../src/index.mjs';
import coreSchemas from '../src/schemas.core.generated.mjs';
import financeSchemas from '../src/schemas.finance.generated.mjs';
const fixture = name => JSON.parse(readFileSync(new URL('../examples/'+name+'.json',import.meta.url),'utf8'));
const fresh = () => ({bundle:fixture('team'),task:fixture('task'),action:{schema_version:'0.3',id:'action-1',kind:'document',parameters:{text:'hello'}}});
const args = (s,l) => [s.bundle,s.task,s.action,l].map(JSON.stringify);
const describe = (s,l) => describeTaskLifecycle(...args(s,l));
const validate = (s,l) => validateTaskLifecycle(...args(s,l));
const digest = 'sha256:'+'0'.repeat(64);
const artifact = (locator='anything') => ({artifact_id:'artifact-1',sha256:digest,locator});
const lifecycle = async s => {
 const d=await describeTaskAction(...[s.bundle,s.task,s.action].map(JSON.stringify)); assert.equal(d.valid,true,JSON.stringify(d.errors));
 return {schema_version:'0.4',run_id:'run-1',subject_digest:d.subject_digest,events:[
  {event_id:'review-1',phase:'review',subject_digest:d.subject_digest,actor_role_id:'reviewer',decision:'pass'},
  {event_id:'approval-1',phase:'approval',subject_digest:d.subject_digest,actor_role_id:'coordinator',decision:'approved'},
 ]};
};
const falseFields=['actor_identity_verified','review_verified','approval_verified','execution_verified','artifact_bytes_verified','artifact_locator_resolved','runtime_acceptance_verified','replay_protection_enforced','event_authenticity_verified','state_machine_enforced','execution_authorized','runtime_enforcement','identity_verified','evidence_verified','source_files_checked','sensitive_data_scanned','output_schema_validated'];
const fail = r => {assert.equal(r.valid,false,JSON.stringify(r));assert.equal(r.lifecycle_matches_subject,false);};
test('happy path, exports, correlation and false claims without synthesized G1 binding',async()=>{
 const s=fresh(),l=await lifecycle(s);
 assert.equal(Object.keys(coreSchemas).length,7);assert.equal(Object.keys(financeSchemas).length,4);
 assert.equal(root.describeTaskLifecycle,describeTaskLifecycle);assert.equal(root.validateTaskLifecycle,validateTaskLifecycle);
 for(const api of [describe,validate]) {
  const r=await api(s,l);assert.equal(r.valid,true);assert.equal(r.lifecycle_profile,'task-lifecycle/0.4');assert.equal(r.run_id,l.run_id);assert.equal(r.event_count,2);assert.equal(r.artifact_count,0);assert.equal(r.artifact_identity_consistent,true);
  assert.equal(r.task_id,s.task.id);assert.equal(r.action_id,s.action.id);assert.equal(r.run_id_is_correlation_only,true);
  for(const key of falseFields)assert.equal(r[key],false,key);
  for(const key of ['reviews','human_approval','binding_matches_subject','binding_profile'])assert.equal(Object.hasOwn(r,key),false);
 }
 assert.equal((await validate(s,l)).lifecycle_matches_subject,true);
});
const semanticMutations={
 'review actor':l=>{l.events[0].actor_role_id='coordinator';},
 'review decision':l=>{l.events[0].decision='present';},
 'approval actor':l=>{l.events[1].actor_role_id='reviewer';},
 'approval decision':l=>{l.events[1].decision='pass';},
 'missing review':l=>{l.events.shift();},
 'missing approval':l=>{l.events.pop();},
 'extra approval':l=>{l.events.push({...l.events[1],event_id:'approval-2',actor_role_id:'reviewer'});},
 'duplicate event':l=>{l.events[1].event_id=l.events[0].event_id;},
 'duplicate actor phase':l=>{l.events.push({...l.events[0],event_id:'review-2'});},
 'artifact duplicate':l=>{l.events[0].artifacts=[artifact(),artifact()];},
 'artifact conflict':l=>{l.events[0].artifacts=[artifact()];l.events[1].artifacts=[{...artifact(),sha256:'sha256:'+'1'.repeat(64)}];},
};
for(const [name,mutate] of Object.entries(semanticMutations))test('describe vs validate: '+name,async()=>{
 const s=fresh(),l=await lifecycle(s);mutate(l);assert.equal((await describe(s,l)).valid,!['duplicate event','artifact duplicate','artifact conflict'].includes(name));fail(await validate(s,l));
});
for(const location of ['top','event'])test('stale '+location+' subject fails both reports',async()=>{
 const s=fresh(),l=await lifecycle(s);if(location==='top')l.subject_digest=digest;else l.events[0].subject_digest=digest;
 assert.equal((await describe(s,l)).valid,false);fail(await validate(s,l));assert.equal((await validate(s,l)).artifact_identity_consistent,true);
});
const changes={policy:s=>{s.bundle.policy.capabilities.push('extra.capability');},role:s=>{s.bundle.roles[0].contract.mission.objective+=' changed';},route:s=>{s.bundle.routes[0].require_human_approval=false;},knowledge:s=>{s.bundle.knowledge[0].uri='https://example.org/changed';},inputs:s=>{s.task.inputs.change_kind='text';},objective:s=>{s.task.objective+=' changed';},acceptance:s=>{s.task.acceptance_criteria.push('Another criterion');},kind:s=>{s.action.kind='publish';},parameters:s=>{s.action.parameters.text='changed';}};
for(const [name,mutate] of Object.entries(changes))test('digest freshness: '+name,async()=>{
 const s=fresh(),l=await lifecycle(s);mutate(s);for(const api of [describe,validate]){const r=await api(s,l);assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.code==='G3_SUBJECT_MISMATCH'),JSON.stringify(r.errors));}
});
test('optional execution, negative declarations, evidence actors and decisions',async()=>{
 const s=fresh(),l=await lifecycle(s),route=s.bundle.routes[0];l.events[0].decision='blocked';l.events[1].decision='denied';assert.equal((await validate(s,l)).valid,true);
 for(const [phase,actor,decision] of [['execution',route.executors[0],'declared_failure'],['execution',route.executors[0],'declared_success'],['evidence',route.accountable,'missing'],['evidence',route.reviewers[0],'present'],['evidence',route.executors[0],'present']]){
  const event={event_id:'extra',phase,actor_role_id:actor,decision,subject_digest:l.subject_digest};
  l.events.push(event);assert.equal((await validate(s,l)).valid,true);event.actor_role_id='outsider';fail(await validate(s,l));event.actor_role_id=actor;event.decision='approved';fail(await validate(s,l));l.events.pop();
 }
});
test('route without approval rejects approval; existing bundle schema rejects empty reviewers',async()=>{
 const s=fresh();s.bundle.routes[0].require_human_approval=false;const l=await lifecycle(s);fail(await validate(s,l));l.events.pop();assert.equal((await validate(s,l)).valid,true);
 s.bundle.routes[0].reviewers=[];assert.equal((await describe(s,l)).valid,false);fail(await validate(s,l));
});
test('artifact identity ignores arbitrary inert locator labels and never verifies bytes',async()=>{
 const s=fresh(),l=await lifecycle(s);
 for(const locator of ['/etc/passwd','https://example.org/a','$(touch /tmp/nope)','file:///tmp/a','node -e process.exit()']){
  l.events[0].artifacts=[artifact(locator)];l.events[1].artifacts=[artifact('different label')];
  for(const api of [describe,validate]){const r=await api(s,l);assert.equal(r.valid,true);assert.equal(r.artifact_count,2);assert.equal(r.artifact_identity_consistent,true);assert.equal(r.artifact_bytes_verified,false);assert.equal(r.artifact_locator_resolved,false);}
 }
 l.events[1].artifacts[0].sha256='SHA256:bad';const r=await validate(s,l);fail(r);assert.equal(r.artifact_identity_consistent,false);
});
test('artifact consistency is independent of other failures and conflicts',async()=>{
 const s=fresh(),l=await lifecycle(s);l.events[0].actor_role_id='outsider';assert.equal((await validate(s,l)).artifact_identity_consistent,true);
 l.events[0].artifacts=[artifact()];l.events[1].artifacts=[{...artifact(),sha256:'sha256:'+'1'.repeat(64)}];for(const api of [describe,validate])assert.equal((await api(s,l)).artifact_identity_consistent,false);
});
test('strict schema boundaries',async()=>{
 const mutations=[l=>{l.extra=true;},l=>{l.schema_version='0.3';},l=>{l.run_id='Upper';},l=>{l.run_id='x'.repeat(97);},l=>{l.events=[];},l=>{l.events=Array.from({length:257},()=>l.events[0]);},l=>{l.events[0].timestamp='now';},l=>{l.events[0].decision='unknown';},l=>{l.events[0].artifacts=[{...artifact(),extra:true}];},l=>{l.events[0].artifacts=[artifact('')];},l=>{l.events[0].artifacts=[artifact('x'.repeat(4097))];},l=>{l.events[0].artifacts=Array.from({length:257},artifact);},l=>{l.events[0].artifacts=[{...artifact(),artifact_id:'Upper'}];}];
 for(const mutate of mutations){const s=fresh(),l=await lifecycle(s);mutate(l);for(const api of [describe,validate])assert.equal((await api(s,l)).valid,false);}
});
test('key order deterministic',async()=>{
 const s=fresh(),l=await lifecycle(s);const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
 for(const api of [describe,validate])assert.deepEqual(await api(s,l),await api(reverse(s),reverse(l)));
});
test('non-string/accessor, duplicate decoded keys and unsafe integers fail',async()=>{
 const s=fresh(),l=await lifecycle(s),texts=args(s,l);let getters=0;const bad={get toJSON(){getters++;throw Error('getter');}};
 for(const api of [describeTaskLifecycle,validateTaskLifecycle]){
  for(let i=0;i<4;i++)for(const value of [bad,null,42,[]]){const a=[...texts];a[i]=value;assert.equal((await api(...a)).valid,false);}
  for(let i=0;i<4;i++)for(const text of ['{"a":1,"\\u0061":2}','{"n":9007199254740992}']){const a=[...texts];a[i]=text;assert.equal((await api(...a)).valid,false);}
 }
 assert.equal(getters,0);
});
test('no implicit I/O or clock and generic imports only',async t=>{
 const s=fresh(),l=await lifecycle(s),names=['Date','fetch','setTimeout','XMLHttpRequest','WebSocket'],saved=names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]);
 t.after(()=>{for(const [n,d]of saved)if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];});
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,get(){throw Error('implicit '+n);}});
 assert.equal((await describe(s,l)).valid,true);assert.equal((await validate(s,l)).valid,true);
 const source=readFileSync(new URL('../src/task-lifecycle.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/node:|\bfetch\s*\(|\bDate\b|\bprocess\b|\bimport\s*\(|finance|safe-proposal|adapter|provider/);
});
