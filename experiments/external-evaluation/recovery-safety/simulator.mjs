// Fully synthetic recovery-safety simulator. No I/O, no ambient time, no network.
// Only dispatcher.count / dispatcher.sent can record a (simulated) send.
export const TTL_MS = 60 * 60 * 1000;
const ts = v => typeof v === 'number' && Number.isFinite(v);
// Age strictly below ttl is fresh; age >= ttl is expired; future-dated is untrusted.
export function freshness(now, at, ttlMs = TTL_MS) {
 if (!ts(now) || !ts(at) || !ts(ttlMs) || ttlMs <= 0) return 'UNKNOWN';
 const age = now - at;
 return age < 0 ? 'UNKNOWN' : age >= ttlMs ? 'EXPIRED' : 'VALID';
}
// Retention, latency and backlog validity must each be exactly `true`; anything else is UNKNOWN.
export function classifyMetric(now, metric, ttlMs = TTL_MS) {
 if (!metric || typeof metric !== 'object' || metric.trusted !== true) return { state: 'UNKNOWN', reason: 'METRIC_UNKNOWN' };
 const f = freshness(now, metric.ts, ttlMs);
 if (f === 'EXPIRED') return { state: 'EXPIRED', reason: 'METRIC_EXPIRED' };
 if (f !== 'VALID') return { state: 'UNKNOWN', reason: 'METRIC_UNKNOWN' };
 if (metric.retentionValid !== true || metric.latencyValid !== true || metric.backlogValid !== true) return { state: 'UNKNOWN', reason: 'METRIC_UNKNOWN' };
 if (!Number.isInteger(metric.backlog) || metric.backlog < 0) return { state: 'UNKNOWN', reason: 'METRIC_UNKNOWN' };
 return { state: 'VALID', reason: 'METRIC_VALID' };
}
export const createDispatcher = () => ({ count: 0, sent: [], send(item) { this.count += 1; this.sent.push(item); } });
const allow = (reason, extra = {}) => ({ decision: 'ALLOWED_SIMULATED', reason, ...extra });
const deny = reason => ({ decision: 'DENIED', reason });

// grantVerifier is the independent trust root (injected); resolution never mints a grant.
// A grant binds one operation, target and attempt through this canonical identity string (not a cryptographic hash).
export const bindingDigest = (opId, target, attempt) => JSON.stringify([opId, target, attempt]);
const str = v => typeof v === 'string' && v.length > 0;

