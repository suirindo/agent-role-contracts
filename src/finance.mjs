import { canonical } from './schema.mjs';

export const FINANCIAL_PROFILE = '0.2';
const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const error = (code, path, message) => ({ code, path, message });
const addressKey = value => value.toLowerCase();

function uint256Errors(value, path, positive = false) {
  // The bundled schema has already bounded the canonical decimal string.
  const number = BigInt(value);
  return number > MAX_UINT256 || (positive && number === 0n)
    ? [error('FINANCE_UINT256_RANGE', path, 'Expected a canonical uint256 decimal string in the admitted range')]
    : [];
}

export function financialProposalErrors(bundle, task, route, policy, transaction, path) {
  const errors = [];
  const roles = new Map(bundle.roles.map(({ contract }) => [contract.id, contract]));
  const add = (code, at, message) => errors.push(error(code, at, message));
  if (task.type !== policy.task_type) add('FINANCE_TASK_TYPE_MISMATCH', 'financial_policy/task_type', 'Financial policy must name the current task type');
  if (!route.reviewers.length) add('FINANCE_REVIEW_REQUIRED', 'bundle/routes', 'A financial proposal requires a separate declared reviewer');
  if (!route.require_human_approval) add('FINANCE_HUMAN_APPROVAL_REQUIRED', 'bundle/routes', 'The financial route must require human approval');
  const approver = roles.get(policy.human_approver);
  if (!approver || approver.status !== 'active' || approver.authority.authority_mode !== 'human_only') {
    add('FINANCE_APPROVER_ROLE_INVALID', 'financial_policy/human_approver', 'Approver must be an active declared human_only role');
  }
  if (route.accountable !== policy.human_approver || route.executors.includes(policy.human_approver) || route.reviewers.includes(policy.human_approver)) {
    add('FINANCE_APPROVER_SEPARATION', 'financial_policy/human_approver', 'The accountable human approver must be separate from executors and reviewers');
  }

  for (const [i, chain] of policy.allowed_chain_ids.entries()) errors.push(...uint256Errors(chain, `financial_policy/allowed_chain_ids/${i}`, true));
  for (const key of ['allowed_senders', 'allowed_recipients', 'allowed_spenders']) {
    const seen = new Set();
    for (const [i, value] of policy[key].entries()) {
      const normalized = addressKey(value);
      if (normalized === ZERO_ADDRESS) add('FINANCE_ZERO_ADDRESS', `financial_policy/${key}/${i}`, 'Zero addresses are outside this financial profile');
      if (seen.has(normalized)) add('FINANCE_ADDRESS_AMBIGUOUS', `financial_policy/${key}/${i}`, 'Address is declared more than once, including alternate hex casing');
      seen.add(normalized);
    }
  }
  const limits = new Map();
  for (const [i, limit] of policy.asset_limits.entries()) {
    const at = `financial_policy/asset_limits/${i}`;
    errors.push(...uint256Errors(limit.chain_id, at + '/chain_id', true));
    for (const key of ['max_transfer_base_units', 'max_approval_base_units', 'max_fee_base_units']) errors.push(...uint256Errors(limit[key], at + '/' + key));
    if (!policy.allowed_chain_ids.includes(limit.chain_id)) add('FINANCE_POLICY_CHAIN_UNDECLARED', at + '/chain_id', 'Asset limit belongs to a chain outside the policy');
    const key = limit.chain_id + ':' + addressKey(limit.asset);
    if (limits.has(key)) add('FINANCE_ASSET_LIMIT_AMBIGUOUS', at, 'Only one limit per chain and asset is allowed');
    limits.set(key, limit);
    if (addressKey(limit.asset) === ZERO_ADDRESS) add('FINANCE_ZERO_ADDRESS', at + '/asset', 'Zero-address token contracts are outside this profile');
    if (limit.asset === 'native' && limit.max_approval_base_units !== '0') add('FINANCE_NATIVE_APPROVAL_UNSUPPORTED', at + '/max_approval_base_units', 'Native currency does not have an ERC-20 allowance');
  }

  for (const key of ['chain_id', 'amount_base_units', 'max_fee_base_units', 'nonce']) errors.push(...uint256Errors(transaction[key], path + '/' + key, key === 'chain_id'));
  if (transaction.current_allowance_base_units !== null) errors.push(...uint256Errors(transaction.current_allowance_base_units, path + '/current_allowance_base_units'));
  for (const key of ['sender', 'target', 'asset']) if (addressKey(transaction[key]) === ZERO_ADDRESS) add('FINANCE_ZERO_ADDRESS', path + '/' + key, 'Zero addresses are outside this financial profile');
  if (!policy.allowed_chain_ids.includes(transaction.chain_id)) add('FINANCE_CHAIN_NOT_ALLOWED', path + '/chain_id', 'Proposal chain is outside the declared policy');
  if (!policy.allowed_senders.some(sender => addressKey(sender) === addressKey(transaction.sender))) add('FINANCE_SENDER_NOT_ALLOWED', path + '/sender', 'Proposal sender is outside the declared policy');

  const approval = transaction.operation === 'erc20_approve';
  const targetList = approval ? policy.allowed_spenders : policy.allowed_recipients;
  if (!targetList.some(target => addressKey(target) === addressKey(transaction.target))) add(approval ? 'FINANCE_SPENDER_NOT_ALLOWED' : 'FINANCE_RECIPIENT_NOT_ALLOWED', path + '/target', 'Proposal target is outside the declared policy');
  if ((transaction.operation === 'native_transfer') !== (transaction.asset === 'native')) add('FINANCE_OPERATION_ASSET_MISMATCH', path + '/asset', 'Native transfers require native; ERC-20 operations require a token address');
  if (approval) {
    if (transaction.current_allowance_base_units === null) add('FINANCE_ALLOWANCE_DECLARATION_REQUIRED', path + '/current_allowance_base_units', 'ERC-20 approval requires a declared current allowance');
    else if (BigInt(transaction.current_allowance_base_units) > 0n && BigInt(transaction.amount_base_units) > 0n) add('FINANCE_ALLOWANCE_RESET_REQUIRED', path + '/current_allowance_base_units', 'A nonzero-to-nonzero ERC-20 allowance change is outside this profile; reset and obtain new state before proposing a new allowance');
    if (BigInt(transaction.amount_base_units) === MAX_UINT256) add('FINANCE_UNLIMITED_APPROVAL_REFUSED', path + '/amount_base_units', 'The uint256 maximum allowance is outside this bounded-approval profile');
  } else if (transaction.current_allowance_base_units !== null) add('FINANCE_ALLOWANCE_NOT_APPLICABLE', path + '/current_allowance_base_units', 'Transfer proposals must declare current_allowance_base_units as null');

  const limit = limits.get(transaction.chain_id + ':' + addressKey(transaction.asset));
  if (!limit) add('FINANCE_ASSET_NOT_ALLOWED', path + '/asset', 'No limit is declared for this chain and asset');
  else {
    const cap = approval ? limit.max_approval_base_units : limit.max_transfer_base_units;
    if (BigInt(transaction.amount_base_units) > BigInt(cap)) add(approval ? 'FINANCE_APPROVAL_LIMIT_EXCEEDED' : 'FINANCE_TRANSFER_LIMIT_EXCEEDED', path + '/amount_base_units', 'Proposal amount exceeds the declared per-proposal base-unit limit');
    if (BigInt(transaction.max_fee_base_units) > BigInt(limit.max_fee_base_units)) add('FINANCE_FEE_LIMIT_EXCEEDED', path + '/max_fee_base_units', 'Proposal fee ceiling exceeds the declared native-currency base-unit limit');
  }
  return errors;
}

