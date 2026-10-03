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
  assert.equal(out.safe_call_envelope_matches_intent,true);
  assert.equal(out.transaction_hash_verified,false);
  assert.equal(Object.hasOwn(out,'safe_transaction_fields_verified'),false);
  assert.equal(out.transaction_serialization_verified,false);
  assert.equal(out.safe_proposal_authenticated,false);
  const text=spawnSync(process.execPath,[...args,'--format','text'],{cwd:root,encoding:'utf8'});
  assert.equal(text.status,0,text.stderr);
  assert.match(text.stdout,/Safe CALL envelope matches intent: true/);
  assert.doesNotMatch(text.stdout,/Serialization checked/);
});
