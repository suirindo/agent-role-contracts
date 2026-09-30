import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSupportedSchema, validateSchema } from '../src/schema.mjs';

// Internal bundled-schema contract checks, not arbitrary runtime schema support.
const invalid = [
 ['items false is unsupported boolean schema', {items:false}],
 ['items null', {items:null}],
 ['items tuple array', {items:[]}],
 ['properties array', {properties:[]}],
 ['properties null', {properties:null}],
 ['properties false', {properties:false}],
 ['additionalProperties number', {additionalProperties:7}],
 ['additionalProperties null', {additionalProperties:null}],
 ['additionalProperties array', {additionalProperties:[]}],
 ['required string', {required:'id'}],
 ['required false', {required:false}],
 ['required null', {required:null}],
 ['required nonstring entry', {required:[3]}],
 ['required duplicate', {required:['id','id']}],
 ['uniqueItems string', {uniqueItems:'yes'}],
 ['uniqueItems zero', {uniqueItems:0}],
 ['type empty', {type:[]}],
 ['type empty string', {type:''}],
 ['type duplicate', {type:['string','string']}],
 ['type null', {type:null}],
 ['enum object', {enum:{a:1}}],
 ['enum null', {enum:null}],
 ['pattern number', {pattern:2}],
 ['pattern false', {pattern:false}],
 ['minItems negative', {minItems:-1}],
 ['minItems string', {minItems:'1'}],
 ['maxItems fractional', {maxItems:1.5}],
 ['minLength negative', {minLength:-1}],
 ['maxLength null', {maxLength:null}],
 ['minimum string', {minimum:'1'}],
 ['maximum null', {maximum:null}],
 ['maximum infinite', {maximum:Infinity}],
 ['title number', {title:42}],
 ['description object', {description:{}}],
 ['id boolean', {$id:false}],
 ['dialect empty', {$schema:''}],
 ['nested unsupported items', {properties:{list:{items:false}}}],
 ['nested malformed required', {additionalProperties:{required:'x'}}],
];
for(const [label,schema] of invalid) {
 test('schema rejects '+label,()=>assert.throws(()=>assertSupportedSchema(schema),/SCHEMA_/));
}
for(const [label,schema] of [
 ['empty schema',{}],['empty properties',{properties:{}}],['empty required',{required:[]}],
 ['additional properties true',{additionalProperties:true}],['additional properties false',{additionalProperties:false}],
 ['additional properties schema',{additionalProperties:{type:'string'}}],['homogeneous items',{items:{type:'integer'}}],
 ['unique false',{uniqueItems:false}],['union type',{type:['null','string']}],['zero bounds',{minItems:0,maxItems:0,minLength:0,maxLength:0}],
 ['annotations',{$id:'https://example.invalid/schema',title:'title',description:'description'}],
]) test('schema accepts '+label,()=>assert.doesNotThrow(()=>assertSupportedSchema(schema)));
test('malformed items cannot silently allow an array',()=>assert.throws(()=>validateSchema([1],{items:false}),/SCHEMA_/));

test('schema build diagnostics escape control and bidi characters in paths',()=>{
 for(const key of ['bad\u001b[2J','bidi\u202ehidden']) {
  let error;try{assertSupportedSchema({[key]:true});}catch(e){error=e;}
  assert.ok(error instanceof Error);assert.equal(error.message.includes(key),false);
  const code=key.includes('\u001b')?'\\u001b':'\\u202e';assert.ok(error.message.includes(code),error.message);
 }
});
