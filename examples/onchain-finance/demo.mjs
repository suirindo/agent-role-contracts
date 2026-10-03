#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { describeFinancialIntent, validateFinancialIntent, validateFinancialExecution } from '../../src/index.mjs';

const read = name => readFileSync(new URL(name + '.json', import.meta.url), 'utf8');
const json = JSON.stringify;
const at = '2030-01-01T00:00:03Z';
const executionAt = '2030-01-01T00:00:05Z';

try {
  const bundle = read('bundle'), task = read('task'), policy = read('policy');
  const original = JSON.parse(read('intent'));
  const check = intent => validateFinancialIntent(bundle, task, policy, json(intent), at);
  const show = async (label, intent, expectedCode = null) => {
    const result = await check(intent);
    if (expectedCode ? result.valid || !result.errors.some(error => error.code === expectedCode) : !result.valid) {
      throw new Error('Unexpected demo result: ' + label);
    }
    console.log(label + ': ' + (expectedCode ? 'FAIL (expected): ' + expectedCode : 'PASS'));
  };

  console.log('Agent Role Contracts v0.2 preview: inspect an onchain-finance proposal.');
  console.log('Fictional token, addresses and evidence; fixture clock ' + at + '.');
  console.log('No wallet, RPC, API key, signing or broadcasting.\n');
  await show('1. Treasury payment within the declared limit', original);
  const wrongChain = structuredClone(original); wrongChain.transaction.chain_id = '1';
  await show('2. Proposal switches to a different chain', wrongChain, 'FINANCE_CHAIN_NOT_ALLOWED');
  const tooMuch = structuredClone(original); tooMuch.transaction.amount_base_units = '500000001';
  await show('3. Payment exceeds the limit by one base unit', tooMuch, 'FINANCE_TRANSFER_LIMIT_EXCEEDED');
  const unlimited = structuredClone(original);
  Object.assign(unlimited.transaction, { operation: 'erc20_approve', target: '0x' + '3'.repeat(40), current_allowance_base_units: '0', amount_base_units: ((1n << 256n) - 1n).toString() });
  await show('4. Agent requests an unlimited token allowance', unlimited, 'FINANCE_UNLIMITED_APPROVAL_REFUSED');
  const changed = structuredClone(original); changed.transaction.amount_base_units = '249999999';
  await show('5. Amount changes after review', changed, 'FINANCE_SUBJECT_MISMATCH');

  const subject = await describeFinancialIntent(bundle, task, policy, json(changed.transaction));
  if (!subject.valid) throw new Error('Changed proposal description failed');
  // This fictional demo updates declaration fixtures. A real caller must obtain
  // new external simulation, independent review and human approval first.
  for (const key of ['simulation', 'review', 'human_approval']) changed[key].subject_digest = subject.subject_digest;
  await show('6. New fictional declarations bind the changed proposal', changed);

  const receipt = JSON.parse(read('execution'));
  const execution = await validateFinancialExecution(bundle, task, policy, read('intent'), json(receipt), executionAt);
  if (!execution.valid) throw new Error('Unexpected demo result: execution receipt');
  console.log('7. Execution receipt matches the approved subject, chain and nonce: PASS');
  const wrongNonceReceipt = structuredClone(receipt); wrongNonceReceipt.nonce = '8';
  const wrongNonce = await validateFinancialExecution(bundle, task, policy, read('intent'), json(wrongNonceReceipt), executionAt);
  if (wrongNonce.valid || !wrongNonce.errors.some(error => error.code === 'FINANCE_EXECUTION_NONCE_MISMATCH')) throw new Error('Unexpected demo result: execution nonce');
  console.log('8. Execution receipt uses a different nonce: FAIL (expected): FINANCE_EXECUTION_NONCE_MISMATCH');

  console.log('\nDemo complete. PASS checks declarations only; execution is NOT authorized.');
  console.log('Matching hashes and receipts are not signatures or proof of real chain execution.');
  console.log('Next: examples/onchain-finance/README.md');
} catch {
  console.error('FINANCE_DEMO_ERROR: missing/invalid fixtures or unexpected checker behavior; use this exact candidate and npm run check.');
  process.exitCode = 2;
}
