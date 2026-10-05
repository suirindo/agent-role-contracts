import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binding, verifySubject, verifyPackage, releaseDistTag, createManifest, verifyManifest, createStageReceipt, digest, filename, PACKAGE, REPOSITORY } from './release-binding.mjs';
import { verifyRegistryChannel, signerPolicy } from './verify-publication.mjs';

const bytes = Buffer.from('reviewed preview package bytes');
function candidate(version) {
  const tag = `v${version}`;
  const env = { EXPECTED_COMMIT: 'a'.repeat(40), PACKAGE_VERSION: version, EXPECTED_TARBALL_SHA256: digest(bytes), GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF_TYPE: 'tag', GITHUB_REF: `refs/tags/${tag}`, GITHUB_REF_NAME: tag, RELEASE_REF_PROTECTED: 'true', GITHUB_SHA: 'a'.repeat(40), GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/${tag}`, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
  const subject = binding(env);
  const pkg = { name: PACKAGE, version, repository: { type: 'git', url: `git+https://github.com/${REPOSITORY}.git` }, publishConfig: { access: 'public', tag: releaseDistTag(version) } };
  const lock = { name: PACKAGE, version, packages: { '': { name: PACKAGE, version } } };
  const pack = [{ name: PACKAGE, version, filename: filename(version), size: bytes.length, shasum: digest(bytes, 'sha1'), integrity: `sha512-${digest(bytes, 'sha512', 'base64')}` }];
  return { env, subject, pkg, lock, pack };
}

for (const version of ['0.5.0-alpha.1', '0.5.0-beta.0', '0.5.0-rc.10', '0.5.0']) {
  test(`accepts exact protected candidate ${version} through package, manifest and receipt`, () => {
    const { subject, pkg, lock, pack } = candidate(version);
    verifySubject(subject);
    verifyPackage(pkg, lock, subject);
    const manifest = createManifest(pack, bytes, subject);
    verifyManifest(manifest, bytes, subject);
    const receipt = createStageReceipt({ [PACKAGE]: { ...pack[0], id: `${PACKAGE}@${version}`, stageId: '00000000-0000-4000-8000-000000000001' } }, manifest);
    assert.equal(receipt.manifest.version, version);
    assert.equal(releaseDistTag(version), version.includes('-') ? 'next' : 'latest');
    assert.match(`https://github.com/${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/v${version}`, new RegExp(signerPolicy(subject).certificateIdentityURI));
  });
}

for (const version of ['0.5.0-alpha', '0.5.0-alpha.01', '0.5.0-alpha.-1', '0.5.0-dev.1', '0.5.0-alpha.1.2', '0.5.0+build', '00.5.0-alpha.1', '0.5.0-alpha.1\n', '../../x', '', undefined]) {
  test(`rejects unsupported preview ${JSON.stringify(version)}`, () => {
    assert.throws(() => releaseDistTag(version), /RELEASE_VERSION_INVALID/);
  });
}

test('preview keeps protected tag, exact commit and workflow requirements', () => {
  const { env, subject, pkg, lock } = candidate('0.5.0-alpha.1');
  for (const change of [{ RELEASE_REF_PROTECTED: 'false' }, { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_REF: 'refs/tags/v0.5.0-alpha.2' }, { GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/heads/main` }]) {
    assert.throws(() => binding({ ...env, ...change }));
  }
  assert.throws(() => verifySubject({ ...subject, version: '0.5.0-alpha.01' }));
  assert.throws(() => verifyPackage(pkg, { ...lock, version: '0.5.0-alpha.2' }, subject));
});

test('preview requires explicit next and refuses stable channel or other publish overrides', () => {
  const { subject, pkg, lock } = candidate('0.5.0-alpha.1');
  for (const config of [{ access: 'public' }, { access: 'public', tag: 'latest' }, { access: 'public', tag: 'other' }, { access: 'public', tag: 'next', registry: 'https://other.example' }, { access: 'public', tag: 'next', 'provenance-file': 'untrusted.json' }]) {
    assert.throws(() => verifyPackage({ ...pkg, publishConfig: config }, lock, subject));
  }
});

test('stable keeps implicit latest compatibility and cannot stage on next', () => {
  const { subject, pkg, lock } = candidate('0.5.0');
  verifyPackage({ ...pkg, publishConfig: { access: 'public' } }, lock, subject);
  assert.throws(() => verifyPackage({ ...pkg, publishConfig: { access: 'public', tag: 'next' } }, lock, subject));
});

test('post-publication readback requires next and keeps preview off latest', () => {
  const version = '0.5.0-alpha.1';
  assert.equal(verifyRegistryChannel({ latest: '0.1.0', next: version }, version), 'next');
  for (const tags of [{ latest: version, next: version }, { latest: '0.1.0' }, { next: '0.5.0-alpha.2' }, null, []]) {
    assert.throws(() => verifyRegistryChannel(tags, version));
  }
  assert.equal(verifyRegistryChannel({ latest: '0.5.0' }, '0.5.0'), 'latest');
});

test('workflow stages explicit derived channel and displays it before environment approval', () => {
  const workflow = readFileSync(new URL('../workflows/npm-stage-release.yml', import.meta.url), 'utf8');
  const verify = workflow.split('  verify:')[1].split('  stage:')[0];
  const stage = workflow.split('  stage:')[1];
  assert.match(verify, /npm dist-tag: \$\{releaseDistTag\(manifest.version\)\}/);
  assert.match(stage, /RELEASE_DIST_TAG="\$\(node \.github\/release\/release-binding.mjs dist-tag \.\)"/);
  assert.match(stage, /npm stage publish[^\n]*--tag "\$RELEASE_DIST_TAG"/);
  assert.match(stage, /needs: verify/);
  assert.match(stage, /environment: npm-publish/);
  assert.doesNotMatch(workflow, /npm stage approve|npm publish /);
});
