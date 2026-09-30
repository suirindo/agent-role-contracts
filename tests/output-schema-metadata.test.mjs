import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBundle, explainTask, validateHandoff } from '../src/index.mjs';
const load = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const output = {type:'object',properties:{model:{type:'string'},tools:{type:'array',items:{type:'string'}}}};
function sample() { const b=load('team'); b.roles[1].contract.contract.output_schema=structuredClone(output); return b; }
for (const name of ['model','tools','invoke','permission_mode','max_turns']) {
 test(`inert output property ${name} is not runtime configuration`,()=>{
  const b=load('team'); b.roles[1].contract.contract.output_schema={type:'object',properties:{[name]:{type:'string'}}};
  const r=validateBundle(JSON.stringify(b)); assert.equal(r.valid,true,JSON.stringify(r.errors)); assert.equal(r.output_schema_validated,false);
 });
}
test('output schema does not weaken role body checks',()=>{const b=sample();b.roles[1].body='model: example';const r=validateBundle(JSON.stringify(b));assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.code==='RUNTIME_SPECIFIC_DECLARATION'));});
test('output schema does not weaken mission checks',()=>{const b=sample();b.roles[1].contract.mission.objective='tools: unsafe-runtime-config';const r=validateBundle(JSON.stringify(b));assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.code==='RUNTIME_SPECIFIC_DECLARATION'));});
test('output schema remains bounded JSON, not arbitrary input',()=>{const b=sample();b.roles[1].contract.contract.output_schema=JSON.parse('{"__proto__":{}}');assert.equal(validateBundle(JSON.stringify(b)).errors[0].code,'RESERVED_JSON_KEY');});
test('all public entrypoints accept inert output declarations without claiming output validation',()=>{const text=JSON.stringify(sample()),t=JSON.stringify(load('task')),h=JSON.stringify(load('handoff'));for(const r of [validateBundle(text),explainTask(text,t),validateHandoff(text,t,h)]){assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.output_schema_validated,false);assert.equal(r.execution_authorized,false);}});
test('inert output schema inspection is deterministic and preserves caller text',()=>{const text=JSON.stringify(sample());const before=text;const a=validateBundle(text),b=validateBundle(text);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(text,before);});
