import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root=new URL('../',import.meta.url);
test('finance-safe CLI validates the exact fixture without claiming wallet authentication',()=>{
  const args=['bin/agent-role-contracts.mjs','finance-safe','--bundle','examples/onchain-finance/bundle.json','--task','examples/onchain-finance/task.json','--policy','examples/onchain-finance/policy.json','--intent','examples/onchain-finance/intent.json','--safe-proposal','examples/onchain-finance/safe-proposal.json','--at','2030-01-01T00:00:03Z'];
  const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(r.stdout);
  assert.equal(out.valid,true);
  assert.equal(out.transaction_serialization_verified,true);
  assert.equal(out.safe_proposal_authenticated,false);
});
