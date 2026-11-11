import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TTL_MS, bindingDigest, classifyMetric, createLedger, createFeed } from '../experiments/external-evaluation/recovery-safety/simulator.mjs';

const T0 = 1_000_000_000_000, M = 60_000;
const op = { opId: 'op-1', target: 'row-A', attempt: 'k1' };
const obs = (kind, o = {}) => ({ kind, opId: 'op-1', target: 'row-A', attempt: 'k1', ts: T0, trusted: true, ...o });
const metric = (o = {}) => ({ ts: T0, trusted: true, backlog: 3, retentionValid: true, latencyValid: true, backlogValid: true, ...o });
const grant = (o = {}) => ({ grantId: 'g1', opId: 'op-1', target: 'row-A', attempt: 'k1', digest: bindingDigest('op-1', 'row-A', 'k1'), ts: T0, ...o });
const ledger = () => { const l = createLedger({ grantVerifier: g => g.grantId.startsWith('g') }); l.begin(op); return l; };
const absent = (l, now = T0) => { assert.equal(l.resolve(now, obs('NOT_FOUND')).reason, 'CONFIRMED_ABSENT'); return l; };
const retry = (o = {}) => ({ kind: 'RETRY_SAME_OP', opId: 'op-1', nextAttempt: 'k2', metric: metric(), authorization: grant(), ...o });
const reason = (r, d, c) => { assert.equal(r.decision, d); assert.equal(r.reason, c); };

test('3kkdf: readback TIMEOUT stays UNKNOWN_HELD and denies blind retry and dependent write', () => {
 const l = ledger();
 reason(l.resolve(T0, obs('TIMEOUT')), 'DENIED', 'READBACK_TIMEOUT');
 assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD');
 reason(l.decide(T0, retry()), 'DENIED', 'BLIND_RETRY_UNKNOWN');
 reason(l.decide(T0, { kind: 'DEPENDENT_WRITE', opId: 'op-1', metric: metric() }), 'DENIED', 'DEPENDENT_WRITE_ON_UNRESOLVED');
 assert.equal(l.dispatcher.count, 0);
});

test('3kkdf: repeated timeouts never promote to NOT_FOUND', () => {
 const l = ledger();
 for (let i = 0; i < 5; i++) l.resolve(T0 + i, obs('TIMEOUT'));
 assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD');
 assert.equal(l.dispatcher.count, 0);
});

test('3kkdf: NOT_FOUND is rejected unless trusted, fresh and matching on every field (one fact each)', () => {
 const cases = [
  [{ trusted: false }, 'SOURCE_UNTRUSTED'], [{ opId: 'op-2' }, 'OP_UNKNOWN'], [{ target: 'row-B' }, 'EVIDENCE_MISMATCH'],
  [{ attempt: 'k2' }, 'EVIDENCE_MISMATCH'], [{ ts: T0 - TTL_MS }, 'NOT_FOUND_STALE'], [{ ts: T0 + 1 }, 'NOT_FOUND_STALE'], [{ ts: NaN }, 'NOT_FOUND_STALE'],
 ];
 for (const [bad, code] of cases) {
  const l = ledger();
  reason(l.resolve(T0, obs('NOT_FOUND', bad)), 'DENIED', code);
  assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD', code);
  reason(l.decide(T0, retry()), 'DENIED', 'BLIND_RETRY_UNKNOWN');
  assert.equal(l.dispatcher.count, 0);
 }
 const ok = ledger(); // positive control: all facts corrected
 reason(ok.resolve(T0, obs('NOT_FOUND')), 'ALLOWED_SIMULATED', 'CONFIRMED_ABSENT');
});

test('3kkdf: TTL boundary is exclusive at TTL (60 min): TTL-1 fresh, TTL and TTL+1 stale', () => {
 assert.equal(TTL_MS, 60 * M);
 for (const [age, code] of [[TTL_MS - 1, 'CONFIRMED_ABSENT'], [TTL_MS, 'NOT_FOUND_STALE'], [TTL_MS + 1, 'NOT_FOUND_STALE']]) {
  const l = ledger();
  assert.equal(l.resolve(T0 + age, obs('NOT_FOUND')).reason, code);
 }
});

