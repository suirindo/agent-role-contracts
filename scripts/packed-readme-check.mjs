import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A bounded release regression guard, not a general natural-language checker.
// It checks explicit present-tense version claims in packed, installed READMEs.
// Registry dist-tags and published web pages still require release readback.
const VERSION = String.raw`v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)`;
const CLAIMS = [
  String.raw`\bstable\s+package\s+line\s*:\s*${VERSION}`,
  String.raw`\bcurrent\s+stable\s+(?:release|version)\s*(?::|is)\s*${VERSION}`,
  String.raw`\blatest\s*(?:dist-tag\s*)?(?:,\s*which\s*)?(?:(?:currently|still)\s+)?(?:is|remains|points\s+to)\s+(?:the\s+)?(?:stable\s+)?(?:version\s+)?${VERSION}`,
  String.raw`\bnpm\s+latest\s*(?:=|:)\s*${VERSION}`,
  String.raw`(?:現在の)?安定版(?:パッケージ)?(?:ライン|のバージョン)?\s*[:：]\s*${VERSION}`,
  String.raw`latest\s*(?:は|が)\s*(?:現在(?:も)?\s*)?(?:安定版(?:の)?\s*)?${VERSION}`,
].map(pattern => new RegExp(pattern, 'giu'));

function visibleProse(markdown) {
  // Remove comment and fenced-code examples, but retain inline-code versions.
  const lines = markdown.replace(/<!--[^]*?-->/gu, '').split(/\r?\n/u);
  let fence = null;
  return lines.map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length &&
          line.trim() === marker) fence = null;
      return '';
    }
    if (marker) { fence = marker; return ''; }
    // Preserve readable labels, not versions embedded in link targets.
    return line.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1').replace(/[`*_]/gu, '');
  }).join('\n');
}

/** Return explicit current-version contradictions for a latest-channel candidate. */
export function findReadmeVersionMismatches(markdown, version) {
  assert.equal(typeof markdown, 'string', 'README must be text');
  assert.match(version, new RegExp(`^${VERSION}$`, 'u'), 'Invalid candidate version');
  const text = visibleProse(markdown);
  const findings = [];
  for (const pattern of CLAIMS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== version) findings.push({
        claimedVersion: match[1], expectedVersion: version,
        claim: match[0], line: text.slice(0, match.index).split('\n').length,
      });
    }
  }
  return findings;
}

/** Read the installed tarball payload, never the checkout's source README. */
export function assertPackedReadmes(installedDirectory) {
  const manifest = JSON.parse(readFileSync(join(installedDirectory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@netsujo/agent-role-contracts', 'Unexpected packed package');
  assert.equal(typeof manifest.version, 'string', 'Missing packed version');
  assert.match(manifest.version, new RegExp(`^${VERSION}$`, 'u'), 'Invalid packed version');
  const tag = manifest.publishConfig?.tag ?? 'latest';
  assert.equal(typeof tag, 'string', 'Invalid publish tag');
  assert.ok(tag.length > 0, 'Empty publish tag');
  // A preview may correctly describe a different stable version. Do not infer
  // registry latest from a preview candidate or change its release policy.
  const checkCurrentVersion = tag === 'latest';
  if (checkCurrentVersion) assert.ok(!manifest.version.split('+')[0].includes('-'),
    'A prerelease candidate must not claim the latest stable channel');
  const checked = [];
  for (const filename of ['README.md', 'README.ja.md']) {
    const text = readFileSync(join(installedDirectory, filename), 'utf8');
    assert.ok(text.trim().length > 0, `${filename}: packed README is empty`);
    if (checkCurrentVersion) {
      const findings = findReadmeVersionMismatches(text, manifest.version);
      assert.equal(findings.length, 0,
        `${filename}: packed current-version claim contradicts package.json: ${JSON.stringify(findings)}`);
    }
    checked.push(filename);
  }
  return { version: manifest.version, tag, checked, currentVersionChecked: checkCurrentVersion };
}