export async function financialSubjectDigest(bundle, task, policy, transaction) {
  const subject = canonical({ profile: 'onchain-finance/' + FINANCIAL_PROFILE, bundle, task, policy, transaction });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(subject));
  return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(ms).toISOString() === normalized ? ms : null;
}

export function financialEvidenceErrors(route, policy, intent, digest, evaluatedAt) {
  const errors = [];
  const add = (code, path, message) => errors.push(error(code, path, message));
  const at = timestamp(evaluatedAt);
  if (at === null) return [error('FINANCE_EVALUATION_TIME_INVALID', 'evaluated_at', 'Pass an explicit canonical UTC evaluation time; the pure API does not read a clock')];
  const evidence = [
    ['simulation', 'observed_at'], ['review', 'reviewed_at'], ['human_approval', 'approved_at'],
  ];
  const times = [];
  for (const [key, timeKey] of evidence) {
    const declaration = intent[key];
    if (declaration.subject_digest !== digest) add('FINANCE_SUBJECT_MISMATCH', `financial_intent/${key}/subject_digest`, 'Evidence declaration must bind the complete current bundle, task, financial policy and proposal');
    const observed = timestamp(declaration[timeKey]);
    times.push(observed);
    if (observed === null) add('FINANCE_EVIDENCE_TIME_INVALID', `financial_intent/${key}/${timeKey}`, 'Expected a real calendar time in canonical UTC');
    else if (observed > at) add('FINANCE_EVIDENCE_FROM_FUTURE', `financial_intent/${key}/${timeKey}`, 'Evidence declaration is later than the supplied evaluation time');
    else if (at - observed > policy.max_evidence_age_seconds * 1000) add('FINANCE_EVIDENCE_EXPIRED', `financial_intent/${key}/${timeKey}`, 'Evidence declaration exceeds the policy age at the supplied evaluation time');
  }
  if (times.every(value => value !== null) && (times[0] > times[1] || times[1] > times[2])) add('FINANCE_EVIDENCE_ORDER', 'financial_intent', 'Declared order must be simulation, review, then human approval');
  if (intent.simulation.status !== 'success') add('FINANCE_SIMULATION_FAILED', 'financial_intent/simulation/status', 'A successful simulation declaration is required');
  if (intent.simulation.chain_id !== intent.transaction.chain_id) add('FINANCE_SIMULATION_CHAIN_MISMATCH', 'financial_intent/simulation/chain_id', 'Simulation declaration belongs to a different chain');
  errors.push(...uint256Errors(intent.simulation.block_number, 'financial_intent/simulation/block_number'));
  const native = intent.transaction.operation === 'native_transfer';
  if (native ? intent.simulation.return_value !== null : intent.simulation.return_value !== true) add('FINANCE_SIMULATION_RETURN_INVALID', 'financial_intent/simulation/return_value', 'Native simulation must declare null return data; standard ERC-20 simulation must declare boolean true');
  if (!route.reviewers.includes(intent.review.role_id)) add('FINANCE_REVIEWER_OUTSIDE_ROUTE', 'financial_intent/review/role_id', 'Review declaration must name a current routed reviewer');
  if (intent.review.decision !== 'pass') add('FINANCE_REVIEW_BLOCKED', 'financial_intent/review/decision', 'A passing review declaration is required');
  if (intent.human_approval.role_id !== policy.human_approver) add('FINANCE_APPROVER_MISMATCH', 'financial_intent/human_approval/role_id', 'Approval declaration must name the financial policy human approver');
  if (intent.human_approval.decision !== 'approved') add('FINANCE_APPROVAL_DENIED', 'financial_intent/human_approval/decision', 'An approved human decision declaration is required');
  return errors;
}