test('3kkdf: resolution alone never replays; replay needs its own decide with fresh evidence', () => {
 const l = absent(ledger());
 assert.equal(l.dispatcher.count, 0);
 reason(l.decide(T0, retry()), 'ALLOWED_SIMULATED', 'REPLAY_ONCE');
 assert.equal(l.dispatcher.count, 1);
 assert.deepEqual(l.dispatcher.sent[0], { kind: 'RETRY_SAME_OP', opId: 'op-1', grantId: 'g1', attempt: 'k2' });
});

test('3kkdf: a later TIMEOUT does not revert a confirmed outcome, but absence going stale denies replay', () => {
 const l = absent(ledger());
 l.resolve(T0 + 1, obs('TIMEOUT'));
 assert.equal(l.outcome('op-1'), 'CONFIRMED_ABSENT');
 reason(l.decide(T0 + TTL_MS, retry({ metric: metric({ ts: T0 + TTL_MS }), authorization: grant({ ts: T0 + TTL_MS }) })), 'DENIED', 'NOT_FOUND_STALE');
 assert.equal(l.dispatcher.count, 0);
});

test('replay requires every condition: metric, independent authorization, same op id (one fact each)', () => {
 const cases = [
  [{ metric: metric({ ts: T0 - TTL_MS }) }, 'METRIC_EXPIRED'], [{ metric: undefined }, 'METRIC_UNKNOWN'],
  [{ authorization: undefined }, 'AUTHORIZATION_MISSING'], [{ authorization: grant({ opId: 'op-2' }) }, 'AUTHORIZATION_MISSING'],
  [{ authorization: grant({ grantId: 'x1' }) }, 'AUTHORIZATION_MISSING'], [{ authorization: grant({ ts: T0 - TTL_MS }) }, 'AUTHORIZATION_MISSING'],
  [{ authorization: grant({ target: 'row-B' }) }, 'AUTHORIZATION_MISSING'], [{ authorization: grant({ attempt: 'k0' }) }, 'AUTHORIZATION_MISSING'],
  [{ authorization: grant({ digest: bindingDigest('op-1', 'row-A', 'k0') }) }, 'AUTHORIZATION_MISSING'], [{ authorization: grant({ digest: undefined }) }, 'AUTHORIZATION_MISSING'],
  [{ nextAttempt: undefined }, 'NEXT_ATTEMPT_INVALID'], [{ nextAttempt: 'k1' }, 'NEXT_ATTEMPT_INVALID'],
  [{ opId: 'op-2' }, 'OP_UNKNOWN'],
 ];
 for (const [bad, code] of cases) {
  const l = absent(ledger());
  reason(l.decide(T0, retry(bad)), 'DENIED', code);
  assert.equal(l.dispatcher.count, 0, code);
 }
 const noVerifier = createLedger(); noVerifier.begin(op); absent(noVerifier); // self-attestation: no independent trust root
 reason(noVerifier.decide(T0, retry()), 'DENIED', 'AUTHORIZATION_MISSING');
});

test('a consumed grant is burned: it cannot be reused, even re-bound to the new attempt under the same grantId', () => {
 const l = absent(ledger());
 reason(l.decide(T0, retry()), 'ALLOWED_SIMULATED', 'REPLAY_ONCE');
 const t1 = T0 + 1;
 reason(l.resolve(t1, obs('NOT_FOUND', { attempt: 'k2', ts: t1 })), 'ALLOWED_SIMULATED', 'CONFIRMED_ABSENT');
 const again = { metric: metric({ ts: t1 }), nextAttempt: 'k3' };
 reason(l.decide(t1, retry({ ...again, authorization: grant({ ts: t1 }) })), 'DENIED', 'AUTHORIZATION_MISSING'); // g1 is bound to k1
 const rebound = grant({ ts: t1, attempt: 'k2', digest: bindingDigest('op-1', 'row-A', 'k2') }); // same grantId, new attempt
 reason(l.decide(t1, retry({ ...again, authorization: rebound })), 'DENIED', 'GRANT_CONSUMED');
 assert.equal(l.burned.has('g1'), true);
 assert.equal(l.dispatcher.count, 1);
});

