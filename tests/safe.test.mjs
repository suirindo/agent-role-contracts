import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeFinancialIntent, validateSafeProposal } from '../src/index.mjs';

const json=JSON.stringify;
const fixture=name=>JSON.parse(readFileSync(new URL('../examples/onchain-finance/'+name+'.json',import.meta.url),'utf8'));
const at='2030-01-01T00:00:03Z';
const data=()=>({bundle:fixture('bundle'),task:fixture('task'),policy:fixture('policy'),intent:fixture('intent'),proposal:fixture('safe-proposal')});
const check=d=>validateSafeProposal(json(d.bundle),json(d.task),json(d.policy),json(d.intent),json(d.proposal),at);
const pad=value=>BigInt(value).toString(16).padStart(64,'0');
const calldata=(selector,target,amount)=>'0x'+selector+target.slice(2).toLowerCase().padStart(64,'0')+pad(amount);

async function rebind(d) {
  const subject=await describeFinancialIntent(json(d.bundle),json(d.task),json(d.policy),json(d.intent.transaction));
  assert.equal(subject.valid,true,json(subject.errors));
  for(const key of ['simulation','review','human_approval']) d.intent[key].subject_digest=subject.subject_digest;
  d.proposal.subject_digest=subject.subject_digest;
}

test('approved ERC-20 transfer binds to exact Safe CALL serialization',async()=>{
  const r=await check(data()); assert.equal(r.valid,true,json(r.errors));
  assert.equal(r.kind,'safe-proposal');
  assert.equal(r.transaction_serialization_verified,true);
  assert.equal(r.safe_transaction_fields_verified,true);
  for(const key of ['safe_proposal_authenticated','safe_owners_verified','safe_threshold_verified','safe_signatures_verified','execution_authorized']) assert.equal(r[key],false,key);
});

for(const [name,change,code] of [
  ['different subject',d=>d.proposal.subject_digest='sha256:'+'0'.repeat(64),'SAFE_SUBJECT_MISMATCH'],
  ['different chain',d=>d.proposal.chain_id='1','SAFE_CHAIN_MISMATCH'],
  ['different Safe address',d=>d.proposal.safe_address='0x'+'5'.repeat(40),'SAFE_ADDRESS_MISMATCH'],
  ['different nonce',d=>d.proposal.safe_nonce='8','SAFE_NONCE_MISMATCH'],
  ['different target',d=>d.proposal.transaction.to='0x'+'5'.repeat(40),'SAFE_TO_MISMATCH'],
  ['different native value',d=>d.proposal.transaction.value='1','SAFE_VALUE_MISMATCH'],
  ['different calldata',d=>d.proposal.transaction.data='0x','SAFE_DATA_MISMATCH'],
]) test('Safe proposal refuses '+name,async()=>{
  const d=data(); change(d); const r=await check(d);
  assert.equal(r.valid,false); assert.ok(r.errors.some(e=>e.code===code),json(r.errors));
  assert.equal(r.transaction_serialization_verified,false);
});

test('delegatecall is refused by the strict schema',async()=>{
  const d=data(); d.proposal.transaction.operation=1; const r=await check(d);
  assert.equal(r.valid,false); assert.ok(r.errors.some(e=>e.code==='SCHEMA_CONST'),json(r.errors));
});

test('native transfer maps to recipient/value/empty calldata beyond Number.MAX_SAFE_INTEGER',async()=>{
  const d=data();
  Object.assign(d.intent.transaction,{operation:'native_transfer',asset:'native',amount_base_units:'9007199254740993',current_allowance_base_units:null});
  d.policy.asset_limits.find(x=>x.asset==='native').max_transfer_base_units='9007199254740993';
  d.intent.simulation.return_value=null;
  await rebind(d);
  Object.assign(d.proposal.transaction,{to:d.intent.transaction.target.toLowerCase(),value:d.intent.transaction.amount_base_units,data:'0x',operation:0});
  const r=await check(d); assert.equal(r.valid,true,json(r.errors)); assert.equal(r.transaction_serialization_verified,true);
});

test('ERC-20 approve maps to token/zero value/approve calldata exactly',async()=>{
  const d=data();
  Object.assign(d.intent.transaction,{operation:'erc20_approve',target:d.policy.allowed_spenders[0],amount_base_units:'100000000',current_allowance_base_units:'0'});
  await rebind(d);
  Object.assign(d.proposal.transaction,{to:d.intent.transaction.asset.toLowerCase(),value:'0',data:calldata('095ea7b3',d.intent.transaction.target,d.intent.transaction.amount_base_units),operation:0});
  const r=await check(d); assert.equal(r.valid,true,json(r.errors));
});

test('Safe proposal JSON remains strict and refuses extra wallet metadata',async()=>{
  const d=data(); d.proposal.safe_tx_hash='0x'+'a'.repeat(64); const r=await check(d);
  assert.equal(r.valid,false); assert.ok(r.errors.some(e=>e.code==='SCHEMA_ADDITIONALPROPERTIES'),json(r.errors));
});
