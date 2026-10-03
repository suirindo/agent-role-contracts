import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeFinancialIntent, validateFinancialIntent, validateFinancialExecution } from '../src/index.mjs';

const json = JSON.stringify;
const at = '2030-01-01T00:00:03Z';
const executionAt = '2030-01-01T00:00:05Z';
const max = ((1n << 256n) - 1n).toString();
const fixture = name => JSON.parse(readFileSync(new URL('../examples/onchain-finance/' + name + '.json', import.meta.url), 'utf8'));
const data = () => ({ bundle: fixture('bundle'), task: fixture('task'), policy: fixture('policy'), intent: fixture('intent') });
const check = (d, time = at) => validateFinancialIntent(json(d.bundle), json(d.task), json(d.policy), json(d.intent), time);
const describe = d => describeFinancialIntent(json(d.bundle), json(d.task), json(d.policy), json(d.intent.transaction));
const checkExecution = (d, receipt = fixture('execution'), time = executionAt) => validateFinancialExecution(json(d.bundle), json(d.task), json(d.policy), json(d.intent), json(receipt), time);
async function rebind(d) {
  const subject = await describe(d);
  assert.equal(subject.valid, true, json(subject.errors));
  for (const key of ['simulation', 'review', 'human_approval']) d.intent[key].subject_digest = subject.subject_digest;
  return d;
}
function invalid(name, change, code) {
  test(name, async () => {
    const d = data(); change(d);
    const r = await check(d);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(error => error.code === code), json(r.errors));
    assert.equal(r.execution_authorized, false);
    assert.equal(r.financial_safety_verified, false);
  });
}

test('financial execution receipt binds to the approved subject without claiming chain verification', async () => {
  const d = data(); const result = await checkExecution(d);
  assert.equal(result.valid, true, json(result.errors));
  assert.equal(result.kind, 'financial-execution');
  assert.equal(result.validation_stage, 'execution');
  assert.equal(result.execution.transaction_hash, '0x' + 'a'.repeat(64));
  for (const key of ['execution_authorized', 'execution_receipt_verified', 'transaction_hash_verified', 'transaction_serialization_verified', 'chain_state_verified', 'replay_protection_enforced']) {
    assert.equal(result[key], false, key);
  }
});

function invalidExecution(name, change, code) {
  test(name, async () => {
    const d = data(), receipt = fixture('execution'); change(d, receipt);
    const r = await checkExecution(d, receipt);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(error => error.code === code), json(r.errors));
    assert.equal(r.execution_authorized, false);
    assert.equal(r.execution_receipt_verified, false);
  });
}

invalidExecution('execution receipt from a different subject is refused', (d, r) => r.subject_digest = 'sha256:' + '0'.repeat(64), 'FINANCE_EXECUTION_SUBJECT_MISMATCH');
invalidExecution('execution receipt from a different chain is refused', (d, r) => r.chain_id = '1', 'FINANCE_EXECUTION_CHAIN_MISMATCH');
invalidExecution('execution receipt from a different nonce is refused', (d, r) => r.nonce = '8', 'FINANCE_EXECUTION_NONCE_MISMATCH');
invalidExecution('reverted execution receipt is refused', (d, r) => r.status = 'reverted', 'FINANCE_EXECUTION_REVERTED');
invalidExecution('all-zero transaction hash is refused as placeholder evidence', (d, r) => r.transaction_hash = '0x' + '0'.repeat(64), 'FINANCE_EXECUTION_TX_HASH_ZERO');
invalidExecution('execution cannot predate the bound human approval', (d, r) => r.executed_at = '2030-01-01T00:00:01Z', 'FINANCE_EXECUTION_BEFORE_APPROVAL');
invalidExecution('execution observation cannot predate execution', (d, r) => r.observed_at = '2030-01-01T00:00:02Z', 'FINANCE_EXECUTION_TIME_ORDER');
invalidExecution('future execution observation is refused', (d, r) => r.observed_at = '2030-01-01T00:00:06Z', 'FINANCE_EXECUTION_FROM_FUTURE');
invalidExecution('execution receipt schema fails closed on extra fields', (d, r) => r.rpc_url = 'https://example.invalid', 'SCHEMA_ADDITIONALPROPERTIES');