test('replay invalidates the absence before dispatch: g2, an old NOT_FOUND and a TIMEOUT cannot permit another send', () => {
 const l = absent(ledger());
 reason(l.decide(T0, retry()), 'ALLOWED_SIMULATED', 'REPLAY_ONCE');
 assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD');
 assert.equal(l.ops.get('op-1').evidenceTs, null);
 const t1 = T0 + 1, g2 = grant({ grantId: 'g2', ts: t1, attempt: 'k2', digest: bindingDigest('op-1', 'row-A', 'k2') });
 const again = retry({ metric: metric({ ts: t1 }), authorization: g2, nextAttempt: 'k3' });
 reason(l.decide(t1, again), 'DENIED', 'BLIND_RETRY_UNKNOWN'); // a new grant alone is not proof of non-execution
 reason(l.resolve(t1, obs('NOT_FOUND', { ts: T0 })), 'DENIED', 'EVIDENCE_MISMATCH'); // old attempt k1
 reason(l.resolve(t1, obs('NOT_FOUND', { attempt: 'k2', ts: T0 })), 'DENIED', 'EVIDENCE_PREDATES_ATTEMPT'); // pre-send absence
 reason(l.resolve(t1, obs('NOT_FOUND', { attempt: 'k2', ts: T0 + 0 })), 'DENIED', 'EVIDENCE_PREDATES_ATTEMPT');
 reason(l.resolve(t1, obs('TIMEOUT', { attempt: 'k2' })), 'DENIED', 'READBACK_TIMEOUT');
 reason(l.decide(t1, again), 'DENIED', 'BLIND_RETRY_UNKNOWN');
 assert.equal(l.dispatcher.count, 1);
 // positive control: post-attempt evidence for the new attempt re-opens exactly one further replay
 reason(l.resolve(t1 + 1, obs('NOT_FOUND', { attempt: 'k2', ts: t1 + 1 })), 'ALLOWED_SIMULATED', 'CONFIRMED_ABSENT');
 reason(l.decide(t1 + 1, { ...again, metric: metric({ ts: t1 + 1 }), authorization: { ...g2, ts: t1 + 1 } }), 'ALLOWED_SIMULATED', 'REPLAY_ONCE');
 assert.equal(l.dispatcher.count, 2);
 assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD');
});

test('a replayed attempt cannot be reused as nextAttempt, and FOUND for the old attempt does not resolve the new one', () => {
 const l = absent(ledger());
 l.decide(T0, retry());
 reason(l.resolve(T0 + 1, obs('FOUND', { ts: T0 + 1 })), 'DENIED', 'EVIDENCE_MISMATCH');
 assert.equal(l.outcome('op-1'), 'UNKNOWN_HELD');
 reason(l.resolve(T0 + 1, obs('NOT_FOUND', { attempt: 'k2', ts: T0 + 1 })), 'ALLOWED_SIMULATED', 'CONFIRMED_ABSENT');
 const g = grant({ grantId: 'g3', ts: T0 + 1, attempt: 'k2', digest: bindingDigest('op-1', 'row-A', 'k2') });
 reason(l.decide(T0 + 1, retry({ metric: metric({ ts: T0 + 1 }), authorization: g, nextAttempt: 'k1' })), 'DENIED', 'NEXT_ATTEMPT_INVALID');
 assert.equal(l.dispatcher.count, 1);
});

test('begin rejects a duplicate operation id and keeps the original identity, outcome and evidence', () => {
 const l = absent(ledger());
 reason(l.begin({ opId: 'op-1', target: 'row-B', attempt: 'k9' }), 'DENIED', 'OP_DUPLICATE');
 assert.deepEqual([l.ops.get('op-1').target, l.ops.get('op-1').attempt], ['row-A', 'k1']);
 assert.equal(l.outcome('op-1'), 'CONFIRMED_ABSENT');
 reason(l.decide(T0, retry({ authorization: grant({ target: 'row-B', attempt: 'k9', digest: bindingDigest('op-1', 'row-B', 'k9') }) })), 'DENIED', 'AUTHORIZATION_MISSING');
 for (const bad of [undefined, {}, { opId: 'op-3', target: 'row-A' }, { opId: '', target: 't', attempt: 'a' }]) reason(l.begin(bad), 'DENIED', 'BEGIN_INVALID');
 assert.equal(l.ops.size, 1);
 assert.equal(l.dispatcher.count, 0);
});

