import { readFileSync } from 'node:fs';
import { validateSafeProposal } from '../../src/finance-profile.mjs';
const read=name=>readFileSync(new URL(name+'.json',import.meta.url),'utf8');
const result=await validateSafeProposal(read('bundle'),read('task'),read('policy'),read('intent'),read('safe-proposal'),'2030-01-01T00:00:03Z');
if(!result.valid)throw new Error(JSON.stringify(result.errors));
console.log('PASS: approved finance intent matches the supported fields of one supplied Safe CALL envelope.');
console.log('Safe CALL envelope matches intent:',result.safe_call_envelope_matches_intent);
console.log('Wallet/auth/signatures verified:',result.safe_proposal_authenticated,result.safe_signatures_verified);
console.log('Canonical serialization / transaction hash verified:',result.transaction_serialization_verified,result.transaction_hash_verified);
