import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binding, verifyPackage, digest, filename, createManifest, verifyManifest, readBundle, createStageReceipt, verifySource, PACKAGE, REPOSITORY } from './release-binding.mjs';

const bytes = Buffer.from('reviewed package bytes');
const env = { EXPECTED_COMMIT: 'a'.repeat(40), PACKAGE_VERSION: '0.2.0', EXPECTED_TARBALL_SHA256: digest(bytes), GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF_TYPE: 'tag', GITHUB_REF: 'refs/tags/v0.2.0', GITHUB_REF_NAME: 'v0.2.0', RELEASE_REF_PROTECTED: 'true', GITHUB_SHA: 'a'.repeat(40), GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/v0.2.0`, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
const subject = binding(env);
const pack = [{ name: PACKAGE, version: subject.version, filename: filename(subject.version), size: bytes.length, shasum: digest(bytes, 'sha1'), integrity: `sha512-${digest(bytes, 'sha512', 'base64')}` }];
const manifest = createManifest(pack, bytes, subject);
const pkg = { name: PACKAGE, version: subject.version, repository: { type: 'git', url: `git+https://github.com/${REPOSITORY}.git` }, publishConfig: { access: 'public' } };
const lock = { name: PACKAGE, version: subject.version, packages: { '': { name: PACKAGE, version: subject.version } } };
const response = { [PACKAGE]: { ...pack[0], id: `${PACKAGE}@${subject.version}`, stageId: '00000000-0000-4000-8000-000000000001' } };
const clone = (value) => structuredClone(value);

function workflowJob(workflow, name) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) { end = index; break; }
  }
  return lines.slice(start, end).filter((line) => !/^\s*#/.test(line)).join('\n');
}

