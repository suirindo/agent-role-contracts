import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonRejectDuplicateKeys } from '../../src/strict-json.mjs';
import { digest, PACKAGE, REPOSITORY, NPM_VERSION } from './release-binding.mjs';

const assert = (condition, code) => { if (!condition) throw new Error(code); };
const PROVENANCE = 'https://slsa.dev/provenance/v1';

// The input must be npm audit signatures --json --include-attestations output.
// Only the CLI's successfully verified bundles can satisfy this gate.
export function verifyAttestationAudit(audit, subject, bytes) {
  assert(Array.isArray(audit?.invalid) && audit.invalid.length === 0 && Array.isArray(audit.missing) && audit.missing.length === 0, 'PUBLICATION_SIGNATURES_INVALID');
  assert(Array.isArray(audit.verified), 'PUBLICATION_ATTESTATIONS_ABSENT');
  const packages = audit.verified.filter((item) => item.name === PACKAGE && item.version === subject.version && item.registry === 'https://registry.npmjs.org/');
  assert(packages.length === 1, 'PUBLICATION_ATTESTATIONS_ABSENT');
  const attestations = packages[0].attestationBundles?.filter((item) => item.predicateType === PROVENANCE);
  assert(attestations?.length === 1, 'PUBLICATION_PROVENANCE_ABSENT');
  const payload = attestations[0].bundle?.dsseEnvelope?.payload;
  assert(typeof payload === 'string', 'PUBLICATION_PROVENANCE_INVALID');
  const statement = parseJsonRejectDuplicateKeys(Buffer.from(payload, 'base64'), 'PUBLICATION_PROVENANCE_INVALID');
  assert(statement._type === 'https://in-toto.io/Statement/v1' && statement.predicateType === PROVENANCE, 'PUBLICATION_PROVENANCE_INVALID');
  assert(statement.subject?.length === 1 && statement.subject[0].name === `pkg:npm/%40netsujo/agent-role-contracts@${subject.version}` && statement.subject[0].digest?.sha512 === digest(bytes, 'sha512'), 'PUBLICATION_PROVENANCE_BYTES_MISMATCH');
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  assert(definition?.buildType === 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1', 'PUBLICATION_BUILD_TYPE_INVALID');
  assert(workflow?.repository === `https://github.com/${REPOSITORY}` && workflow.ref === `refs/tags/v${subject.version}` && workflow.path === '.github/workflows/npm-stage-release.yml', 'PUBLICATION_WORKFLOW_MISMATCH');
  const dependencies = definition.resolvedDependencies;
  assert(dependencies?.length === 1 && dependencies[0].uri === `git+https://github.com/${REPOSITORY}@refs/tags/v${subject.version}` && dependencies[0].digest?.gitCommit === subject.commit, 'PUBLICATION_COMMIT_MISMATCH');
  assert(statement.predicate.runDetails?.builder?.id === 'https://github.com/actions/runner/github-hosted', 'PUBLICATION_BUILDER_INVALID');
  return { status: 'VERIFIED_PUBLICATION', package: PACKAGE, ...subject, sha256: digest(bytes), provenance: 'VERIFIED_BY_NPM_AUDIT_AND_EXACT_SUBJECT_BINDING' };
}

async function main() {
  const [version, commit, sha256, ...extra] = process.argv.slice(2);
  assert(extra.length === 0 && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![\s\S])/.test(version ?? '') && /^[0-9a-f]{40}(?![\s\S])/.test(commit ?? '') && /^[0-9a-f]{64}(?![\s\S])/.test(sha256 ?? ''), 'PUBLICATION_INPUT_INVALID');
  const subject = { version, commit, sha256 };
  const dir = mkdtempSync(join(tmpdir(), 'arc-publication-verify-'));
  try {
    const config = ['--userconfig=/dev/null', '--globalconfig=/dev/null', '--registry=https://registry.npmjs.org/', `--cache=${join(dir, 'cache')}`];
    const npm = (args) => execFileSync('npm', [...args, ...config], { cwd: dir, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    assert(npm(['--version']).trim() === NPM_VERSION, 'PUBLICATION_NPM_VERSION_MISMATCH');
    const metadata = parseJsonRejectDuplicateKeys(npm(['view', `${PACKAGE}@${version}`, '--json']), 'PUBLICATION_METADATA_INVALID');
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
    console.log(JSON.stringify(verifyAttestationAudit(audit, subject, bytes), null, 2));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