test('fresh intent evidence cannot be paired with an old execution receipt after proposal mutation', async () => {
  const d = data(); d.intent.transaction.amount_base_units = '249999999'; await rebind(d);
  const r = await checkExecution(d, fixture('execution'));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(error => error.code === 'FINANCE_EXECUTION_SUBJECT_MISMATCH'), json(r.errors));
});

test('financial fixture has a reproducible complete subject and passes', async () => {
  const d = data(), subject = await describe(d), result = await check(d);
  assert.equal(subject.valid, true, json(subject.errors));
  assert.equal(subject.validation_stage, 'proposal');
  assert.equal(subject.subject_digest, d.intent.review.subject_digest);
  assert.equal(result.valid, true, json(result.errors));
  assert.equal(result.validation_stage, 'intent');
  assert.equal(result.evaluated_at, at);
  for (const key of ['execution_authorized', 'runtime_enforcement', 'identity_verified', 'evidence_verified', 'source_files_checked', 'sensitive_data_scanned', 'output_schema_validated', 'chain_state_verified', 'simulation_executed', 'address_checksum_verified', 'transaction_serialization_verified', 'financial_safety_verified', 'replay_protection_enforced']) {
    assert.equal(subject[key], false, key); assert.equal(result[key], false, key);
  }
});

test('native transfer passes with native asset and null return value', async () => {
  const d = data();
  Object.assign(d.intent.transaction, { operation: 'native_transfer', asset: 'native', amount_base_units: '1000000000000000' });
  d.intent.simulation.return_value = null;
  const r = await check(await rebind(d)); assert.equal(r.valid, true, json(r.errors));
});
test('bounded ERC-20 approval and zero-amount revocation pass', async () => {
  for (const [amount, current] of [['100000000', '0'], ['0', '100000000']]) {
    const d = data();
    Object.assign(d.intent.transaction, { operation: 'erc20_approve', target: d.policy.allowed_spenders[0], amount_base_units: amount, current_allowance_base_units: current });
    const r = await check(await rebind(d)); assert.equal(r.valid, true, json(r.errors));
  }
});
test('ERC-20 zero-value transfer remains supported', async () => {
  const d = data(); d.intent.transaction.amount_base_units = '0';
  assert.equal((await check(await rebind(d))).valid, true);
});