function assertReleaseWorkflowBoundary(workflow) {
  const verifyJob = workflowJob(workflow, 'verify');
  const stageJob = workflowJob(workflow, 'stage');
  assert.doesNotMatch(verifyJob, /^    environment:/m, 'verify must not enter a protected environment');
  assert.doesNotMatch(verifyJob, /^    permissions:/m, 'verify must inherit the workflow read-only permissions');
  assert.doesNotMatch(verifyJob, /^\s+id-token:\s*write\s*$/m, 'verify must not receive OIDC minting permission');
  assert.match(verifyJob, /Show verified release target before npm-publish approval/);
  assert.match(verifyJob, /GITHUB_STEP_SUMMARY/);
  assert.match(stageJob, /^    needs:\s*verify\s*$/m);
  assert.match(stageJob, /^    environment:\s*npm-publish\s*$/m);
  assert.match(stageJob, /^    permissions:\s*$/m);
  assert.match(stageJob, /^      contents:\s*read\s*$/m);
  assert.match(stageJob, /^      id-token:\s*write\s*$/m);
  assert.doesNotMatch(stageJob, /npm audit/);
  assert.equal((verifyJob.match(/npm audit --audit-level=high --ignore-scripts/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /npm audit[^\n]*--omit=dev/);
}

test('binds protected dispatch tag, exact approved commit/version/hash and workflow identity', () => {
  assert.equal(subject.commit, env.EXPECTED_COMMIT);
  verifyPackage(pkg, lock, subject);
  assert.equal(verifyManifest(manifest, bytes, subject), manifest);
  assert.equal(createStageReceipt(response, manifest).provenance, 'REQUESTED_NOT_YET_VERIFIED');
});

for (const [key, value] of Object.entries({ EXPECTED_COMMIT: 'main', PACKAGE_VERSION: '../../x', EXPECTED_TARBALL_SHA256: '00', GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'other/repo', GITHUB_REF_TYPE: 'branch', GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'v0.1.0', RELEASE_REF_PROTECTED: 'false', GITHUB_SHA: 'b'.repeat(40), GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/heads/main`, GITHUB_RUN_ID: '0', GITHUB_RUN_ATTEMPT: '0' })) {
  test(`rejects substituted ${key}`, () => assert.throws(() => binding({ ...env, [key]: value })));
}
for (const version of ['01.2.0', '0.2.0-beta', '0.2', '0.2.0+build', '0.2.0\n']) {
  test(`rejects unapproved nonstable version ${JSON.stringify(version)}`, () => assert.throws(() => binding({ ...env, PACKAGE_VERSION: version })));
}

test('rejects package-lock, repository and publishConfig substitution', () => {
  assert.throws(() => verifyPackage({ ...pkg, private: true }, lock, subject));
  assert.throws(() => verifyPackage({ ...pkg, version: '0.3.0' }, lock, subject));
  assert.throws(() => verifyPackage({ ...pkg, repository: { ...pkg.repository, url: 'git+https://github.com/other/repo.git' } }, lock, subject));
  assert.throws(() => verifyPackage({ ...pkg, publishConfig: { access: 'public', 'provenance-file': 'untrusted.json' } }, lock, subject));
  assert.throws(() => verifyPackage(pkg, { ...lock, version: '0.3.0' }, subject));
  assert.throws(() => verifyPackage(pkg, { ...lock, packages: { '': { ...lock.packages[''], version: '0.3.0' } } }, subject));
});

test('rejects changed tarball, metadata, multiple packs and unsafe filename', () => {
  assert.throws(() => createManifest(pack, Buffer.from('different'), subject));
  assert.throws(() => createManifest([...pack, ...pack], bytes, subject));
  for (const [key, value] of Object.entries({ filename: '../escape.tgz', integrity: 'sha512-wrong', shasum: '0'.repeat(40), name: 'other', version: '0.3.0', size: 0 })) {
    assert.throws(() => createManifest([{ ...pack[0], [key]: value }], bytes, subject));
  }
});

test('rejects altered manifest subject and artifact bytes', () => {
  for (const key of Object.keys(subject)) assert.throws(() => verifyManifest({ ...manifest, [key]: 'substitute' }, bytes, subject));
  assert.throws(() => verifyManifest({ ...manifest, npmVersion: 'other' }, bytes, subject));
  assert.throws(() => verifyManifest({ ...manifest, artifact: { ...manifest.artifact, filename: '../escape' } }, bytes, subject));
});

test('downloads must contain only exact regular tarball and manifest files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-release-test-'));
  try {
    writeFileSync(join(dir, filename(subject.version)), bytes);
    writeFileSync(join(dir, 'release-manifest.json'), JSON.stringify(manifest));
    assert.equal(readBundle(dir, subject).manifest.commit, subject.commit);
    writeFileSync(join(dir, 'extra.txt'), 'x');
    assert.throws(() => readBundle(dir, subject));
    rmSync(join(dir, 'extra.txt'));
    rmSync(join(dir, filename(subject.version)));
    mkdirSync(join(dir, filename(subject.version)));
    assert.throws(() => readBundle(dir, subject));
    rmSync(join(dir, filename(subject.version)), { recursive: true });
    if (process.platform !== 'win32') {
      symlinkSync(join(dir, 'release-manifest.json'), join(dir, filename(subject.version)));
      assert.throws(() => readBundle(dir, subject));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('duplicate authority JSON keys are rejected rather than last-key-wins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-release-test-'));
  try {
    writeFileSync(join(dir, filename(subject.version)), bytes);
    writeFileSync(join(dir, 'release-manifest.json'), JSON.stringify(manifest).replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'));
    assert.throws(() => readBundle(dir, subject), /RELEASE_JSON_INVALID/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uses pinned npm keyed stage JSON and rejects absent or conflicting response identity', () => {
  assert.equal(createStageReceipt(response, manifest).stageId, response[PACKAGE].stageId);
  assert.throws(() => createStageReceipt(response[PACKAGE], manifest));
  assert.throws(() => createStageReceipt([response[PACKAGE]], manifest));
  assert.throws(() => createStageReceipt({ ...response, other: response[PACKAGE] }, manifest));
  for (const [key, value] of Object.entries({ stageId: '', name: 'other', version: '0.3.0', id: 'other@0.2.0', integrity: 'wrong', shasum: 'wrong', filename: '../escape', size: 0 })) {
    assert.throws(() => createStageReceipt({ [PACKAGE]: { ...response[PACKAGE], [key]: value } }, manifest));
  }
});

test('workflow keeps verification unprivileged and stages one exact artifact without automatic approval', () => {
  const workflow = readFileSync(new URL('../workflows/npm-stage-release.yml', import.meta.url), 'utf8');
  assertReleaseWorkflowBoundary(workflow);
  assert.equal((workflow.match(/npm stage publish /g) ?? []).length, 1);
  assert.equal((workflow.match(/npm pack /g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /npm (?:stage approve|publish )|secrets\./);
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.verify\.outputs\.artifact_id \}\}/);
  assert.match(workflow, /--provenance --ignore-scripts --json/);
  assert.match(workflow, /cancel-in-progress: false/);
  const coreWorkflow = readFileSync(new URL('../workflows/core.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(coreWorkflow, /npm audit/, 'dependency audit must stay release-only to avoid recurring PR CI cost');
});

test('release boundary rejects deleted, moved, and commented gates in local fixtures', () => {
  const workflow = readFileSync(new URL('../workflows/npm-stage-release.yml', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'arc-workflow-fixtures-'));
  try {
    const fixtures = new Map([
      ['deleted-needs.yml', workflow.replace('    needs: verify\n', '')],
      ['moved-environment.yml', workflow.replace('    environment: npm-publish\n', '').replace('  verify:\n', '  verify:\n    environment: npm-publish\n')],
      ['commented-oidc.yml', workflow.replace('      id-token: write\n', '      # id-token: write\n')],
    ]);
    for (const [name, contents] of fixtures) {
      const file = join(dir, name);
      writeFileSync(file, contents);
      assert.throws(() => assertReleaseWorkflowBoundary(readFileSync(file, 'utf8')), undefined, name);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import { verifyAttestationAudit, isolatedNpmConfig, signerPolicy } from './verify-publication.mjs';
// Structural signer fixtures do not establish cryptographic trust.
const signerFixture = { identity: {
  subjectAlternativeName: `https://github.com/${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/v${subject.version}`,
  extensions: { issuer: 'https://token.actions.githubusercontent.com' },
  oids: [
    { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 11] }, value: Buffer.from('\u000c\u000dgithub-hosted') },
    { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 13] }, value: Buffer.concat([Buffer.from([12, 40]), Buffer.from(subject.commit)]) },
  ],
} };

