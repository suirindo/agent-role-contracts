import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const cli=join(root,'bin/agent-role-contracts.mjs');
const example=name=>join(root,'examples',name+'.json');
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:5000});

test('starter bundle validates without setup',()=>{
 const r=run(['validate','--bundle',example('starter-bundle')]);
 assert.equal(r.status,0,r.stderr);
 const result=JSON.parse(r.stdout);
 assert.equal(result.valid,true);
 assert.equal(result.role_count,2);
});

test('starter task shows separate write executor and read-only reviewer',()=>{
 const r=run(['explain','--bundle',example('starter-bundle'),'--task',example('starter-task'),'--format','text']);
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/PASS: explain/);
 assert.match(r.stdout,/Implementers: implementer/);
 assert.match(r.stdout,/Reviewers: reviewer/);
 assert.match(r.stdout,/execution NOT authorized/);
});

test('starter out-of-scope task demonstrates fail-closed authority check',()=>{
 const r=run(['explain','--bundle',example('starter-bundle'),'--task',example('starter-task-outside-scope'),'--format','text']);
 assert.equal(r.status,1,r.stderr);
 assert.match(r.stdout,/TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY/);
});