test('FOUND confirms applied: replay is denied and a dependent write is allowed only then', () => {
 const l = ledger();
 reason(l.resolve(T0, obs('FOUND')), 'ALLOWED_SIMULATED', 'CONFIRMED_APPLIED');
 reason(l.resolve(T0, obs('NOT_FOUND')), 'DENIED', 'CONFLICT_WITH_APPLIED');
 reason(l.decide(T0, retry()), 'DENIED', 'ALREADY_APPLIED');
 assert.equal(l.dispatcher.count, 0);
 reason(l.decide(T0, { kind: 'DEPENDENT_WRITE', opId: 'op-1', metric: metric() }), 'ALLOWED_SIMULATED', 'DEPENDENT_WRITE');
 assert.equal(l.dispatcher.count, 1);
});

test('3kked: metric validity table fails closed (ts boundary, missing, non-finite, untrusted, unknown validity)', () => {
 const st = (m, now = T0, ttl) => classifyMetric(now, m, ttl).state;
 assert.equal(st(metric()), 'VALID');
 assert.equal(st(metric({ ts: T0 - (TTL_MS - 1) })), 'VALID');
 assert.equal(st(metric({ ts: T0 - TTL_MS })), 'EXPIRED');
 assert.equal(st(metric({ ts: T0 - TTL_MS - 1 })), 'EXPIRED');
 for (const bad of [{ ts: T0 + 1 }, { ts: undefined }, { ts: NaN }, { ts: Infinity }, { trusted: false }, { retentionValid: undefined },
  { latencyValid: false }, { backlogValid: 'yes' }, { backlog: -1 }, { backlog: 1.5 }, { backlog: NaN }, { backlog: undefined }]) assert.equal(st(metric(bad)), 'UNKNOWN', JSON.stringify(bad));
 assert.equal(st(undefined), 'UNKNOWN');
 assert.equal(st(metric(), T0, -1), 'UNKNOWN');
 assert.equal(st(metric(), T0, NaN), 'UNKNOWN');
});

test('3kked: stale or unknown metric stops the feed, sends nothing, and keeps lastSentTs', () => {
 const f = createFeed();
 reason(f.tick(T0, metric()), 'ALLOWED_SIMULATED', 'SENT');
 assert.equal(f.lastSentTs, T0);
 for (const [m, code] of [[metric({ ts: T0 }), 'METRIC_EXPIRED'], [metric({ ts: T0, retentionValid: false }), 'METRIC_UNKNOWN']]) {
  const g = createFeed(); g.tick(T0, metric());
  const now = T0 + TTL_MS, bad = code === 'METRIC_EXPIRED' ? m : { ...m, ts: now };
  reason(g.tick(now, bad), 'DENIED', code);
  assert.equal(g.state, 'STOPPED'); assert.equal(g.lastSentTs, T0); assert.equal(g.dispatcher.count, 1);
 }
 const z = createFeed(); // unknown validity denies even with zero backlog
 reason(z.tick(T0, metric({ backlog: 0, latencyValid: undefined })), 'DENIED', 'METRIC_UNKNOWN');
 assert.equal(z.dispatcher.count, 0);
});

