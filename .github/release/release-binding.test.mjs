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
  const verifyJob = workflow.split('  verify:')[1].split('  stage:')[0];
  assert.doesNotMatch(verifyJob, /id-token:/);
  assert.equal((workflow.match(/id-token: write/g) ?? []).length, 1);
  assert.equal((workflow.match(/npm stage publish /g) ?? []).length, 1);
  assert.equal((workflow.match(/npm pack /g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /npm (?:stage approve|publish )|secrets\./);
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.verify\.outputs\.artifact_id \}\}/);
  assert.match(workflow, /--provenance --ignore-scripts --json/);
  assert.match(workflow, /cancel-in-progress: false/);
});

import { verifyAttestationAudit } from './verify-publication.mjs';
const statement = { _type: 'https://in-toto.io/Statement/v1', predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'pkg:npm/%40netsujo/agent-role-contracts@0.2.0', digest: { sha512: digest(bytes, 'sha512') } }], predicate: { buildDefinition: { buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1', externalParameters: { workflow: { repository: `https://github.com/${REPOSITORY}`, ref: 'refs/tags/v0.2.0', path: '.github/workflows/npm-stage-release.yml' } }, resolvedDependencies: [{ uri: `git+https://github.com/${REPOSITORY}@refs/tags/v0.2.0`, digest: { gitCommit: subject.commit } }] }, runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } } } };
function auditFor(payload) { return { invalid: [], missing: [], verified: [{ name: PACKAGE, version: subject.version, registry: 'https://registry.npmjs.org/', attestationBundles: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(payload)).toString('base64') } } }] }] }; }

test('post-publication gate requires verified signatures plus exact attested source and bytes', () => {
  const outcome = verifyAttestationAudit(auditFor(statement), subject, bytes);
  assert.equal(outcome.status, 'VERIFIED_PUBLICATION');
  assert.throws(() => verifyAttestationAudit({ ...auditFor(statement), invalid: [{}] }, subject, bytes));
  assert.throws(() => verifyAttestationAudit({ ...auditFor(statement), missing: [{}] }, subject, bytes));
  assert.throws(() => verifyAttestationAudit({ invalid: [], missing: [], verified: [] }, subject, bytes));
  assert.throws(() => verifyAttestationAudit(auditFor(statement), subject, Buffer.from('different')));
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
    assert.throws(() => verifyAttestationAudit(auditFor(changed), subject, bytes));
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
