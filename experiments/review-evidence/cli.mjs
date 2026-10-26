#!/usr/bin/env node
/** Review-evidence CLI. Exit 0: report produced, no inconsistency (UNKNOWNs remain; not approval). 1: inconsistency. 2: input/tool error. */
import fs from 'node:fs';
import { evaluate, renderSummary, exitCodeFor, EvidenceError, MAX_INPUT_BYTES } from './review-evidence.mjs';

const USAGE = `Usage: node experiments/review-evidence/cli.mjs --repo <dir> --envelope <file> --bundle <file> --task <file> [--receipt <file>] [--binding <file>] [--format json|summary]\n`;
const OPTIONS = new Set(['repo', 'envelope', 'bundle', 'task', 'receipt', 'binding', 'format']);

function fail(code) {
  process.stderr.write(`REVIEW_EVIDENCE_ERROR: ${code}\n`);
  process.exit(2);
}

function readInput(file) {
  let fd;
  try {
    const observed = fs.lstatSync(file, { bigint: true });
    if (!observed.isFile()) throw new EvidenceError('INPUT_NOT_REGULAR_FILE');
    // Native no-follow is unavailable on some platforms (including Windows).
    // Compare descriptor identity with the observed leaf before reading bytes.
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const st = fs.fstatSync(fd, { bigint: true });
    if (!st.isFile()) throw new EvidenceError('INPUT_NOT_REGULAR_FILE');
    if (observed.ino === 0n || st.ino === 0n) throw new EvidenceError('INPUT_IDENTITY_UNAVAILABLE');
    if (observed.dev !== st.dev || observed.ino !== st.ino) throw new EvidenceError('INPUT_CHANGED_DURING_READ');
    if (st.size > BigInt(MAX_INPUT_BYTES)) throw new EvidenceError('INPUT_TOO_LARGE');
    const buf = Buffer.alloc(Number(st.size));
    let at = 0;
    while (at < buf.length) {
      const n = fs.readSync(fd, buf, at, buf.length - at, at);
      if (n === 0) break;
      at += n;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, at));
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    if (error?.code === 'ELOOP' || error?.code === 'EMLINK') throw new EvidenceError('INPUT_NOT_REGULAR_FILE');
    throw new EvidenceError(error instanceof TypeError ? 'INPUT_NOT_UTF8' : 'INPUT_UNREADABLE');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

try {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(USAGE); process.exit(0); }
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.startsWith('--') ? argv[i].slice(2) : null;
    if (!name || !OPTIONS.has(name) || i + 1 >= argv.length || name in opts) throw new EvidenceError('USAGE');
    opts[name] = argv[i + 1];
  }
  if (!opts.repo || !opts.envelope || !opts.bundle || !opts.task || !['json', 'summary', undefined].includes(opts.format)) throw new EvidenceError('USAGE');
  const input = { repo: opts.repo, envelope: readInput(opts.envelope), bundle: readInput(opts.bundle), task: readInput(opts.task) };
  if (opts.receipt) input.receipt = readInput(opts.receipt);
  if (opts.binding) input.binding = readInput(opts.binding);
  const report = await evaluate(input);
  process.stdout.write(opts.format === 'summary' ? renderSummary(report) : JSON.stringify(report, null, 2) + '\n');
  process.exitCode = exitCodeFor(report);
} catch (error) {
  fail(error instanceof EvidenceError ? error.code : 'INTERNAL_ERROR');
}
