#!/usr/bin/env node
// Stop-gate demo: a recorded review handoff is accepted, a vague unilateral stop and an inflated "complete" are rejected, and
// the repaired blocked stop is accepted. Everything is in-memory declaration data over the bundled fictional team fixtures.
// No agent runs, no file named as evidence is opened, nothing is written. Exit 0 only when all four expected outcomes occur.
import { readFileSync } from 'node:fs';
import * as core from '../../src/core.mjs';
import { evaluateStop, renderText } from './stop-gate.mjs';

const fixture = name => JSON.parse(readFileSync(new URL('../../examples/' + name + '.json', import.meta.url), 'utf8'));
const bundle = fixture('team'), task = fixture('task'), base = fixture('handoff');
const criterion = task.acceptance_criteria[0];
const run = (label, handoff, expected, codes = []) => {
 const report = evaluateStop({ bundleJson: JSON.stringify(bundle), taskJson: JSON.stringify(task), handoffJson: JSON.stringify(handoff) }, core);
 process.stdout.write(`\n== ${label} ==\n` + renderText(report));
 const seen = report.errors.map(e => e.code);
 if (report.decision !== expected || codes.some(c => !seen.includes(c))) { process.stdout.write(`DEMO_ERROR: expected ${expected} with ${codes.join(',') || 'no required codes'}\n`); process.exit(2); }
 return report.decision;
};

const outcomes = [
 run('recorded review handoff', { ...base, completed: [...base.completed, criterion] }, 'ACCEPT_HANDOFF'),
 run('unilateral stop: "could not finish", nothing recorded', { ...base, current_status: 'in_progress', suggested_next_agent: 'coordinator', unresolved: [], required_next_action: 'none' },
  'REJECT', ['STOP_CRITERION_UNACCOUNTED', 'STOP_IN_PROGRESS_WITHOUT_UNRESOLVED', 'STOP_NEXT_ACTION_PLACEHOLDER']),
 run('inflated completion: "done" without anything checkable', { ...base, current_status: 'complete', suggested_next_agent: 'coordinator', completed: [criterion], evidence: [{ result: 'All done.' }] },
  'REJECT', ['STOP_EVIDENCE_UNANCHORED']),
 run('repaired stop: blocked, unmet criterion and the unknown recorded, concrete next action', { ...base, current_status: 'blocked', suggested_next_agent: 'coordinator', confidence: 0.4,
  unresolved: [criterion, 'UNKNOWN whether the earlier edit of docs/example.md was saved; no evidence resolves it.'],
  required_next_action: 'Coordinator confirms the state of docs/example.md, then resumes the implementer on the same task or reassigns it.' }, 'ACCEPT_HANDOFF'),
];
process.stdout.write(`\nDemo complete: ${outcomes.map(o => (o === 'REJECT' ? 'REJECT (expected)' : 'ACCEPT')).join(' -> ')}.\n`);
