import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTaskAction, validateTaskActionBinding } from '../src/core.mjs';
import { canonical } from '../src/schema.mjs';
const fixture = name => JSON.parse(readFileSync(new URL('../examples/' + name + '.json', import.meta.url), 'utf8'));
const fresh = () => ({ bundle: fixture('team'), task: fixture('task'), action: { schema_version: '0.3', id: 'action-1', kind: 'document', parameters: { text: 'hello', count: 1, enabled: true, absent: null } } });
const describe = s => describeTaskAction(...[s.bundle, s.task, s.action].map(JSON.stringify));
const validate = (s, b) => validateTaskActionBinding(...[s.bundle, s.task, s.action, b].map(JSON.stringify));
const binding = async s => {
 const d = await describe(s); assert.equal(d.valid, true, JSON.stringify(d.errors));
 return { schema_version: '0.3', subject_digest: d.subject_digest, reviews: [{ subject_digest: d.subject_digest, role_id: 'reviewer', decision: 'pass' }], human_approval: { subject_digest: d.subject_digest, role_id: 'coordinator', decision: 'approved' } };
};
const falseFields = ['subject_authenticated','review_authenticated','human_approval_authenticated','action_executed','replay_protection_enforced','execution_authorized','runtime_enforcement','identity_verified','evidence_verified','source_files_checked','sensitive_data_scanned','output_schema_validated'];
const failed = r => { assert.equal(r.valid, false); assert.equal(r.binding_matches_subject, false); for (const f of falseFields) assert.equal(r[f], false); };

