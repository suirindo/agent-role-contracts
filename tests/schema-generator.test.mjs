import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of ['core','adapters','finance','aggregate'])test(`generator rejects missing and drifted ${name} output and rebuilds it`,t=>{
 const dir=mkdtempSync(join(tmpdir(),'arc-schema-build-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const folder of ['src','schemas','scripts'])cpSync(join(root,folder),join(dir,folder),{recursive:true});
 const file=join(dir,'src',name==='aggregate'?'schemas.generated.mjs':`schemas.${name}.generated.mjs`);
 const expected=readFileSync(file,'utf8');
 const run=check=>spawnSync(process.execPath,['scripts/build-schemas.mjs',...(check?['--check']:[])],{cwd:dir,encoding:'utf8',timeout:10000});
 rmSync(file);assert.notEqual(run(true).status,0);assert.equal(run(false).status,0);assert.equal(readFileSync(file,'utf8'),expected);assert.equal(run(true).status,0);
 writeFileSync(file,expected+'// drift\n');const drift=run(true);assert.notEqual(drift.status,0);assert.match(drift.stderr,/SCHEMA_GENERATED_DRIFT/);assert.equal(run(false).status,0);assert.equal(run(true).status,0);
});