invalid('different proposal chain is refused', d => d.intent.transaction.chain_id = '1', 'FINANCE_CHAIN_NOT_ALLOWED');
invalid('unregistered sender is refused', d => d.intent.transaction.sender = '0x' + '5'.repeat(40), 'FINANCE_SENDER_NOT_ALLOWED');
invalid('unregistered recipient is refused', d => d.intent.transaction.target = '0x' + '5'.repeat(40), 'FINANCE_RECIPIENT_NOT_ALLOWED');
invalid('unregistered spender is refused', d => { d.intent.transaction.operation = 'erc20_approve'; d.intent.transaction.current_allowance_base_units = '0'; }, 'FINANCE_SPENDER_NOT_ALLOWED');
invalid('token policy cannot be borrowed for another asset', d => d.intent.transaction.asset = '0x' + '5'.repeat(40), 'FINANCE_ASSET_NOT_ALLOWED');
invalid('native transfer cannot name a token contract', d => d.intent.transaction.operation = 'native_transfer', 'FINANCE_OPERATION_ASSET_MISMATCH');
invalid('ERC-20 transfer cannot name native currency', d => d.intent.transaction.asset = 'native', 'FINANCE_OPERATION_ASSET_MISMATCH');
invalid('one base unit above the payment ceiling is refused', d => d.intent.transaction.amount_base_units = '500000001', 'FINANCE_TRANSFER_LIMIT_EXCEEDED');
invalid('fee ceiling above the native fee cap is refused', d => d.intent.transaction.max_fee_base_units = '1000000000000001', 'FINANCE_FEE_LIMIT_EXCEEDED');
invalid('approval ceiling is separate from the transfer ceiling', d => Object.assign(d.intent.transaction, { operation: 'erc20_approve', target: d.policy.allowed_spenders[0], current_allowance_base_units: '0', amount_base_units: '100000001' }), 'FINANCE_APPROVAL_LIMIT_EXCEEDED');
invalid('unlimited allowance is refused even when policy limit is max uint256', d => { d.policy.asset_limits[0].max_approval_base_units = max; Object.assign(d.intent.transaction, { operation: 'erc20_approve', target: d.policy.allowed_spenders[0], current_allowance_base_units: '0', amount_base_units: max }); }, 'FINANCE_UNLIMITED_APPROVAL_REFUSED');
invalid('nonzero-to-nonzero allowance update requires reset', d => Object.assign(d.intent.transaction, { operation: 'erc20_approve', target: d.policy.allowed_spenders[0], current_allowance_base_units: '1', amount_base_units: '2' }), 'FINANCE_ALLOWANCE_RESET_REQUIRED');
invalid('approval requires a current-allowance declaration', d => Object.assign(d.intent.transaction, { operation: 'erc20_approve', target: d.policy.allowed_spenders[0] }), 'FINANCE_ALLOWANCE_DECLARATION_REQUIRED');
invalid('a transfer cannot carry an allowance value', d => d.intent.transaction.current_allowance_base_units = '0', 'FINANCE_ALLOWANCE_NOT_APPLICABLE');

test('comparison stays exact beyond Number.MAX_SAFE_INTEGER', async () => {
  const d = data(); d.policy.asset_limits[0].max_transfer_base_units = '9007199254740992'; d.intent.transaction.amount_base_units = '9007199254740993';
  const r = await check(d); assert.ok(r.errors.some(error => error.code === 'FINANCE_TRANSFER_LIMIT_EXCEEDED'));
  d.intent.transaction.amount_base_units = '9007199254740992';
  assert.equal((await check(await rebind(d))).valid, true);
});
test('uint256 maximum is an exact admitted transfer amount', async () => {
  const d = data(); d.policy.asset_limits[0].max_transfer_base_units = max; d.intent.transaction.amount_base_units = max;
  assert.equal((await check(await rebind(d))).valid, true);
});
for (const field of ['chain_id', 'amount_base_units', 'max_fee_base_units', 'nonce']) {
  invalid('uint256 overflow is refused for ' + field, d => d.intent.transaction[field] = (1n << 256n).toString(), 'FINANCE_UINT256_RANGE');
}
invalid('uint256 overflow is refused in the financial policy', d => d.policy.asset_limits[0].max_transfer_base_units = (1n << 256n).toString(), 'FINANCE_UINT256_RANGE');
for (const amount of ['01', '-1', '1.0', '1e9', ' 1', '+1', '1\n', '1\r', '1\u2028', '1\u2029']) invalid('noncanonical base-unit amount ' + json(amount), d => d.intent.transaction.amount_base_units = amount, 'SCHEMA_PATTERN');
invalid('policy amount with a terminal line break is not canonical', d => d.policy.asset_limits[0].max_transfer_base_units += '\n', 'SCHEMA_PATTERN');
invalid('an address with a terminal line break is refused even in both policy and proposal', d => { d.policy.allowed_recipients[0] += '\n'; d.intent.transaction.target += '\n'; }, 'SCHEMA_PATTERN');
invalid('numeric amount is refused instead of silently rounding', d => d.intent.transaction.amount_base_units = 100, 'SCHEMA_TYPE');
invalid('zero-address recipient is refused', d => { d.intent.transaction.target = '0x' + '0'.repeat(40); d.policy.allowed_recipients = [d.intent.transaction.target]; }, 'FINANCE_ZERO_ADDRESS');
invalid('unsupported transaction type is refused', d => d.intent.transaction.operation = 'swap', 'SCHEMA_ENUM');
invalid('extra calldata is refused', d => d.intent.transaction.data = '0x', 'SCHEMA_ADDITIONALPROPERTIES');
invalid('financial policy cannot name an unrelated task type', d => d.policy.task_type = 'another-task', 'FINANCE_TASK_TYPE_MISMATCH');
invalid('asset limits cannot name an undeclared chain', d => d.policy.asset_limits[0].chain_id = '1', 'FINANCE_POLICY_CHAIN_UNDECLARED');
invalid('duplicate chain-asset limits with differing caps are ambiguous', d => d.policy.asset_limits.push({ ...d.policy.asset_limits[0], max_transfer_base_units: '1' }), 'FINANCE_ASSET_LIMIT_AMBIGUOUS');
invalid('hex casing cannot disguise a duplicate allowlist address', d => { d.policy.allowed_recipients = ['0x' + 'a'.repeat(40), '0x' + 'A'.repeat(40)]; }, 'FINANCE_ADDRESS_AMBIGUOUS');
invalid('native policy cannot declare token allowance', d => d.policy.asset_limits[1].max_approval_base_units = '1', 'FINANCE_NATIVE_APPROVAL_UNSUPPORTED');

