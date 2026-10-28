import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCases, compareInventory, inspectSuppliedTrace } from '../experiments/outreach-fixtures/runner.mjs';

test('all frozen 18 fixtures retain raw API inputs/results and false runtime claims', async () => {
  const r = await runCases();
  assert.equal(r.summary.cases, 18);
  assert.equal(r.summary.expectations_matched, 18, JSON.stringify(r.results.filter(x => !x.expectation_matched)));
  assert.equal(r.summary.runtime_cases_executed, 0);
  for (const c of r.results) {
    assert.equal(c.authority, 'UNKNOWN'); assert.equal(c.runtime, 'NOT_RUN');
    assert.equal(c.execution_authorized, false); assert.equal(c.receiver_observed, false);
    assert.ok(c.observations.length); assert.ok(c.observations.every(o => o.input));
  }
  const target = r.results.find(c => c.id === 'AB-03');
  assert.equal(target.observations[0].result.valid, false);
  assert.equal(target.observations[1].result.valid, true);
  assert.equal(target.observations[1].resolution_coverage, 'UNKNOWN');
  assert.equal(r.results.find(c => c.id === 'RE-06').observations[0].result.valid, false);
});

test('expected outcome mutation makes the run fail rather than blessing its output', async () => {
  const spec = JSON.parse(readFileSync(new URL('../experiments/outreach-fixtures/cases.json', import.meta.url), 'utf8'));
  spec.cases[1].expected.comparison = 'MATCH';
  const r = await runCases(spec);
  assert.equal(r.summary.expectations_failed, 1);
});

test('inventory missing/foreign/unmapped input never authenticates; known excess survives a gap', () => {
  const bundle = JSON.parse(readFileSync(new URL('../examples/starter-bundle.json', import.meta.url), 'utf8'));
  const context = { config_revision: 'v1', session: 's1', host: 'h1' };
  const inventory = { tools: ['read', 'shell', 'friendly'], provenance: 'trusted=true', revision: 'v1', session: 's1', host: 'h1' };
  const mapping = { read: ['filesystem.read'], shell: ['filesystem.write.scoped'] };
  let r = compareInventory(bundle, inventory, mapping, context);
  assert.equal(r.comparison, 'MISMATCH'); assert.deepEqual(r.gaps, ['friendly']);
  assert.equal(r.provenance, 'UNKNOWN'); assert.equal(r.host_inventory_authenticated, false);
  assert.equal(compareInventory(bundle, null, mapping, context).comparison, 'UNKNOWN');
  assert.equal(compareInventory(bundle, { ...inventory, host: 'foreign' }, mapping, context).comparison, 'UNKNOWN');
  assert.equal(compareInventory(bundle, { ...inventory, provenance: null }, mapping, context).comparison, 'UNKNOWN');
});

test('trace missing, replayed or late-cancelled dispatch remains unresolved or contradictory', () => {
  assert.equal(inspectSuppliedTrace({}).conclusion, 'UNRESOLVED_MISSING_EVIDENCE');
  assert.equal(inspectSuppliedTrace({ complete: true, events: [null] }).conclusion, 'CONTRADICTORY_OR_REPLAYED_EVIDENCE');
  const events = [{ id: '1', type: 'admitted' }, { id: '2', type: 'cancelled' },
    { id: '3', type: 'approved' }, { id: '4', type: 'dispatch' }];
  const r = inspectSuppliedTrace({ complete: true, events });
  assert.equal(r.conclusion, 'CONTRADICTORY_OR_REPLAYED_EVIDENCE');
  assert.ok(r.contradictions.includes('DISPATCH_AFTER_CANCELLATION'));
  assert.equal(r.execution_authorized, false);
  assert.equal(inspectSuppliedTrace({ complete: false, events: [
    { id: '1', type: 'admitted' }, { id: '2', type: 'dispatch' },
    { id: '3', type: 'receiver', count: 1 }, { id: '4', type: 'response', outcome: 'ok' },
  ] }).conclusion, 'UNRESOLVED_MISSING_EVIDENCE');
});
