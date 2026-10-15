import assert from 'node:assert/strict';
import { scenarios } from '../../examples/cross-domain/scenarios.mjs';
import { compareRuntimeObservations as compare } from './compare.mjs';
import { fixture, args } from './fixtures.mjs';

for (const scenario of scenarios) {
 const data = await fixture(scenario);
 const matching = await compare(...args(data));
 assert.equal(matching.supplied_conformance, 'matching');
 assert.equal(matching.observed_conformance, 'unknown');
 data.batch.events[0].details.path = 'private/not-assigned.txt';
 const drift = await compare(...args(data));
 assert.equal(drift.static_checks.every(c => c.valid), true);
 assert.equal(drift.supplied_conformance, 'violation');
 assert.ok(drift.errors.some(e => e.code === 'WRITE_SCOPE_VIOLATION'));
 data.batch.events[0].details.path = data.action.parameters.path;
 data.batch.dropped_events = 1;
 const incomplete = await compare(...args(data));
 assert.equal(incomplete.supplied_conformance, 'unknown');
 console.log(JSON.stringify({
  scenario: scenario.id, matching: matching.supplied_conformance,
  clean_pass_drift: drift.supplied_conformance, missing_evidence: incomplete.supplied_conformance,
  runtime_verified: matching.evidence_verified,
 }));
}
