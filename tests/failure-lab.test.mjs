import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const labDir = join(root, 'experiments', 'failure-lab');
const read = (...parts) => readFileSync(join(...parts), 'utf8').replace(/\r\n/g, '\n');
const en = read(labDir, '01-green-tests-out-of-scope-file.md');
const ja = read(labDir, '01-green-tests-out-of-scope-file.ja.md');
const lab = read(labDir, 'README.md');
const prose = text => text.replace(/```[\s\S]*?```/g, '');
const sectionBullets = (text, heading) => {
  const section = text.split(/^## /m).find(s => s.startsWith(heading));
  assert.ok(section, `missing section: ${heading}`);
  return section.split('\n').filter(l => l.startsWith('- '));
};

test('entry 01 prints the real demo output byte for byte', () => {
  const result = spawnSync(process.execPath, [join(root, 'experiments', 'git-diff-demo', 'run.mjs')], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  const block = en.match(/## Full output\n[\s\S]*?```text\n([\s\S]*?)\n```/);
  assert.ok(block, 'the article must contain the full output');
  assert.equal(block[1] + '\n', result.stdout);
});

test('entry 01 and its Japanese summary give the same commands and pin one commit', () => {
  const commands = text => [...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(m => m[1]);
  assert.equal(commands(en).length, 1);
  assert.deepEqual(commands(ja), commands(en));
  const shas = new Set([...(en + ja).matchAll(/\b[0-9a-f]{40}\b/g)].map(m => m[0]));
  assert.equal(shas.size, 1, 'one pinned commit across both files');
  for (const text of [en, ja]) {
    assert.match(text, /issues\/134\)/);
    assert.ok(text.includes('`TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`'));
  }
});

test('the five limits follow the result table in both languages and come before the first later section', () => {
  for (const [text, heading] of [[en, 'What ARC does not do here'], [ja, 'ARCがここでしないこと']]) {
    assert.equal(sectionBullets(text, heading).length, 5, heading);
    const sections = text.split(/^## /m);
    assert.ok(sections[0].includes('| --- | --- | --- |'), 'the result table is in the opening');
    assert.ok(sections[1].startsWith(heading), 'limits are the first section after the table');
  }
  assert.match(en.split(/^## /m)[0], /It does not stop the write/);
  assert.match(ja.split(/^## /m)[0], /書込みは止めません/);
});

test('entry 01 uses only Markdown that renders the same on GitHub and on a republished copy', () => {
  for (const text of [en, ja]) {
    assert.doesNotMatch(text, /^---\n/, 'no front matter');
    assert.doesNotMatch(text, /\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]|```mermaid|<details|<br|<wbr|\[\^/i);
    assert.doesNotMatch(text, /[​­]|\p{Extended_Pictographic}/u);
    for (const fence of text.matchAll(/^```(.*)$/gm)) {
      if (fence[1] !== '') assert.match(fence[1], /^(sh|text)$/);
    }
    assert.equal([...text.matchAll(/^```/gm)].length % 2, 0);
    assert.equal([...text.matchAll(/^```$/gm)].length, [...text.matchAll(/^```(sh|text)$/gm)].length, 'every fence names a language');
    for (const row of text.split('\n').filter(l => l.startsWith('| '))) {
      assert.equal(row.split('|').length - 2, 3, `three columns: ${row}`);
      assert.doesNotMatch(row, /`/, `no unbreakable inline code in a table cell (narrow screens): ${row}`);
    }
    const resultRows = text.split(/^## /m)[0].split('\n').filter(l => l.startsWith('| ')).slice(2);
    assert.deepEqual(resultRows, ['| A | PASS | PASS |', '| B | PASS | FAIL (exit 1) |'], 'result rows stay short and identical in both languages');
    for (const link of prose(text).matchAll(/\]\(([^)]+)\)/g)) assert.match(link[1], /^https:\/\//, `absolute link: ${link[1]}`);
    for (const command of text.matchAll(/```sh\n([\s\S]*?)\n```/g)) assert.doesNotMatch(command[1], /^\$ |\\$/m);
  }
});

test('no sentence presents ARC as stopping, enforcing or guaranteeing anything', () => {
  for (const line of prose(en + '\n' + lab).split('\n')) {
    assert.doesNotMatch(line, /\b(blocks|prevents|enforces|guarantees|secures|protects)\b/i, line);
    if (/\b(stops?|guaranteed|blocked)\b/i.test(line)) assert.match(line, /\b(not|no|cannot)\b/i, `unqualified claim: ${line}`);
  }
  for (const line of prose(ja).split('\n')) {
    if (/ブロック|強制|防止|防ぎ|保証|止め/.test(line)) assert.match(line, /ない|せん|ず/, `unqualified claim: ${line}`);
  }
  assert.doesNotMatch(en + ja + lab, /three minutes|3分/i, 'no unmeasured duration claim');
});

test('root READMEs point to the intake issue once, after the limits sentence', () => {
  for (const [name, limits] of [['README.md', 'ARC does not read Git or block writes'], ['README.ja.md', '書込みも止めません']]) {
    const text = read(root, name);
    assert.equal(text.split('issues/134)').length - 1, 1, name);
    assert.ok(text.indexOf(limits) > 0 && text.indexOf(limits) < text.indexOf('issues/134)'), name);
  }
});

test('the selected next experiment still reproduces and its open items stay marked NOT_RUN', () => {
  const result = spawnSync(process.execPath, [join(root, 'examples', 'action-binding', 'demo.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Six expected binding outcomes verified\./);
  assert.equal([...result.stdout.matchAll(/G1_SUBJECT_MISMATCH/g)].length, 3);
  assert.ok(lab.includes('`G1_SUBJECT_MISMATCH`'));
  assert.equal([...lab.matchAll(/`NOT_RUN`/g)].length, 3);
  assert.match(lab, /No publication date is set\./);
  assert.ok(lab.includes('](01-green-tests-out-of-scope-file.md)') && lab.includes('](01-green-tests-out-of-scope-file.ja.md)'));
});
