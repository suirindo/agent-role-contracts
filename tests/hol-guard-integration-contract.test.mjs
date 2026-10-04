import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonRejectDuplicateKeys } from '../src/strict-json.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const integration = read('docs/HOL_GUARD_INTEGRATION.md');
const acceptance = read('docs/HOL_GUARD_ACCEPTANCE.md');
const integrationGuide = read('docs/INTEGRATION.md');
const packageJson = JSON.parse(read('package.json'));
const packageLockText = read('package-lock.json');
const contract = parseJsonRejectDuplicateKeys(read('tests/fixtures/hol-guard-integration-contract.v1.json'));

const ACCEPTANCE_CASES_SHA256 = '4c8924b67e6f12970987069af37d0f0dc06d98d6422275c19ad89b600d73fbf3';

const acceptanceRows = [...acceptance.matchAll(
  /^\| (ARC-HG-\d{2}) \| (.*?) \| (.*?) \| (NOT_RUN) \|$/gm
)].map(match => ({
  id: match[1],
  case: match[2],
  required_result: match[3],
  status: match[4]
}));

const walkFiles = directory => {
  const files = [];
  for (const name of readdirSync(join(root, directory))) {
    const path = join(root, directory, name);
    if (statSync(path).isDirectory()) {
      files.push(...walkFiles(relative(root, path)));
    } else {
      files.push(relative(root, path));
    }
  }
  return files;
};

const assertExactKeys = (value, keys, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
};

test('machine contract has a closed design-only shape and pins baselines', () => {
  assertExactKeys(contract, [
    'schema',
    'status',
    'arc_main',
    'hol_guard_head',
    'historical_prototype',
    'restriction',
    'presence',
    'runtime_surface',
    'acceptance_cases'
  ], 'contract keys');
  assertExactKeys(contract.historical_prototype, [
    'head',
    'rust_tests_passed',
    'adversarial_rows',
    'rerun_on_hol_guard_head'
  ], 'historical_prototype keys');
  assertExactKeys(contract.restriction, [
    'arc_floor_values',
    'positive_authority_values_forbidden',
    'command_extensions_as_arc_carrier'
  ], 'restriction keys');
  assertExactKeys(contract.presence, [
    'required_missing',
    'optional_explicit_absence',
    'optional_invalid_stale_or_revoked'
  ], 'presence keys');
  assertExactKeys(contract.runtime_surface, [
    'package_dependency',
    'package_export',
    'src_integration',
    'bin_integration',
    'schema_integration'
  ], 'runtime_surface keys');

  assert.equal(contract.schema, 'arc-hol-guard-integration-contract.v1');
  assert.equal(contract.status, 'design-only-not-run');
  assert.match(contract.arc_main, /^[0-9a-f]{40}$/);
  assert.match(contract.hol_guard_head, /^[0-9a-f]{40}$/);
  assert.match(contract.historical_prototype.head, /^[0-9a-f]{40}$/);
  assert.equal(contract.historical_prototype.rust_tests_passed, 70);
  assert.equal(contract.historical_prototype.adversarial_rows, 68);
  assert.equal(contract.historical_prototype.rerun_on_hol_guard_head, false);
});

test('all 37 acceptance cases are individually NOT_RUN, closed-shape and semantically pinned', () => {
  const ids = contract.acceptance_cases.map(row => row.id);
  assert.deepEqual(ids, Array.from({ length: 37 }, (_, index) => `ARC-HG-${String(index + 1).padStart(2, '0')}`));
  assert.equal(new Set(ids).size, 37);
  for (const row of contract.acceptance_cases) {
    assertExactKeys(row, ['id', 'case', 'required_result', 'status'], row.id);
    assert.equal(row.status, 'NOT_RUN', row.id);
  }
  assert.deepEqual(acceptanceRows, contract.acceptance_cases);
  const digest = createHash('sha256').update(JSON.stringify(contract.acceptance_cases)).digest('hex');
  assert.equal(digest, ACCEPTANCE_CASES_SHA256);
});

