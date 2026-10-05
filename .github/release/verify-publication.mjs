import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parseJsonRejectDuplicateKeys } from '../../src/strict-json.mjs';
import { digest, PACKAGE, REPOSITORY, NPM_VERSION, releaseDistTag } from './release-binding.mjs';

const assert = (condition, code) => { if (!condition) throw new Error(code); };
const PROVENANCE = 'https://slsa.dev/provenance/v1';
const ISSUER = 'https://token.actions.githubusercontent.com';

export function verifyRegistryChannel(tags, version) {
  const distTag = releaseDistTag(version);
  assert(tags && typeof tags === 'object' && !Array.isArray(tags) && tags[distTag] === version, 'PUBLICATION_CHANNEL_MISMATCH');
  assert(distTag !== 'next' || tags.latest !== version, 'PUBLICATION_PREVIEW_ON_LATEST');
  return distTag;
}

export function signerPolicy(subject) {
  const uri = `https://github.com/${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/v${subject.version}`;
  return {
    certificateIssuer: ISSUER,
    certificateIdentityURI: `^${uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\s\\S])`,
    // Fulcio generic extensions are DER UTF8String values, not plain strings.
    certificateOIDs: { '1.3.6.1.4.1.57264.1.11': '\u000c\u000dgithub-hosted', '1.3.6.1.4.1.57264.1.13': `\u000c\u0028${subject.commit}` },
  };
}

function verifySignerIdentity(signer, subject) {
  const identity = signer?.identity;
  const uri = `https://github.com/${REPOSITORY}/.github/workflows/npm-stage-release.yml@refs/tags/v${subject.version}`;
  assert(identity?.subjectAlternativeName === uri && identity.extensions?.issuer === ISSUER, 'PUBLICATION_SIGNER_IDENTITY_MISMATCH');
  for (const [oid, value] of Object.entries(signerPolicy(subject).certificateOIDs)) {
    const matches = identity.oids?.filter((item) => item.oid?.id?.join('.') === oid);
    assert(matches?.length === 1 && (Buffer.isBuffer(matches[0].value) || matches[0].value instanceof Uint8Array) && Buffer.from(matches[0].value).equals(Buffer.from(value)), 'PUBLICATION_SIGNER_OID_MISMATCH');
  }
}

function bundledSigstore(npmRoot) {
  const npmDir = realpathSync(join(npmRoot, 'npm'));
  const npmPackage = join(npmDir, 'package.json');
  assert(parseJsonRejectDuplicateKeys(readFileSync(npmPackage)).version === NPM_VERSION, 'PUBLICATION_NPM_LAYOUT_MISMATCH');
  const require = createRequire(npmPackage);
  const entry = realpathSync(require.resolve('sigstore'));
  assert(entry.startsWith(join(npmDir, 'node_modules') + sep) && parseJsonRejectDuplicateKeys(readFileSync(join(dirname(entry), '..', 'package.json'))).version === '4.1.1', 'PUBLICATION_SIGSTORE_VERSION_MISMATCH');
  return require('sigstore');
}

export function isolatedNpmConfig(dir) {
  const user = join(dir, 'user.npmrc');
  const global = join(dir, 'global.npmrc');
  writeFileSync(user, '', { flag: 'wx' });
  writeFileSync(global, '', { flag: 'wx' });
  return [`--userconfig=${user}`, `--globalconfig=${global}`, '--registry=https://registry.npmjs.org/', `--cache=${join(dir, 'cache')}`];
}

export function decodeProvenancePayload(payload) {
  assert(typeof payload === 'string' && payload.length > 0 && payload.length <= 1048576 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![\s\S])/.test(payload), 'PUBLICATION_BASE64_INVALID');
  const decoded = Buffer.from(payload, 'base64');
  assert(decoded.toString('base64') === payload, 'PUBLICATION_BASE64_INVALID');
  return parseJsonRejectDuplicateKeys(decoded, 'PUBLICATION_PROVENANCE_INVALID');
}

// Pure matching consumes npm audit output and a Sigstore signer. It cannot
// establish cryptographic verification for caller-authored JSON or test fixtures.
// Only main(), after a successful npm audit, claims VERIFIED_PUBLICATION.
function provenanceBundle(audit, subject) {
  assert(Array.isArray(audit?.invalid) && audit.invalid.length === 0 && Array.isArray(audit.missing) && audit.missing.length === 0, 'PUBLICATION_SIGNATURES_INVALID');
  assert(Array.isArray(audit.verified), 'PUBLICATION_ATTESTATIONS_ABSENT');
  const packages = audit.verified.filter((item) => item.name === PACKAGE && item.version === subject.version && item.registry === 'https://registry.npmjs.org/');
  assert(packages.length === 1, 'PUBLICATION_ATTESTATIONS_ABSENT');
  const attestations = packages[0].attestationBundles?.filter((item) => item.predicateType === PROVENANCE);
  assert(attestations?.length === 1, 'PUBLICATION_PROVENANCE_ABSENT');
  return attestations[0].bundle;
}