const statement = { _type: 'https://in-toto.io/Statement/v1', predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'pkg:npm/%40netsujo/agent-role-contracts@0.2.0', digest: { sha512: digest(bytes, 'sha512') } }], predicate: { buildDefinition: { buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1', externalParameters: { workflow: { repository: `https://github.com/${REPOSITORY}`, ref: 'refs/tags/v0.2.0', path: '.github/workflows/npm-stage-release.yml' } }, resolvedDependencies: [{ uri: `git+https://github.com/${REPOSITORY}@refs/tags/v0.2.0`, digest: { gitCommit: subject.commit } }] }, runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } } } };
function auditFor(payload) { return { invalid: [], missing: [], verified: [{ name: PACKAGE, version: subject.version, registry: 'https://registry.npmjs.org/', attestationBundles: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(payload)).toString('base64') } } }] }] }; }

test('post-publication gate requires verified signatures plus exact attested source and bytes', () => {
  const outcome = verifyAttestationAudit(auditFor(statement), subject, bytes, signerFixture);
  assert.equal(outcome.status, 'ATTESTED_SUBJECT_MATCH');
  assert.equal(outcome.provenance, undefined);
  assert.equal(verifyAttestationAudit(auditFor(statement), { ...subject, status: 'VERIFIED_PUBLICATION' }, bytes, signerFixture).status, 'ATTESTED_SUBJECT_MATCH');
  assert.throws(() => verifyAttestationAudit({ ...auditFor(statement), invalid: [{}] }, subject, bytes, signerFixture));
  assert.throws(() => verifyAttestationAudit({ ...auditFor(statement), missing: [{}] }, subject, bytes, signerFixture));
  assert.throws(() => verifyAttestationAudit({ invalid: [], missing: [], verified: [] }, subject, bytes, signerFixture));
  assert.throws(() => verifyAttestationAudit(auditFor(statement), subject, Buffer.from('different'), signerFixture));
});

test('post-publication gate rejects attestation source substitution and non-hosted builder', () => {
  for (const mutate of [
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/other/repo'; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/main'; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = 'other.yml'; },
    (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40); },
    (s) => { s.predicate.runDetails.builder.id = 'https://github.com/actions/runner/self-hosted'; },
    (s) => { s.subject[0].name = 'pkg:npm/other@0.2.0'; },
    (s) => { s.predicate.buildDefinition.resolvedDependencies.push(s.predicate.buildDefinition.resolvedDependencies[0]); },
  ]) {
    const changed = clone(statement); mutate(changed);
    assert.throws(() => verifyAttestationAudit(auditFor(changed), subject, bytes, signerFixture));
  }
});