// ops/burned are public for the trusted test harness only; callers inside the model must use the methods.
export function createLedger({ ttlMs = TTL_MS, dispatcher = createDispatcher(), grantVerifier = () => false } = {}) {
 const ops = new Map(), burned = new Set();
 const matches = (op, o) => o && o.opId === op.opId && o.target === op.target && o.attempt === op.attempt;
 return {
  dispatcher, ops, burned,
  // A duplicate begin is rejected: the first identity is never overwritten.
  begin(op) {
   if (!op || !str(op.opId) || !str(op.target) || !str(op.attempt)) return deny('BEGIN_INVALID');
   if (ops.has(op.opId)) return deny('OP_DUPLICATE');
   ops.set(op.opId, { opId: op.opId, target: op.target, attempt: op.attempt, attempts: new Set([op.attempt]), attemptAt: null, outcome: 'UNKNOWN_HELD', evidenceTs: null });
   return allow('BEGUN');
  },
  outcome: opId => ops.get(opId)?.outcome,
  // Observations only move the outcome; they never dispatch and never grant replay.
  resolve(now, obs) {
   const op = ops.get(obs?.opId);
   if (!op) return deny('OP_UNKNOWN');
   if (obs.kind === 'TIMEOUT') return deny('READBACK_TIMEOUT');
   if (obs.kind !== 'FOUND' && obs.kind !== 'NOT_FOUND') return deny('OBSERVATION_INVALID');
   if (obs.trusted !== true) return deny('SOURCE_UNTRUSTED');
   if (!matches(op, obs)) return deny('EVIDENCE_MISMATCH');
   if (freshness(now, obs.ts, ttlMs) !== 'VALID') return deny(obs.kind === 'NOT_FOUND' ? 'NOT_FOUND_STALE' : 'FOUND_STALE');
   if (op.attemptAt !== null && !(obs.ts > op.attemptAt)) return deny('EVIDENCE_PREDATES_ATTEMPT'); // must be observed after the replay was sent
   if (obs.kind === 'FOUND') { op.outcome = 'CONFIRMED_APPLIED'; op.evidenceTs = obs.ts; return allow('CONFIRMED_APPLIED'); }
   if (op.outcome === 'CONFIRMED_APPLIED') return deny('CONFLICT_WITH_APPLIED');
   op.outcome = 'CONFIRMED_ABSENT'; op.evidenceTs = obs.ts;
   return allow('CONFIRMED_ABSENT');
  },
  // Replay of the same operation, or a write that depends on it. Every condition is re-checked here.
  decide(now, req) {
   const op = ops.get(req?.opId);
   if (!op) return deny('OP_UNKNOWN');
   if (req.kind === 'DEPENDENT_WRITE') {
    if (op.outcome !== 'CONFIRMED_APPLIED') return deny('DEPENDENT_WRITE_ON_UNRESOLVED');
    if (classifyMetric(now, req.metric, ttlMs).state !== 'VALID') return deny(classifyMetric(now, req.metric, ttlMs).reason);
    dispatcher.send({ kind: req.kind, opId: op.opId }); return allow('DEPENDENT_WRITE');
   }
   if (req.kind !== 'RETRY_SAME_OP') return deny('REQUEST_INVALID');
   if (op.outcome === 'UNKNOWN_HELD') return deny('BLIND_RETRY_UNKNOWN');
   if (op.outcome === 'CONFIRMED_APPLIED') return deny('ALREADY_APPLIED');
   if (freshness(now, op.evidenceTs, ttlMs) !== 'VALID') return deny('NOT_FOUND_STALE');
   const m = classifyMetric(now, req.metric, ttlMs);
   if (m.state !== 'VALID') return deny(m.reason);
   const g = req.authorization;
   if (!g || typeof g.grantId !== 'string' || g.opId !== op.opId || g.target !== op.target || g.attempt !== op.attempt
    || g.digest !== bindingDigest(op.opId, op.target, op.attempt) || grantVerifier(g) !== true || freshness(now, g.ts, ttlMs) !== 'VALID') return deny('AUTHORIZATION_MISSING');
   if (burned.has(g.grantId)) return deny('GRANT_CONSUMED');
   if (!str(req.nextAttempt) || op.attempts.has(req.nextAttempt)) return deny('NEXT_ATTEMPT_INVALID');
   burned.add(g.grantId); // burn before send; never released, even if the send is later lost
   // The absence proved the previous attempt only: invalidate it before dispatch. A grant is not proof of non-execution.
   op.attempt = req.nextAttempt; op.attempts.add(req.nextAttempt); op.attemptAt = now; op.outcome = 'UNKNOWN_HELD'; op.evidenceTs = null;
   dispatcher.send({ kind: req.kind, opId: op.opId, grantId: g.grantId, attempt: op.attempt });
   return allow('REPLAY_ONCE');
  },
 };
}

// Backlog feed: a stopped feed stays stopped until an explicit resume; only a metric newer than the last sent one is sent.
export function createFeed({ ttlMs = TTL_MS, dispatcher = createDispatcher() } = {}) {
 const feed = {
  dispatcher, state: 'RUNNING', lastSentTs: null, lastSentMetricTs: null, // lastSentMetricTs is the high-water mark of sent metrics
  tick(now, metric) {
   const m = classifyMetric(now, metric, ttlMs);
   if (m.state !== 'VALID') { feed.state = 'STOPPED'; return deny(m.reason); }
   if (feed.state !== 'RUNNING') return deny('FEED_STOPPED_REQUIRES_RESUME');
   if (feed.lastSentMetricTs !== null) {
    if (metric.ts === feed.lastSentMetricTs) return deny('METRIC_ALREADY_SENT');
    if (metric.ts < feed.lastSentMetricTs) return deny('METRIC_OUT_OF_ORDER'); // A->B->A never resends A
   }
   if (metric.backlog === 0) return allow('NOOP_ZERO_BACKLOG');
   dispatcher.send({ backlog: metric.backlog, metricTs: metric.ts });
   feed.lastSentTs = now; feed.lastSentMetricTs = metric.ts;
   return allow('SENT');
  },
  resume(now, metric) {
   const m = classifyMetric(now, metric, ttlMs);
   if (m.state !== 'VALID') return deny(m.reason);
   feed.state = 'RUNNING'; return allow('RESUMED');
  },
 };
 return feed;
}