test('restriction lattice is exactly NoAdditionalFloor or Block and forbids every Guard grant-bearing action', () => {
  assert.deepEqual(contract.restriction.arc_floor_values, ['NoAdditionalFloor', 'Block']);
  assert.deepEqual(contract.restriction.positive_authority_values_forbidden, [
    'allow',
    'warn',
    'review',
    'require-reapproval',
    'sandbox-required'
  ]);
  assert.equal(contract.restriction.command_extensions_as_arc_carrier, false);

  const match = integration.match(/arc_floor ∈ \{([^}]+)\}/);
  assert.ok(match);
  const documentedFloors = match[1].split(',').map(value => value.trim());
  assert.deepEqual(documentedFloors, contract.restriction.arc_floor_values);

  const allowed = new Set(documentedFloors.map(value => value.toLowerCase()));
  for (const forbidden of contract.restriction.positive_authority_values_forbidden) {
    assert.equal(allowed.has(forbidden), false, forbidden);
  }

  const grantCase = contract.acceptance_cases.find(row => row.id === 'ARC-HG-08');
  assert.deepEqual(grantCase, {
    id: 'ARC-HG-08',
    case: 'Any ARC input attempts to express allow/review/sandbox/approval authority',
    required_result: 'reject contract/input',
    status: 'NOT_RUN'
  });
});

test('Required and Optional absence semantics are fail closed except authenticated explicit absence', () => {
  assert.deepEqual(contract.presence, {
    required_missing: 'reject',
    optional_explicit_absence: 'NoAdditionalFloor',
    optional_invalid_stale_or_revoked: 'reject'
  });
  const byId = new Map(contract.acceptance_cases.map(row => [row.id, row]));
  assert.equal(byId.get('ARC-HG-09').required_result, 'fail closed');
  assert.equal(byId.get('ARC-HG-10').required_result, 'no additional ARC floor');
  assert.equal(byId.get('ARC-HG-11').required_result, 'fail closed; do not reinterpret as absence');
});

test('both documents agree with current/historical baselines and do not claim a rerun', () => {
  const integrationArc = integration.match(/Agent Role Contracts: `([0-9a-f]{40})`/);
  const integrationHol = integration.match(/HOL Guard: `([0-9a-f]{40})`/);
  const integrationPrototype = integration.match(/prior local Phase-2 prototype record: `([0-9a-f]{40})`/);
  const acceptanceArc = acceptance.match(/ARC main: `([0-9a-f]{40})`/);
  const acceptanceHol = acceptance.match(/audited HOL Guard: `([0-9a-f]{40})`/);
  assert.equal(integrationArc?.[1], contract.arc_main);
  assert.equal(acceptanceArc?.[1], contract.arc_main);
  assert.equal(integrationHol?.[1], contract.hol_guard_head);
  assert.equal(acceptanceHol?.[1], contract.hol_guard_head);
  assert.equal(integrationPrototype?.[1], contract.historical_prototype.head);
  assert.match(integration, /70\/70 Rust result has not been rerun against the HOL Guard baseline above/);
});

test('HOL Guard remains absent from dependency, export, runtime, schema-source and generated-schema surfaces', () => {
  assert.deepEqual(contract.runtime_surface, {
    package_dependency: false,
    package_export: false,
    src_integration: false,
    bin_integration: false,
    schema_integration: false
  });

  const dependencySections = Object.entries(packageJson)
    .filter(([key]) => /dependencies$/i.test(key));
  for (const [key, value] of dependencySections) {
    assert.equal(/hol[-_]?guard/i.test(JSON.stringify(value)), false, key);
  }
  assert.equal(/hol[-_]?guard/i.test(packageLockText), false, 'package-lock.json');
  assert.equal(/hol[-_]?guard/i.test(JSON.stringify(packageJson.exports)), false, 'exports');
  assert.equal(/hol[-_]?guard/i.test(JSON.stringify(packageJson.bin)), false, 'bin');

  const forbiddenRuntimeTokens = [
    /hol[-_ ]guard/i,
    /PolicySnapshotV3/,
    /NativeCommandControlBindingV1/,
    /NativeCommandControlAuthorityV1/,
    /\bcommand_extensions\b/
  ];
  const runtimeFiles = [
    ...['src', 'bin', 'schemas', 'scripts'].flatMap(walkFiles)
  ];
  for (const file of runtimeFiles) {
    const text = read(file);
    for (const token of forbiddenRuntimeTokens) {
      assert.equal(token.test(file) || token.test(text), false, `${file}: ${token}`);
    }
  }

  assert.match(integrationGuide, /do not make HOL Guard a dependency or add enforcement to this package/);
});

test('test-only machine contract is not part of the npm package surface', () => {
  assert.ok(packageJson.files.includes('docs'));
  assert.equal(packageJson.files.includes('tests'), false);
  assert.equal(Object.keys(packageJson.exports).some(key => /hol[-_]?guard/i.test(key)), false);
});
