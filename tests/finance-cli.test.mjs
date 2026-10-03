import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'bin/agent-role-contracts.mjs');
const fixture = name => join(root, 'examples/onchain-finance', name + '.json');
const run = (args, options = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000, ...options });
const args = ['finance', '--bundle', fixture('bundle'), '--task', fixture('task'), '--policy', fixture('policy'), '--intent', fixture('intent')];
const clock = ['--at', '2030-01-01T00:00:03Z'];
const executionArgs = ['finance-execution', '--bundle', fixture('bundle'), '--task', fixture('task'), '--policy', fixture('policy'), '--intent', fixture('intent'), '--receipt', fixture('execution'), '--at', '2030-01-01T00:00:05Z'];

test('finance CLI gives a real JSON result and exit 0 for the fixture clock', () => {
  const r = run([...args, ...clock]); assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout); assert.equal(report.valid, true); assert.equal(report.execution_authorized, false);
  assert.equal(report.simulation_executed, false); assert.equal(report.transaction_serialization_verified, false);
});
test('finance-execution CLI validates a receipt without claiming chain verification', () => {
  const r = run(executionArgs); assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout); assert.equal(report.valid, true); assert.equal(report.kind, 'financial-execution');
  assert.equal(report.execution.transaction_hash, '0x' + 'a'.repeat(64));
  assert.equal(report.execution_receipt_verified, false); assert.equal(report.transaction_hash_verified, false);
});
test('finance-execution text output includes receipt identifiers and execution boundary', () => {
  const r = run([...executionArgs, '--format', 'text']); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Execution status: success$/m); assert.match(r.stdout, /^Block: 1235$/m);
  assert.match(r.stdout, /declarations only; execution NOT authorized/);
});
test('finance-subject CLI exposes the same complete binding as the fixture', () => {
  const r = run(['finance-subject', '--bundle', fixture('bundle'), '--task', fixture('task'), '--policy', fixture('policy'), '--transaction', fixture('transaction')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).subject_digest, JSON.parse(readFileSync(fixture('intent'), 'utf8')).review.subject_digest);
});
test('finance text output reports the operation, base units and execution boundary', () => {
  const r = run([...args, ...clock, '--format', 'text']); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Operation: erc20_transfer$/m); assert.match(r.stdout, /^Amount \(base units\): 250000000$/m);
  assert.match(r.stdout, /declarations only; execution NOT authorized/);
});
test('CLI default evaluation time comes from its current clock', () => {
  const before = Date.now(), r = run(args), after = Date.now(); const report = JSON.parse(r.stdout);
  const evaluated = Date.parse(report.evaluated_at); assert.ok(evaluated >= before && evaluated <= after);
});
test('invalid explicit evaluation time is an invalid declaration, exit 1', () => {
  const r = run([...args, '--at', 'bad-time']); assert.equal(r.status, 1, r.stderr);
  assert.ok(JSON.parse(r.stdout).errors.some(error => error.code === 'FINANCE_EVALUATION_TIME_INVALID'));
});
test('finance CLI rejects a changed proposal and does not touch requested scope files', t => {
  const dir = mkdtempSync(join(tmpdir(), 'finance proposal ')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const intent = JSON.parse(readFileSync(fixture('intent'), 'utf8')); intent.transaction.amount_base_units = '249999999';
  const path = join(dir, 'changed intent.json'); writeFileSync(path, JSON.stringify(intent));
  const changed = [...args]; changed[changed.indexOf('--intent') + 1] = path;
  const before = readdirSync(dir); const r = run([...changed, ...clock], { cwd: dir });
  assert.equal(r.status, 1, r.stderr); assert.ok(JSON.parse(r.stdout).errors.some(error => error.code === 'FINANCE_SUBJECT_MISMATCH'));
  assert.deepEqual(readdirSync(dir), before);
});
test('finance-execution CLI rejects a mismatched receipt nonce', t => {
  const dir = mkdtempSync(join(tmpdir(), 'finance receipt ')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const receipt = JSON.parse(readFileSync(fixture('execution'), 'utf8')); receipt.nonce = '8';
  const path = join(dir, 'receipt.json'); writeFileSync(path, JSON.stringify(receipt));
  const candidate = [...executionArgs]; candidate[candidate.indexOf('--receipt') + 1] = path;
  const r = run(candidate); assert.equal(r.status, 1, r.stderr);
  assert.ok(JSON.parse(r.stdout).errors.some(error => error.code === 'FINANCE_EXECUTION_NONCE_MISMATCH'));
});
test('finance-execution CLI requires a receipt argument', () => {
  const missing = executionArgs.filter((value, index) => value !== '--receipt' && executionArgs[index - 1] !== '--receipt');
  assert.equal(run(missing).status, 2);
});
for (const extra of [['--transaction', fixture('transaction')], ['--at'], ['--policy', fixture('policy')], ['--unknown', 'x']]) {
  test('finance CLI rejects malformed/extra arguments ' + extra[0], () => assert.equal(run([...args, ...extra]).status, 2));
}
test('finance CLI refuses a symlink as its explicit policy file', t => {
  // The existing platform matrix separately checks the same reader's symlink
  // behavior. This regression proves the finance path uses that reader too.
  const dir = mkdtempSync(join(tmpdir(), 'finance-symlink-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = `import {symlinkSync} from 'node:fs'; symlinkSync(${JSON.stringify(fixture('policy'))}, ${JSON.stringify(join(dir, 'policy.json'))});`;
  const created = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(created.status, 0, created.stderr);
  const candidate = [...args]; candidate[candidate.indexOf('--policy') + 1] = join(dir, 'policy.json');
  const r = run([...candidate, ...clock]); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stderr).error, 'CLI_ERROR');
});
test('finance demo is independent of cwd and gives all eight real expected results', () => {
  const r = spawnSync(process.execPath, [join(root, 'examples/onchain-finance/demo.mjs')], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  for (const code of ['FINANCE_CHAIN_NOT_ALLOWED', 'FINANCE_TRANSFER_LIMIT_EXCEEDED', 'FINANCE_UNLIMITED_APPROVAL_REFUSED', 'FINANCE_SUBJECT_MISMATCH', 'FINANCE_EXECUTION_NONCE_MISMATCH']) assert.ok(r.stdout.includes(code));
  assert.match(r.stdout, /Execution receipt matches the approved subject/); assert.match(r.stdout, /not signatures or proof of real chain execution/);
});
test('financial source graph runs without application I/O or an implicit clock', () => {
  const script = `import {readFileSync,readdirSync} from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
  const dir=${JSON.stringify(join(root, 'src'))};
  const fixtures=${JSON.stringify(['bundle', 'task', 'policy', 'intent', 'execution'].map(name => readFileSync(fixture(name), 'utf8')))};
  let attempts=0;const deny=()=>{attempts++;throw Error('IO_OR_CLOCK_DENIED')};
  class ExplicitDate extends Date { constructor(...args){if(args.length===0)deny();super(...args);} static now(){return deny();} }
  const context=vm.createContext({Buffer,TextEncoder,TextDecoder,URL,crypto:globalThis.crypto,Date:ExplicitDate,fetch:deny});
  vm.runInContext('try{fetch()}catch{};try{Date.now()}catch{}',context);if(attempts!==2)throw Error('TRAPS_NOT_PROVEN');attempts=0;
  const modules=new Map(readdirSync(dir).filter(n=>n.endsWith('.mjs')).map(n=>{const name=path.join(dir,n);return [name,new vm.SourceTextModule(readFileSync(name,'utf8'),{context,identifier:name})];}));
  const linker=(specifier,ref)=>{if(!specifier.startsWith('./'))throw Error('NONLOCAL_IMPORT');const result=modules.get(path.resolve(path.dirname(ref.identifier),specifier));if(!result)throw Error('OUTSIDE_SOURCE_GRAPH');return result;};
  const entry=modules.get(path.join(dir,'index.mjs'));await entry.link(linker);await entry.evaluate();
  const result=await entry.namespace.validateFinancialIntent(...fixtures.slice(0,4),'2030-01-01T00:00:03Z');if(!result.valid)throw Error(JSON.stringify(result));const executed=await entry.namespace.validateFinancialExecution(...fixtures,'2030-01-01T00:00:05Z');if(!executed.valid)throw Error(JSON.stringify(executed));if(attempts)throw Error('APPLICATION_IO_OR_IMPLICIT_CLOCK');console.log('FINANCE_APPLICATION_IO_AND_IMPLICIT_CLOCK=0');`;
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /FINANCE_APPLICATION_IO_AND_IMPLICIT_CLOCK=0/);
});
