const error=(code,path,message)=>({code,path,message});
const addressKey=value=>value.toLowerCase();
const word=value=>BigInt(value).toString(16).padStart(64,'0');
const addressWord=value=>addressKey(value).slice(2).padStart(64,'0');

export const SAFE_LIMITATIONS=Object.freeze({
 safe_proposal_authenticated:false,
 safe_owners_verified:false,
 safe_threshold_verified:false,
 safe_signatures_verified:false,
 wallet_connection_established:false,
});

export function expectedSafeTransaction(transaction) {
 if(transaction.operation==='native_transfer') return {to:addressKey(transaction.target),value:transaction.amount_base_units,data:'0x',operation:0};
 const selector=transaction.operation==='erc20_transfer'?'a9059cbb':'095ea7b3';
 return {to:addressKey(transaction.asset),value:'0',data:'0x'+selector+addressWord(transaction.target)+word(transaction.amount_base_units),operation:0};
}

export function safeProposalErrors(intent,proposal,digest) {
 const errors=[];const add=(code,path,message)=>errors.push(error(code,path,message));
 const expected=expectedSafeTransaction(intent.transaction);
 if(proposal.subject_digest!==digest)add('SAFE_SUBJECT_MISMATCH','safe_proposal/subject_digest','Safe proposal must bind the complete current approved financial subject');
 if(proposal.chain_id!==intent.transaction.chain_id)add('SAFE_CHAIN_MISMATCH','safe_proposal/chain_id','Safe proposal belongs to a different chain');
 if(addressKey(proposal.safe_address)!==addressKey(intent.transaction.sender))add('SAFE_ADDRESS_MISMATCH','safe_proposal/safe_address','Safe address must match the approved financial sender');
 if(proposal.safe_nonce!==intent.transaction.nonce)add('SAFE_NONCE_MISMATCH','safe_proposal/safe_nonce','Safe nonce must match the approved financial nonce');
 if(addressKey(proposal.transaction.to)!==expected.to)add('SAFE_TO_MISMATCH','safe_proposal/transaction/to','Safe transaction target differs from the approved operation');
 if(proposal.transaction.value!==expected.value)add('SAFE_VALUE_MISMATCH','safe_proposal/transaction/value','Safe transaction native value differs from the approved operation');
 if(proposal.transaction.data!==expected.data)add('SAFE_DATA_MISMATCH','safe_proposal/transaction/data','Safe calldata differs from the approved operation');
 if(proposal.transaction.operation!==0)add('SAFE_OPERATION_UNSUPPORTED','safe_proposal/transaction/operation','Only Safe CALL operation 0 is supported; delegatecall is refused');
 return errors;
}
