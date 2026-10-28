/** D1 source-only JSON profile. No I/O, identity, grants or dispatch. */
import { createHash } from 'node:crypto';
import { read } from '../../src/validation.mjs';
import { canonical } from '../../src/schema.mjs';

const str = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const hash = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' };
const list = item => ({ type: 'array', maxItems: 64, uniqueItems: true, items: item });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const count = maximum => ({ type: 'integer', minimum: 0, maximum });
export const contractSchema = obj({
 schema_version: { const: '0.1-draft' }, profile: { const: 'cross-tool-effects/0.1-draft' },
 id: str, revision: { type: 'integer', minimum: 1, maximum: 2147483647 },
 task_binding: obj({ canonicalization: { const: 'JCS/RFC8785' }, bundle_task_digest: hash }),
 allowed_effects: list({ enum: ['filesystem.read', 'network.send'] }),
 read_sources: list(str), destinations: list(str),
 flows: { type: 'array', maxItems: 64, items: obj({
  id: str, effect: { const: 'network.send' }, destination_ref: str,
  source_refs: list(str), allowed_labels: list(str),
 }) },
 provenance: obj({ mode: { const: 'session-union' }, on_missing: { const: 'deny' }, allow_declassification: { const: false } }),
 limits: obj({
  max_read_bytes: count(1048576), max_egress_bytes_per_action: count(65536),
  max_egress_bytes_per_run: count(65536), max_egress_calls_per_run: count(256), max_events: count(256),
 }),
});
export const requestSchema = obj({
 effect: str, run_id: str, session_id: str, tenant: str,
 source_refs: list(str), destination_ref: { type: ['string', 'null'], maxLength: 128, pattern: str.pattern },
 content_sha256: hash, byte_length: count(1048576), adapter_digest: hash, tool_definition_digest: hash,
});
export const provenanceSchema = obj({
 run_id: str, session_id: str, tenant: str, complete: { type: 'boolean' },
 sources: { type: 'array', maxItems: 64, items: obj({ source_ref: str, classification: str, content_sha256: hash }) },
 exposure_source_refs: list(str),
 usage: obj({ egress_bytes: count(1048576), egress_calls: count(256), event_count: count(256) }),
});
function unicode(value) {
 if (typeof value === 'string') {
  for (let i = 0; i < value.length; i++) {
   const n = value.charCodeAt(i);
   if (n >= 0xd800 && n <= 0xdbff) {
    const next = value.charCodeAt(++i);
    if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('CTE_INPUT_INVALID');
   } else if (n >= 0xdc00 && n <= 0xdfff) throw new Error('CTE_INPUT_INVALID');
  }
 } else if (value && typeof value === 'object') {
  for (const key of Object.keys(value)) { unicode(key); unicode(value[key]); }
 }
}
export function parse(text, schema = {}) {
 const r = read(text, schema, 'input');
 if (r.errors.length) throw new Error('CTE_INPUT_INVALID');
 unicode(r.value);
 return r.value;
}
/** RFC8785 serialization on this bounded JSON-text profile; existing G1 unchanged. */
export function digest(domain, value) {
 return 'sha256:' + createHash('sha256').update(domain + '\0' + canonical(value), 'utf8').digest('hex');
}
export function parseInputs(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input) ||
     Object.keys(input).some(k => !['bundleJson','taskJson','contractJson','requestJson','provenanceJson','bindingJson'].includes(k))) throw new Error('CTE_INPUT_INVALID');
 const bundle = parse(input.bundleJson), task = parse(input.taskJson);
 const contract = parse(input.contractJson, contractSchema);
 const request = parse(input.requestJson, requestSchema);
 const provenance = parse(input.provenanceJson, provenanceSchema);
 for (const [rows, key] of [[contract.flows, 'id'], [provenance.sources, 'source_ref']]) {
  if (new Set(rows.map(v => v[key])).size !== rows.length) throw new Error('CTE_INPUT_INVALID');
 }
 if (input.bindingJson !== undefined) parse(input.bindingJson);
 const digests = {
  task_digest: digest('arc-ctei-task/0.1', { bundle, task }),
  contract_digest: digest('arc-ctei-contract/0.1', contract),
  request_digest: digest('arc-ctei-request/0.1', request),
  provenance_digest: digest('arc-ctei-provenance/0.1', provenance),
 };
 const action = { schema_version: '0.3', id: 'cte-request', kind: 'cte-request', parameters: {
  effect: request.effect, contract_digest: digests.contract_digest,
  request_digest: digests.request_digest, provenance_digest: digests.provenance_digest,
 } };
 return { bundle, task, contract, request, provenance, digests, action };
}
