import { readFileSync } from 'node:fs';
import { validateSafeProposal } from '../../src/index.mjs';
const read=name=>readFileSync(new URL(name+'.json',import.meta.url),'utf8');
const result=await validateSafeProposal(read('bundle'),read('task'),read('policy'),read('intent'),read('safe-proposal'),'2030-01-01T00:00:03Z');
if(!result.valid)throw new Error(JSON.stringify(result.errors));
console.log('PASS: approved finance intent matches one Safe CALL envelope.');
console.log('Serialization checked:',result.transaction_serialization_verified);
console.log('Wallet/auth/signatures verified:',result.safe_proposal_authenticated,result.safe_signatures_verified);