test('allowlist addresses are compared as 20-byte values; checksums are not claimed', async () => {
  const d = data(); d.policy.allowed_recipients = ['0x' + 'a'.repeat(40)]; d.intent.transaction.target = '0x' + 'A'.repeat(40);
  const r = await check(await rebind(d)); assert.equal(r.valid, true); assert.equal(r.address_checksum_verified, false);
});
invalid('human approval cannot be optional for financial routes', d => d.bundle.routes[0].require_human_approval = false, 'FINANCE_HUMAN_APPROVAL_REQUIRED');
invalid('approver must be an active human-only declaration', d => d.policy.human_approver = 'risk-reviewer', 'FINANCE_APPROVER_ROLE_INVALID');
invalid('approver must be the accountable separate role', d => d.bundle.routes[0].accountable = 'treasury-proposer', 'FINANCE_APPROVER_SEPARATION');
invalid('base self-review check remains enforced', d => d.bundle.routes[0].reviewers = ['treasury-proposer'], 'SELF_REVIEW_DECLARED');
invalid('an unrelated reviewer cannot approve the proposal', d => d.intent.review.role_id = 'treasury-owner', 'FINANCE_REVIEWER_OUTSIDE_ROUTE');
invalid('blocked review cannot pass', d => d.intent.review.decision = 'blocked', 'FINANCE_REVIEW_BLOCKED');
invalid('wrong human approver cannot pass', d => d.intent.human_approval.role_id = 'treasury-proposer', 'FINANCE_APPROVER_MISMATCH');
invalid('denied human approval cannot pass', d => d.intent.human_approval.decision = 'denied', 'FINANCE_APPROVAL_DENIED');
invalid('failed simulation cannot pass', d => d.intent.simulation.status = 'failure', 'FINANCE_SIMULATION_FAILED');
invalid('simulation on a different chain cannot pass', d => d.intent.simulation.chain_id = '1', 'FINANCE_SIMULATION_CHAIN_MISMATCH');
invalid('ERC-20 false return cannot pass even without a revert', d => d.intent.simulation.return_value = false, 'FINANCE_SIMULATION_RETURN_INVALID');
invalid('nonstandard ERC-20 empty return is outside the profile', d => d.intent.simulation.return_value = null, 'FINANCE_SIMULATION_RETURN_INVALID');
invalid('simulation block number must fit uint256', d => d.intent.simulation.block_number = (1n << 256n).toString(), 'FINANCE_UINT256_RANGE');
for (const key of ['simulation', 'review', 'human_approval']) {
  invalid('missing ' + key + ' declaration cannot pass', d => delete d.intent[key], 'SCHEMA_REQUIRED');
  invalid('wrong ' + key + ' subject cannot pass', d => d.intent[key].subject_digest = 'sha256:' + '0'.repeat(64), 'FINANCE_SUBJECT_MISMATCH');
}
for (const [name, change] of [
  ['transaction amount', d => d.intent.transaction.amount_base_units = '249999999'],
  ['transaction nonce', d => d.intent.transaction.nonce = '8'],
  ['financial cap', d => d.policy.asset_limits[0].max_transfer_base_units = '499999999'],
  ['bundle body', d => d.bundle.roles[0].body += 'Changed declaration.'],
  ['task objective', d => d.task.objective += ' Updated.'],
  ['task acceptance', d => d.task.acceptance_criteria.push('New acceptance requirement.')],
  ['task scope', d => d.task.inputs.scope = 'intents/changed.json'],
]) invalid('old evidence does not cover changed ' + name, change, 'FINANCE_SUBJECT_MISMATCH');

