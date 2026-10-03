import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateFilesystemWriteMapping as validate } from '../src/filesystem-write-adapter.mjs';
import { describeTaskAction } from '../src/action-binding.mjs';
import core from '../src/schemas.core.generated.mjs';
import adapters from '../src/schemas.adapters.generated.mjs';
import finance from '../src/schemas.finance.generated.mjs';
import aggregate from '../src/schemas.generated.mjs';
const fixture = name => JSON.parse(readFileSync(new URL('../examples/'+name+'.json', import.meta.url),'utf8'));
const fresh = () => ({bundle:fixture('team'),task:fixture('task'),action:{schema_version:'0.3',id:'write-1',kind:'filesystem-write',parameters:{path:'docs/example.md',content_sha256:'sha256:'+'a'.repeat(64)}}});
const args = s => [s.bundle,s.task,s.action,s.mapping].map(JSON.stringify);
const prepare = async s => {
 const d = await describeTaskAction(...args(s).slice(0,3));
 s.mapping = {schema_version:'0.1',subject_digest:d.subject_digest,operation:'write_file',...s.action.parameters};
 return s;
};
const falseFields = ['adapter_authenticated','content_bytes_verified','filesystem_state_verified','path_exists_verified','write_permission_enforced','subject_authenticated','review_authenticated','human_approval_authenticated','action_executed','replay_protection_enforced','execution_authorized','runtime_enforcement','identity_verified','evidence_verified','source_files_checked','sensitive_data_scanned','output_schema_validated'];
const claims = r => {for(const f of falseFields) assert.equal(r[f],false,f);assert.equal(r.mapping_matches_action,r.valid);};
const failed = r => {claims(r);assert.equal(r.valid,false,JSON.stringify(r));};
test('declaration PASS has sorted eligible IDs and no approval or permission claims',async()=>{
 const s=await prepare(fresh()),r=await validate(...args(s));
 assert.equal(r.valid,true,JSON.stringify(r.errors));claims(r);
 assert.equal(r.adapter_profile,'filesystem-write/0.1');assert.equal(r.task_id,s.task.id);assert.equal(r.action_id,s.action.id);
 assert.equal(r.subject_digest,s.mapping.subject_digest);assert.deepEqual(r.mapping,s.mapping);assert.deepEqual(r.eligible_executors,['implementer']);
 assert.equal(Object.hasOwn(r,'reviews'),false);assert.equal(Object.hasOwn(r,'human_approval'),false);
});
const mutations = {
 'stale subject':s=>{s.task.objective+=' changed';},
 'wrong kind':s=>{s.action.kind='shell';},
 'missing path':s=>{delete s.action.parameters.path;},
 'missing digest':s=>{delete s.action.parameters.content_sha256;},
 'extra URL':s=>{s.action.parameters.url='https://example.com';},
 'extra shell':s=>{s.action.parameters.command='touch file';},
 'nonstring path':s=>{s.action.parameters.path=42;},
 'nonstring digest':s=>{s.action.parameters.content_sha256=null;},
 'mapping path mismatch':s=>{s.mapping.path='docs/other.md';},
 'mapping digest mismatch':s=>{s.mapping.content_sha256='sha256:'+'b'.repeat(64);},
 'task scope escape':s=>{s.action.parameters.path=s.mapping.path='src/file.mjs';},
 'role scope escape':s=>{s.bundle.roles[1].contract.authority.allowed_write_scopes=['src/**'];},
 'no executor':s=>{s.bundle.routes[0].executors=[];},
 'no capability':s=>{s.bundle.roles[1].contract.authority.capabilities=['filesystem.read'];},
 'read only':s=>{const a=s.bundle.roles[1].contract.authority;a.authority_mode='read_only';a.capabilities=['filesystem.read'];a.allowed_write_scopes=[];},
 'inactive':s=>{s.bundle.roles[1].contract.status='draft';},
 'operation':s=>{s.mapping.operation='delete_file';},
 'extra mapping':s=>{s.mapping.command='anything';},
 'uppercase action digest':s=>{s.action.parameters.content_sha256='sha256:'+'A'.repeat(64);},
 'uppercase mapping digest':s=>{s.mapping.content_sha256='sha256:'+'A'.repeat(64);},
 'noncanonical digest':s=>{s.action.parameters.content_sha256='a'.repeat(64);},
};
for(const [name,mutate] of Object.entries(mutations)) test('rejects '+name,async()=>{const s=await prepare(fresh());mutate(s);failed(await validate(...args(s)));});
for(const path of ['../file','docs/../file','/docs/file','C:/file','docs\\file','docs//file','docs/**','.hidden/file','docs/file\n','docs/file ']) {
 for(const target of ['mapping','action']) test('rejects nonportable '+target+' '+JSON.stringify(path),async()=>{
  const s=await prepare(fresh());if(target==='mapping')s.mapping.path=path;else s.action.parameters.path=path;failed(await validate(...args(s)));
 });
}
test('exact and subtree task scopes, operator mode and sorted writer evidence',async()=>{
 const s=fresh();s.task.inputs.scope='docs/**';s.bundle.roles[1].contract.authority.authority_mode='operator';
 const second=structuredClone(s.bundle.roles[1]);second.contract.id='aaa-writer';s.bundle.roles.push(second);s.bundle.routes[0].executors.push('aaa-writer');
 await prepare(s);const r=await validate(...args(s));assert.equal(r.valid,true,JSON.stringify(r.errors));assert.deepEqual(r.eligible_executors,['aaa-writer','implementer']);
});
test('JSON key order preserves G1 subject',async()=>{
 const s=await prepare(fresh());const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
 const r=await validate(...args(reverse(s)));assert.equal(r.valid,true);assert.equal(r.subject_digest,s.mapping.subject_digest);
});
test('all four inputs reject accessors without executing getters',async()=>{
 const a=args(await prepare(fresh()));let touched=0;const object={get toJSON(){touched++;throw Error('getter');}};
 for(let i=0;i<4;i++){const bad=[...a];bad[i]=object;const r=await validate(...bad);failed(r);assert.equal(r.errors[0].code,'INPUT_NOT_JSON_TEXT');}assert.equal(touched,0);
});
test('all inputs reject duplicate, unsafe, reserved and invalid JSON',async()=>{
 const a=args(await prepare(fresh()));
 for(let i=0;i<4;i++)for(const bad of ['{"x":1,"\\u0078":2}','{"x":9007199254740993}','{"x":1e400}','{"__proto__":{}}','{']){
  const b=[...a];b[i]=bad;failed(await validate(...b));
 }
});
test('no implicit I/O, clock or network; adapter imports no finance or Safe',async t=>{
 const a=args(await prepare(fresh()));const names=['Date','fetch','setTimeout','XMLHttpRequest','WebSocket'];const saved=names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]);
 t.after(()=>{for(const [n,d] of saved)if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];});
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,get(){throw Error(n);}});
 assert.equal((await validate(...a)).valid,true);
 const source=readFileSync(new URL('../src/filesystem-write-adapter.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/node:|\bfetch\s*\(|\bDate\b|\bprocess\b|\bimport\s*\(|finance|safe/i);
});
test('existing core schemas and finance bytes are unchanged and schema groups disjoint',()=>{
 const {['task-lifecycle']: lifecycle,...existingCore}=core;
 const existingCoreHash=createHash('sha256').update(JSON.stringify(existingCore)).digest('hex');
 assert.equal(existingCoreHash,'4cd2ac1606a9d8edba0780b7931e642ecd8b90fe478e5e2f878cd2948d39a657','pre-G3 core schema object');
 assert.equal(createHash('sha256').update(readFileSync(new URL('../src/schemas.finance.generated.mjs',import.meta.url))).digest('hex'),'48d5d8bd6c62d2ac4a5b3c3daf180cfeb8fa7a557c61a86f56f6dc46054e2f17','finance generated bytes');
 assert.equal(lifecycle.properties.schema_version.const,'0.4');
 assert.equal(Object.keys(core).length,7);assert.equal(Object.keys(finance).length,4);assert.equal(Object.keys(adapters).length,1);
 const keys=[...Object.keys(core),...Object.keys(adapters),...Object.keys(finance)];assert.equal(new Set(keys).size,12);assert.deepEqual(aggregate,{...core,...adapters,...finance});
});
test('current subjects independently reject task escape and missing writer',async()=>{
 for(const mode of ['scope','writer']){
  const s=fresh();
  if(mode==='scope')s.action.parameters.path='src/file.mjs';
  else {const a=s.bundle.roles[1].contract.authority;a.authority_mode='read_only';a.capabilities=['filesystem.read'];a.allowed_write_scopes=[];}
  await prepare(s);const r=await validate(...args(s));failed(r);
  assert.ok(r.errors.some(e=>e.code===(mode==='scope'?'G2_TASK_SCOPE':'G2_NO_ELIGIBLE_WRITER')));
  assert.equal(r.errors.some(e=>e.code==='G2_SUBJECT_MISMATCH'),false);
 }
});
test('trailing newlines cannot form canonical matching paths or digests',async()=>{
 for(const field of ['path','content_sha256']){
  const s=fresh();s.action.parameters[field]+='\n';await prepare(s);failed(await validate(...args(s)));
 }
});