export function verifyAttestationAudit(audit, subject, bytes, signer) {
  const payload = provenanceBundle(audit, subject)?.dsseEnvelope?.payload;
  const statement = decodeProvenancePayload(payload);
  assert(statement._type === 'https://in-toto.io/Statement/v1' && statement.predicateType === PROVENANCE, 'PUBLICATION_PROVENANCE_INVALID');
  assert(statement.subject?.length === 1 && statement.subject[0].name === `pkg:npm/%40netsujo/agent-role-contracts@${subject.version}` && statement.subject[0].digest?.sha512 === digest(bytes, 'sha512'), 'PUBLICATION_PROVENANCE_BYTES_MISMATCH');
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  assert(definition?.buildType === 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1', 'PUBLICATION_BUILD_TYPE_INVALID');
  assert(workflow?.repository === `https://github.com/${REPOSITORY}` && workflow.ref === `refs/tags/v${subject.version}` && workflow.path === '.github/workflows/npm-stage-release.yml', 'PUBLICATION_WORKFLOW_MISMATCH');
  const dependencies = definition.resolvedDependencies;
  assert(dependencies?.length === 1 && dependencies[0].uri === `git+https://github.com/${REPOSITORY}@refs/tags/v${subject.version}` && dependencies[0].digest?.gitCommit === subject.commit, 'PUBLICATION_COMMIT_MISMATCH');
  assert(statement.predicate.runDetails?.builder?.id === 'https://github.com/actions/runner/github-hosted', 'PUBLICATION_BUILDER_INVALID');
  verifySignerIdentity(signer, subject);
  return { status: 'ATTESTED_SUBJECT_MATCH', package: PACKAGE, version: subject.version, commit: subject.commit, sha256: digest(bytes) };
}

async function main() {
  const [version, commit, sha256, ...extra] = process.argv.slice(2);
  assert(extra.length === 0 && /^[0-9a-f]{40}(?![\s\S])/.test(commit ?? '') && /^[0-9a-f]{64}(?![\s\S])/.test(sha256 ?? ''), 'PUBLICATION_INPUT_INVALID');
  releaseDistTag(version);
  const subject = { version, commit, sha256 };
  const dir = mkdtempSync(join(tmpdir(), 'arc-publication-verify-'));
  try {
    const config = isolatedNpmConfig(dir);
    const npm = (args) => execFileSync('npm', [...args, ...config], { cwd: dir, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    assert(npm(['--version']).trim() === NPM_VERSION, 'PUBLICATION_NPM_VERSION_MISMATCH');
    const metadata = parseJsonRejectDuplicateKeys(npm(['view', `${PACKAGE}@${version}`, '--json']), 'PUBLICATION_METADATA_INVALID');
    const distTag = verifyRegistryChannel(parseJsonRejectDuplicateKeys(npm(['view', PACKAGE, 'dist-tags', '--json']), 'PUBLICATION_CHANNEL_INVALID'), version);
    assert(metadata.name === PACKAGE && metadata.version === version && metadata.dist?.attestations, 'PUBLICATION_ATTESTATIONS_ABSENT');
    const tarballUrl = new URL(metadata.dist.tarball);
    assert(tarballUrl.origin === 'https://registry.npmjs.org' && tarballUrl.pathname === `/@netsujo/agent-role-contracts/-/agent-role-contracts-${version}.tgz` && !tarballUrl.search && !tarballUrl.hash, 'PUBLICATION_TARBALL_URL_INVALID');
    const response = await fetch(tarballUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert(response.ok, 'PUBLICATION_TARBALL_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 0 && digest(bytes) === sha256 && metadata.dist.integrity === `sha512-${digest(bytes, 'sha512', 'base64')}`, 'PUBLICATION_TARBALL_MISMATCH');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: { [PACKAGE]: version } }));
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund']);
    const installed = parseJsonRejectDuplicateKeys(readFileSync(join(dir, 'node_modules', '@netsujo', 'agent-role-contracts', 'package.json')));
    assert(installed.name === PACKAGE && installed.version === version, 'PUBLICATION_INSTALL_MISMATCH');
    const audit = parseJsonRejectDuplicateKeys(npm(['audit', 'signatures', '--json', '--include-attestations']), 'PUBLICATION_AUDIT_INVALID');
    const sigstore = bundledSigstore(npm(['root', '--global']).trim());
    let signer;
    try { signer = await sigstore.verify(provenanceBundle(audit, subject), { ...signerPolicy(subject), tufCachePath: join(dir, 'tuf') }); }
    catch { throw new Error('PUBLICATION_SIGNER_CRYPTO_INVALID'); }
    const match = verifyAttestationAudit(audit, subject, bytes, signer);
    console.log(JSON.stringify({ ...match, distTag, status: 'VERIFIED_PUBLICATION', provenance: 'VERIFIED_BY_NPM_AUDIT_SIGSTORE_IDENTITY_AND_EXACT_SUBJECT_BINDING' }, null, 2));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