import { execFileSync } from 'node:child_process';
test('source gate checks real Git HEAD, peeled tag, source version and dirty/untracked files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-release-source-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
    git('add', '.');
    git('-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-qm', 'fixture');
    const actual = { ...subject, commit: git('rev-parse', 'HEAD') };
    git('tag', actual.tag);
    verifySource(dir, actual);
    assert.throws(() => verifySource(dir, subject), /RELEASE_HEAD_MISMATCH/);
    writeFileSync(join(dir, 'extra.txt'), 'unexpected');
    assert.throws(() => verifySource(dir, actual), /RELEASE_SOURCE_DIRTY/);
    rmSync(join(dir, 'extra.txt'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: '0.3.0' }));
    assert.throws(() => verifySource(dir, actual), /RELEASE_SOURCE_DIRTY/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('isolated npm config uses distinct files accepted by the real CLI without loading user config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-npm-config-'));
  try {
    const config = isolatedNpmConfig(dir);
    assert.notEqual(config[0].split('=')[1], config[1].split('=')[1]);
    assert.equal(readFileSync(join(dir, 'user.npmrc'), 'utf8'), '');
    assert.equal(readFileSync(join(dir, 'global.npmrc'), 'utf8'), '');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const version = execFileSync(npm, ['--version', ...config], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
    assert.match(version.trim(), /^[0-9]+\.[0-9]+\.[0-9]+$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rejects noncanonical provenance payload encoding with PUBLICATION_BASE64_INVALID', () => {
  const valid = auditFor(statement);
  const payload = valid.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload;
  for (const altered of [payload + '%%%', payload + '\n', payload.slice(0, 3) + ' ' + payload.slice(3), '', 'Zh==']) {
    const audit = clone(valid);
    audit.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload = altered;
    assert.throws(() => verifyAttestationAudit(audit, subject, bytes, signerFixture), /PUBLICATION_BASE64_INVALID/);
  }
});

test('rejects contradictory artifact SHA256 and extra subject identity fields', () => {
  assert.throws(() => verifyManifest({ ...manifest, artifact: { ...manifest.artifact, sha256: 'b'.repeat(64) } }, bytes, subject), /RELEASE_MANIFEST_ARTIFACT_SHA256_MISMATCH/);
  assert.throws(() => createManifest(pack, bytes, { ...subject, package: 'other' }), /RELEASE_SUBJECT_INVALID/);
});

test('rejects a signer outside the approved workflow despite matching payload claims', () => {
  for (const mutate of [
    (s) => { delete s.identity; },
    (s) => { s.identity.extensions.issuer = 'https://other.example'; },
    (s) => { s.identity.subjectAlternativeName = 'https://github.com/other/repo/.github/workflows/npm-stage-release.yml@refs/tags/v0.2.0'; },
    (s) => { s.identity.subjectAlternativeName += '\n'; },
    (s) => { s.identity.oids = []; },
    (s) => { s.identity.oids[0].value = Buffer.from('\u000c\u000bself-hosted'); },
    (s) => { s.identity.oids[1].value = Buffer.concat([Buffer.from([12, 40]), Buffer.from('b'.repeat(40))]); },
  ]) {
    const signer = clone(signerFixture); mutate(signer);
    assert.throws(() => verifyAttestationAudit(auditFor(statement), subject, bytes, signer), /PUBLICATION_SIGNER_IDENTITY_MISMATCH|PUBLICATION_SIGNER_OID_MISMATCH/);
  }
});


test('signer policy binds the full workflow URI and DER-encoded hosted runner and commit', () => {
  const policy = signerPolicy(subject);
  const uri = signerFixture.identity.subjectAlternativeName;
  const match = new RegExp(policy.certificateIdentityURI);
  assert.equal(match.test(uri), true);
  for (const altered of ['prefix' + uri, uri + '/suffix', uri + '\n', uri.replace('github.com', 'githubXcom'), uri.replace('stage-release.yml', 'stage-releaseXyml')]) assert.equal(match.test(altered), false);
  assert.equal(Buffer.from(policy.certificateOIDs['1.3.6.1.4.1.57264.1.11']).toString('hex'), '0c0d6769746875622d686f73746564');
  assert.equal(Buffer.from(policy.certificateOIDs['1.3.6.1.4.1.57264.1.13']).toString('hex'), '0c28' + Buffer.from(subject.commit).toString('hex'));
  assert.equal(verifyAttestationAudit(auditFor(statement), subject, bytes, signerFixture).status, 'ATTESTED_SUBJECT_MATCH');
});