test('JSON object-member order does not change the canonical subject', async () => {
  const reverse = v => Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;
  const d = data(); const before = await describe(d);
  const after = await describeFinancialIntent(json(reverse(d.bundle)), json(reverse(d.task)), json(reverse(d.policy)), json(reverse(d.intent.transaction)));
  assert.equal(after.subject_digest, before.subject_digest);
});
invalid('evidence order is simulation then review then human approval', d => d.intent.review.reviewed_at = '2029-12-31T23:59:59Z', 'FINANCE_EVIDENCE_ORDER');
invalid('future approval relative to supplied clock is refused', d => d.intent.human_approval.approved_at = '2030-01-01T00:00:04Z', 'FINANCE_EVIDENCE_FROM_FUTURE');
invalid('calendar rollover is not accepted as a valid timestamp', d => d.intent.simulation.observed_at = '2030-02-30T00:00:00Z', 'FINANCE_EVIDENCE_TIME_INVALID');
test('evidence age boundary is inclusive and becomes stale one millisecond later', async () => {
  const d = data(); assert.equal((await check(d, '2030-01-01T00:05:00Z')).valid, true);
  const r = await check(d, '2030-01-01T00:05:00.001Z'); assert.ok(r.errors.some(error => error.code === 'FINANCE_EVIDENCE_EXPIRED'));
});
for (const value of [undefined, null, {}, '2030-01-01', '2030-01-01T00:00:03+00:00', '2030-02-30T00:00:00Z']) {
  test('explicit canonical evaluation clock is required: ' + json(value), async () => {
    const d = data(); const r = await validateFinancialIntent(json(d.bundle), json(d.task), json(d.policy), json(d.intent), value);
    assert.ok(r.errors.some(error => error.code === 'FINANCE_EVALUATION_TIME_INVALID'));
  });
}
test('financial API refuses executable objects without invoking accessors', async () => {
  const d = data(); const args = [json(d.bundle), json(d.task), json(d.policy), json(d.intent)];
  for (let i = 0; i < args.length; i++) {
    let called = 0; const candidate = [...args]; candidate[i] = { get schema_version() { called++; return '0.2'; } };
    const r = await validateFinancialIntent(...candidate, at); assert.equal(called, 0); assert.ok(r.errors.some(error => error.code === 'INPUT_NOT_JSON_TEXT'));
  }
});
test('strict JSON profile is reused for financial inputs', async () => {
  const d = data();
  for (const text of ['{"schema_version":"0.2","schema_version":"0.2"}', '{"__proto__":{}}', '{"limit":9007199254740993}']) {
    const r = await validateFinancialIntent(json(d.bundle), json(d.task), text, json(d.intent), at);
    assert.equal(r.valid, false); assert.equal(r.execution_authorized, false);
  }
});
test('financial diagnostics have deterministic ordering', async () => {
  const d = data(); Object.assign(d.intent.transaction, { chain_id: '1', sender: '0x' + '5'.repeat(40), target: '0x' + '6'.repeat(40) });
  assert.deepEqual(await check(d), await check(d));
});
