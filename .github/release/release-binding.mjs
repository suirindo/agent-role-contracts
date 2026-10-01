import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonRejectDuplicateKeys } from '../../src/strict-json.mjs';

export const PACKAGE = '@netsujo/agent-role-contracts';
export const REPOSITORY = 'suirindo/agent-role-contracts';
export const NPM_VERSION = '11.20.0';
const COMMIT = /^[0-9a-f]{40}(?![\s\S])/;
const SHA256 = /^[0-9a-f]{64}(?![\s\S])/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![\s\S])/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/i;
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const json = (file) => parseJsonRejectDuplicateKeys(readFileSync(file), 'RELEASE_JSON_INVALID');
export const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
export const filename = (version) => `netsujo-agent-role-contracts-${version}.tgz`;

export function binding(env) {
  const commit = env.EXPECTED_COMMIT;
  const version = env.PACKAGE_VERSION;
  const sha256 = env.EXPECTED_TARBALL_SHA256;
  assert(COMMIT.test(commit ?? '') && SHA256.test(sha256 ?? '') && VERSION.test(version ?? ''), 'RELEASE_INPUT_INVALID');
  const tag = `v${version}`;
  assert(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'RELEASE_EVENT_INVALID');
  assert(env.GITHUB_REPOSITORY === REPOSITORY, 'RELEASE_REPOSITORY_INVALID');
  assert(env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF === `refs/tags/${tag}` && env.GITHUB_REF_NAME === tag, 'RELEASE_TAG_INVALID');
  assert(env.RELEASE_REF_PROTECTED === 'true', 'RELEASE_TAG_UNPROTECTED');
  assert(env.GITHUB_SHA === commit, 'RELEASE_COMMIT_MISMATCH');
  assert(env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/${tag}`, 'RELEASE_WORKFLOW_REF_INVALID');
  assert(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RELEASE_RUN_INVALID');
  return { repository: REPOSITORY, tag, commit, version, sha256, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT };
}

export function verifySubject(subject) {
  const keys = ['repository', 'tag', 'commit', 'version', 'sha256', 'runId', 'runAttempt'].sort();
  assert(subject && typeof subject === 'object' && !Array.isArray(subject) && JSON.stringify(Object.keys(subject).sort()) === JSON.stringify(keys) && keys.every((key) => typeof subject[key] === 'string'), 'RELEASE_SUBJECT_INVALID');
  assert(subject.repository === REPOSITORY && VERSION.test(subject.version ?? '') && subject.tag === `v${subject.version}` && COMMIT.test(subject.commit ?? '') && SHA256.test(subject.sha256 ?? '') && /^[1-9][0-9]*(?![\s\S])/.test(subject.runId ?? '') && /^[1-9][0-9]*(?![\s\S])/.test(subject.runAttempt ?? ''), 'RELEASE_SUBJECT_INVALID');
}

export function verifyPackage(pkg, lock, subject) {
  assert(pkg.name === PACKAGE && pkg.version === subject.version && pkg.private !== true, 'RELEASE_PACKAGE_MISMATCH');
  assert(pkg.repository?.type === 'git' && pkg.repository.url === `git+https://github.com/${REPOSITORY}.git`, 'RELEASE_SOURCE_REPOSITORY_INVALID');
  assert(lock.name === PACKAGE && lock.version === subject.version && lock.packages?.['']?.name === PACKAGE && lock.packages?.['']?.version === subject.version, 'RELEASE_LOCK_MISMATCH');
  assert(pkg.publishConfig?.access === 'public' && Object.keys(pkg.publishConfig).every((key) => key === 'access'), 'RELEASE_PUBLISH_CONFIG_INVALID');
}

function git(root, args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8' }).trim();
}

export function verifySource(root, subject) {
  assert(git(root, ['rev-parse', 'HEAD']) === subject.commit, 'RELEASE_HEAD_MISMATCH');
  assert(git(root, ['rev-parse', `refs/tags/${subject.tag}^{commit}`]) === subject.commit, 'RELEASE_TAG_COMMIT_MISMATCH');
  assert(git(root, ['status', '--porcelain', '--untracked-files=all', '--ignored']) === '', 'RELEASE_SOURCE_DIRTY');
  verifyPackage(json(join(root, 'package.json')), json(join(root, 'package-lock.json')), subject);
}

export function verifyPack(pack, bytes, subject) {
  assert(Array.isArray(pack) && pack.length === 1, 'RELEASE_PACK_COUNT_INVALID');
  const entry = pack[0];
  assert(entry.name === PACKAGE && entry.version === subject.version && entry.filename === filename(subject.version), 'RELEASE_PACK_IDENTITY_INVALID');
  assert(digest(bytes) === subject.sha256, 'RELEASE_TARBALL_SHA256_MISMATCH');
  assert(entry.integrity === `sha512-${digest(bytes, 'sha512', 'base64')}` && entry.shasum === digest(bytes, 'sha1'), 'RELEASE_PACK_INTEGRITY_MISMATCH');
  assert(entry.size === bytes.length, 'RELEASE_PACK_SIZE_MISMATCH');
  return { filename: entry.filename, bytes: bytes.length, sha256: subject.sha256, integrity: entry.integrity, shasum: entry.shasum };
}

export function createManifest(pack, bytes, subject) {
  verifySubject(subject);
  return { schemaVersion: 1, package: PACKAGE, repository: subject.repository, tag: subject.tag, commit: subject.commit, version: subject.version, sha256: subject.sha256, runId: subject.runId, runAttempt: subject.runAttempt, npmVersion: NPM_VERSION, artifact: verifyPack(pack, bytes, subject) };
}

export function verifyManifest(manifest, bytes, subject) {
  verifySubject(subject);
  assert(manifest?.schemaVersion === 1 && manifest.package === PACKAGE && manifest.npmVersion === NPM_VERSION, 'RELEASE_MANIFEST_INVALID');
  for (const key of Object.keys(subject)) assert(manifest[key] === subject[key], 'RELEASE_MANIFEST_SUBJECT_MISMATCH');
  const entry = manifest.artifact;
  assert(entry?.filename === filename(subject.version), 'RELEASE_MANIFEST_FILENAME_INVALID');
  assert(entry.sha256 === subject.sha256, 'RELEASE_MANIFEST_ARTIFACT_SHA256_MISMATCH');
  verifyPack([{ name: PACKAGE, version: subject.version, filename: entry.filename, size: entry.bytes, integrity: entry.integrity, shasum: entry.shasum }], bytes, subject);
  return manifest;
}

export function readBundle(dir, subject) {
  const names = readdirSync(dir).sort();
  assert(JSON.stringify(names) === JSON.stringify([filename(subject.version), 'release-manifest.json'].sort()), 'RELEASE_BUNDLE_FILES_INVALID');
  for (const name of names) assert(lstatSync(join(dir, name)).isFile() && !lstatSync(join(dir, name)).isSymbolicLink(), 'RELEASE_BUNDLE_FILE_INVALID');
  const bytes = readFileSync(join(dir, filename(subject.version)));
  const manifest = verifyManifest(json(join(dir, 'release-manifest.json')), bytes, subject);
  return { manifest, tarball: join(dir, filename(subject.version)) };
}

export function createStageReceipt(response, manifest) {
  assert(response && !Array.isArray(response) && Object.keys(response).length === 1 && Object.hasOwn(response, PACKAGE), 'RELEASE_STAGE_RESPONSE_INVALID');
  const staged = response[PACKAGE];
  assert(UUID.test(staged?.stageId ?? ''), 'RELEASE_STAGE_ID_INVALID');
  assert(staged.name === PACKAGE && staged.version === manifest.version && staged.id === `${PACKAGE}@${manifest.version}`, 'RELEASE_STAGE_PACKAGE_MISMATCH');
  assert(staged.filename === manifest.artifact.filename && staged.size === manifest.artifact.bytes && staged.integrity === manifest.artifact.integrity && staged.shasum === manifest.artifact.shasum, 'RELEASE_STAGE_ARTIFACT_MISMATCH');
  return { schemaVersion: 1, status: 'STAGED_AWAITING_MAINTAINER_READBACK_AND_APPROVAL', stageId: staged.stageId, package: PACKAGE, manifest, provenance: 'REQUESTED_NOT_YET_VERIFIED', registryReadback: 'NOT_PERFORMED_OIDC_CANNOT_READ_STAGE', approval: 'NOT_PERFORMED' };
}

function save(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }

function main() {
  const [command, dir, ...extra] = process.argv.slice(2);
  assert(extra.length === 0 && dir, 'RELEASE_CLI_INVALID');
  const subject = binding(process.env);
  const root = process.cwd();
  if (command === 'source') return verifySource(resolve(dir), subject);
  if (command === 'manifest') {
    verifySource(root, subject);
    const pack = json(join(dir, 'pack.json'));
    assert(Array.isArray(pack) && pack.length === 1 && pack[0]?.filename === filename(subject.version), 'RELEASE_PACK_FILENAME_INVALID');
    const manifest = createManifest(pack, readFileSync(join(dir, filename(subject.version))), subject);
    save(join(dir, 'release-manifest.json'), manifest);
    return;
  }
  if (command === 'bundle') { readBundle(dir, subject); return; }
  if (command === 'receipt') {
    const { manifest } = readBundle(join(dir, 'bundle'), subject);
    const receipt = createStageReceipt(json(join(dir, 'stage-response.json')), manifest);
    save(join(dir, 'stage-receipt.json'), receipt);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Staged package awaiting maintainer\n\nPackage: ${PACKAGE}@${subject.version}\n\nTag: ${subject.tag}\n\nCommit: ${subject.commit}\n\nTarball SHA-256: ${subject.sha256}\n\nStage ID: ${receipt.stageId}\n\nProvenance was requested; it is not verified by this receipt. Download this exact stage with an authenticated maintainer session, compare its SHA-256 with this receipt, then separately approve this exact ID with 2FA. After approval run the publication verifier on the released bytes. Do not rerun an uncertain stage effect.\n`);
    }
    return;
  }
  throw new Error('RELEASE_CLI_INVALID');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