export function financialExecutionErrors(intent, execution, digest, evaluatedAt) {
  const errors = [];
  const add = (code, path, message) => errors.push(error(code, path, message));
  const at = timestamp(evaluatedAt);
  if (at === null) return [error('FINANCE_EVALUATION_TIME_INVALID', 'evaluated_at', 'Pass an explicit canonical UTC evaluation time; the pure API does not read a clock')];

  if (execution.subject_digest !== digest) add('FINANCE_EXECUTION_SUBJECT_MISMATCH', 'financial_execution/subject_digest', 'Execution receipt must bind the complete current financial subject');
  if (execution.chain_id !== intent.transaction.chain_id) add('FINANCE_EXECUTION_CHAIN_MISMATCH', 'financial_execution/chain_id', 'Execution receipt belongs to a different chain');
  if (execution.nonce !== intent.transaction.nonce) add('FINANCE_EXECUTION_NONCE_MISMATCH', 'financial_execution/nonce', 'Execution receipt belongs to a different transaction nonce');
  if (/^0x0{64}$/i.test(execution.transaction_hash)) add('FINANCE_EXECUTION_TX_HASH_ZERO', 'financial_execution/transaction_hash', 'All-zero transaction hashes are refused as placeholder execution evidence');
  errors.push(...uint256Errors(execution.chain_id, 'financial_execution/chain_id', true));
  errors.push(...uint256Errors(execution.nonce, 'financial_execution/nonce'));
  errors.push(...uint256Errors(execution.block_number, 'financial_execution/block_number'));
  if (execution.status !== 'success') add('FINANCE_EXECUTION_REVERTED', 'financial_execution/status', 'A successful execution declaration is required');

  const approved = timestamp(intent.human_approval.approved_at);
  const executed = timestamp(execution.executed_at);
  const observed = timestamp(execution.observed_at);
  if (executed === null) add('FINANCE_EXECUTION_TIME_INVALID', 'financial_execution/executed_at', 'Expected a real execution calendar time in canonical UTC');
  if (observed === null) add('FINANCE_EXECUTION_TIME_INVALID', 'financial_execution/observed_at', 'Expected a real observation calendar time in canonical UTC');
  if (approved !== null && executed !== null && executed < approved) add('FINANCE_EXECUTION_BEFORE_APPROVAL', 'financial_execution/executed_at', 'Execution declaration cannot predate the bound human approval');
  if (executed !== null && observed !== null && observed < executed) add('FINANCE_EXECUTION_TIME_ORDER', 'financial_execution/observed_at', 'Execution must be observed at or after its declared execution time');
  if (executed !== null && executed > at) add('FINANCE_EXECUTION_FROM_FUTURE', 'financial_execution/executed_at', 'Execution declaration is later than the supplied evaluation time');
  if (observed !== null && observed > at) add('FINANCE_EXECUTION_FROM_FUTURE', 'financial_execution/observed_at', 'Execution observation is later than the supplied evaluation time');
  return errors;
}

export const FINANCIAL_LIMITATIONS = Object.freeze({
  chain_state_verified: false,
  simulation_executed: false,
  address_checksum_verified: false,
  transaction_serialization_verified: false,
  execution_receipt_verified: false,
  transaction_hash_verified: false,
  financial_safety_verified: false,
  replay_protection_enforced: false,
});