test('3kked: a refreshed metric does not auto-resume, and an old value is never resent', () => {
 const f = createFeed(); f.tick(T0, metric());
 const later = T0 + TTL_MS; f.tick(later, metric()); // stale -> STOPPED
 reason(f.tick(later + 1, metric({ ts: later + 1, backlog: 9 })), 'DENIED', 'FEED_STOPPED_REQUIRES_RESUME');
 assert.equal(f.dispatcher.count, 1); assert.equal(f.lastSentTs, T0);
 reason(f.resume(later + 1, metric({ ts: later - TTL_MS })), 'DENIED', 'METRIC_EXPIRED');
 assert.equal(f.state, 'STOPPED');
 reason(f.resume(later + 1, metric({ ts: later + 1 })), 'ALLOWED_SIMULATED', 'RESUMED');
 reason(f.tick(later + 2, metric({ ts: later + 1, backlog: 9 })), 'ALLOWED_SIMULATED', 'SENT');
 reason(f.tick(later + 3, metric({ ts: later + 1, backlog: 9 })), 'DENIED', 'METRIC_ALREADY_SENT');
 assert.equal(f.dispatcher.count, 2);
});

test('3kked: A->B->A with fresh timestamps never resends A (count 2, lastSentTs unchanged)', () => {
 const f = createFeed();
 reason(f.tick(T0, metric({ ts: T0, backlog: 1 })), 'ALLOWED_SIMULATED', 'SENT'); // A
 reason(f.tick(T0 + 2, metric({ ts: T0 + 2, backlog: 2 })), 'ALLOWED_SIMULATED', 'SENT'); // B
 reason(f.tick(T0 + 3, metric({ ts: T0, backlog: 1 })), 'DENIED', 'METRIC_OUT_OF_ORDER'); // A again, still within TTL
 reason(f.tick(T0 + 3, metric({ ts: T0 + 2, backlog: 2 })), 'DENIED', 'METRIC_ALREADY_SENT');
 assert.equal(f.dispatcher.count, 2); assert.equal(f.lastSentTs, T0 + 2); assert.equal(f.lastSentMetricTs, T0 + 2);
 assert.deepEqual(f.dispatcher.sent.map(x => x.metricTs), [T0, T0 + 2]);
});

test('3kked: after stop and resume an older metric is not sent (count and lastSentTs unchanged)', () => {
 const f = createFeed(), b = T0 + 100;
 reason(f.tick(b, metric({ ts: b, backlog: 4 })), 'ALLOWED_SIMULATED', 'SENT');
 reason(f.tick(b + 1, metric({ ts: b + 1, latencyValid: false })), 'DENIED', 'METRIC_UNKNOWN');
 assert.equal(f.state, 'STOPPED');
 reason(f.resume(b + 2, metric({ ts: T0 + 50 })), 'ALLOWED_SIMULATED', 'RESUMED'); // fresh and valid, but older than the last sent
 reason(f.tick(b + 2, metric({ ts: T0 + 50, backlog: 7 })), 'DENIED', 'METRIC_OUT_OF_ORDER');
 reason(f.tick(b + 2, metric({ ts: b, backlog: 4 })), 'DENIED', 'METRIC_ALREADY_SENT');
 assert.equal(f.dispatcher.count, 1); assert.equal(f.lastSentTs, b); assert.equal(f.lastSentMetricTs, b);
 reason(f.tick(b + 3, metric({ ts: b + 3, backlog: 5 })), 'ALLOWED_SIMULATED', 'SENT'); // positive control: a newer metric still flows
 assert.equal(f.dispatcher.count, 2);
});

test('3kked: positive controls — zero backlog is a no-op; positive backlog sends exactly once', () => {
 const f = createFeed();
 reason(f.tick(T0, metric({ backlog: 0 })), 'ALLOWED_SIMULATED', 'NOOP_ZERO_BACKLOG');
 assert.equal(f.dispatcher.count, 0);
 reason(f.tick(T0, metric({ backlog: 2 })), 'ALLOWED_SIMULATED', 'SENT');
 assert.equal(f.dispatcher.count, 1);
});

test('simulator is deterministic and free of ambient time, I/O and network', () => {
 const src = fs.readFileSync(new URL('../experiments/external-evaluation/recovery-safety/simulator.mjs', import.meta.url), 'utf8');
 assert.doesNotMatch(src, /Date\.now|new Date|performance\.now|setTimeout|setInterval|Math\.random|\bimport\b|require\(|fetch\(|process\./);
 const run = () => { const l = absent(ledger()); l.decide(T0, retry()); return JSON.stringify([l.dispatcher.sent, [...l.burned]]); };
 assert.equal(run(), run());
});