test('PASS binds complete canonical subject without authorization claims', async () => {
 const s = fresh(), b = await binding(s), d = await describe(s), r = await validate(s,b);
 assert.equal(r.valid,true); assert.equal(r.binding_matches_subject,true);
 assert.equal(d.binding_profile,'task-action/0.3'); assert.equal(d.task_id,s.task.id); assert.deepEqual(d.action,s.action);
 for (const f of falseFields) { assert.equal(r[f],false); assert.equal(d[f],false); }
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({profile:'task-action/0.3',...s})));
 assert.equal(d.subject_digest,'sha256:'+Buffer.from(hash).toString('hex'));
});
const mutations = {
 'policy version': s => { s.bundle.policy_version += '-new'; },
 policy: s => { s.bundle.policy.capabilities.push('extra.capability'); },
 'role contract': s => { s.bundle.roles[0].contract.mission.objective += ' Changed.'; },
 route: s => { s.bundle.routes[0].require_human_approval = false; },
 'task inputs': s => { s.task.inputs.change_kind = 'text'; },
 'task objective': s => { s.task.objective += ' Changed.'; },
 'task acceptance criteria': s => { s.task.acceptance_criteria.push('Another criterion.'); },
 'action kind': s => { s.action.kind = 'publish'; },
 'action parameters': s => { s.action.parameters.text = 'changed'; },
};
for (const [name, mutate] of Object.entries(mutations)) test('digest changes and stale binding fails: '+name,async () => {
 const s = fresh(), b = await binding(s); mutate(s);
 const d = await describe(s); assert.equal(d.valid,true,JSON.stringify(d.errors)); assert.notEqual(d.subject_digest,b.subject_digest);
 const r = await validate(s,b); failed(r); assert.ok(r.errors.some(e => e.code==='G1_SUBJECT_MISMATCH'));
});
const badBindings = {
 'stale top subject': b => { b.subject_digest='sha256:'+'0'.repeat(64); },
 'stale review subject': b => { b.reviews[0].subject_digest='sha256:'+'0'.repeat(64); },
 'stale approval subject': b => { b.human_approval.subject_digest='sha256:'+'0'.repeat(64); },
 'outsider reviewer': b => { b.reviews[0].role_id='coordinator'; },
 'duplicate reviewer': b => { b.reviews.push({...b.reviews[0]}); },
 'blocked review': b => { b.reviews[0].decision='blocked'; },
 'empty reviews': b => { b.reviews=[]; },
 'missing approval': b => { delete b.human_approval; },
 'wrong approver': b => { b.human_approval.role_id='reviewer'; },
 'denied approval': b => { b.human_approval.decision='denied'; },
 'unknown binding property': b => { b.extra=true; },
 'unknown review property': b => { b.reviews[0].extra=true; },
 'unknown approval property': b => { b.human_approval.extra=true; },
};
for (const [name, mutate] of Object.entries(badBindings)) test('rejects '+name,async () => { const s=fresh(),b=await binding(s); mutate(b); failed(await validate(s,b)); });
test('nonapproval route accepts reviews and rejects unexpected approval',async () => {
 const s=fresh(); s.bundle.routes[0].require_human_approval=false;
 const b=await binding(s); failed(await validate(s,b)); delete b.human_approval; assert.equal((await validate(s,b)).valid,true);
});
test('route without reviewers fails closed',async () => {
 const s=fresh(), b=await binding(s); s.bundle.routes[0].reviewers=[]; failed(await validate(s,b));
});
for (const value of [{ execute:'code' }, ['nested']]) test('rejects nested action parameters '+JSON.stringify(value),async () => {
 const s=fresh(); s.action.parameters.nested=value; assert.equal((await describe(s)).valid,false);
});
test('rejects action unknown keys, invalid IDs and versions',async () => {
 for (const change of [a=>{a.extra=true;},a=>{a.id='Upper';},a=>{a.kind='../run';},a=>{a.schema_version='0.2';}]) {
  const s=fresh(); change(s.action); assert.equal((await describe(s)).valid,false);
 }
});
test('object key order is deterministic throughout the subject',async () => {
 const s=fresh();
 const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
 assert.equal((await describe(s)).subject_digest,(await describe(reverse(s))).subject_digest);
});
test('all API arguments refuse nonstring executable objects without touching getters',async () => {
 const s=fresh(),b=await binding(s),args=[s.bundle,s.task,s.action,b].map(JSON.stringify);
 const executable={get toJSON(){throw new Error('executed');}};
 for(let i=0;i<4;i++) { const a=[...args]; a[i]=executable; const r=await validateTaskActionBinding(...a); failed(r); assert.equal(r.errors[0].code,'INPUT_NOT_JSON_TEXT'); }
 for(let i=0;i<3;i++) { const a=args.slice(0,3); a[i]=executable; assert.equal((await describeTaskAction(...a)).errors[0].code,'INPUT_NOT_JSON_TEXT'); }
});
test('Web Crypto absent or failing fails closed',async t => {
 const s=fresh(),b=await binding(s),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 t.after(()=>Object.defineProperty(globalThis,'crypto',descriptor));
 for(const value of [undefined,{subtle:{digest:async()=>{throw Error('unavailable');}}}]) {
  Object.defineProperty(globalThis,'crypto',{configurable:true,value});
  assert.equal((await describe(s)).errors[0].code,'G1_DIGEST_UNAVAILABLE'); failed(await validate(s,b));
 }
});
test('APIs do not implicitly read clock, network or runtime I/O',async t => {
 const s=fresh(),b=await binding(s);
 const names=['Date','fetch','setTimeout','XMLHttpRequest','WebSocket'];
 const saved=names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]);
 t.after(()=>{for(const [n,d] of saved) if(d)Object.defineProperty(globalThis,n,d); else delete globalThis[n];});
 for(const n of names) Object.defineProperty(globalThis,n,{configurable:true,get(){throw Error('implicit '+n);}});
 assert.equal((await describe(s)).valid,true); assert.equal((await validate(s,b)).valid,true);
 const source=readFileSync(new URL('../src/action-binding.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/node:|\bfetch\s*\(|\bDate\b|\bprocess\b|\bimport\s*\(/);
});

test('task input objects and invalid binding text are rejected',async () => {
 const s=fresh(),b=await binding(s); s.task.inputs.extra={execute:'code'}; failed(await validate(s,b));
 const clean=fresh(); failed(await validateTaskActionBinding(...[clean.bundle,clean.task,clean.action].map(JSON.stringify),'{'));
});
