/** Optional onchain-finance application profile. Not required by the generic core. */
import schemas from './schemas.finance.generated.mjs';
import { read, checkBundle, checkTask } from './validation.mjs';
import { buildReport } from './report.mjs';
import { VERSION } from './version.mjs';
import { FINANCIAL_PROFILE, FINANCIAL_LIMITATIONS, financialProposalErrors, financialSubjectDigest, financialEvidenceErrors, financialExecutionErrors } from './finance.mjs';
import { SAFE_LIMITATIONS, safeProposalErrors } from './safe.mjs';
const issue=(code,path,message)=>({code,path,message});
const report=(kind,errors,details={})=>buildReport(VERSION,kind,errors,details);
function financialContext(bundleJson, taskJson, policyJson, transactionJson, transactionPath) {
 const b=checkBundle(bundleJson);if(b.errors.length)return {errors:b.errors};
 const t=checkTask(b,taskJson);if(t.errors.length)return {errors:t.errors};
 const p=read(policyJson,schemas['financial-policy'],'financial_policy');if(p.errors.length)return {errors:p.errors};
 const tx=read(transactionJson,schemas['financial-intent'].properties.transaction,transactionPath);if(tx.errors.length)return {errors:tx.errors};
 const errors=financialProposalErrors(b.bundle,t.task,t.route,p.value,tx.value,transactionPath);
 return {b,t,policy:p.value,transaction:tx.value,errors};
}

async function financialDetails(context) {
 try {
  const subject_digest=await financialSubjectDigest(context.b.bundle,context.t.task,context.policy,context.transaction);
  return {details:{financial_profile:FINANCIAL_PROFILE,subject_digest,task_id:context.t.task.id,policy_id:context.policy.id,transaction:context.transaction,...FINANCIAL_LIMITATIONS},errors:[]};
 } catch {
  return {details:{...FINANCIAL_LIMITATIONS},errors:[issue('FINANCE_DIGEST_UNAVAILABLE','subject_digest','The runtime must provide Web Crypto SHA-256; no digest or acceptance was produced')]};
 }
}

/** Async, offline proposal description. The digest is a binding, not a signature. */
export async function describeFinancialIntent(bundleJson, taskJson, policyJson, transactionJson) {
 const context=financialContext(bundleJson,taskJson,policyJson,transactionJson,'transaction');
 if(context.errors.length)return report('financial-subject',context.errors,{validation_stage:'proposal',...FINANCIAL_LIMITATIONS});
 const result=await financialDetails(context);
 return report('financial-subject',result.errors,{validation_stage:'proposal',...result.details});
}

/** Async declaration preflight. Callers supply the evaluation clock explicitly. */
export async function validateFinancialIntent(bundleJson, taskJson, policyJson, intentJson, evaluatedAt) {
 const intent=read(intentJson,schemas['financial-intent'],'financial_intent');
 if(intent.errors.length)return report('financial-intent',intent.errors,{validation_stage:'intent',...FINANCIAL_LIMITATIONS});
 const context=financialContext(bundleJson,taskJson,policyJson,JSON.stringify(intent.value.transaction),'financial_intent/transaction');
 if(context.errors.length)return report('financial-intent',context.errors,{validation_stage:'intent',...FINANCIAL_LIMITATIONS});
 const result=await financialDetails(context);
 if(result.errors.length)return report('financial-intent',result.errors,{validation_stage:'intent',...result.details});
 const errors=financialEvidenceErrors(context.t.route,context.policy,intent.value,result.details.subject_digest,evaluatedAt);
 return report('financial-intent',errors,{validation_stage:'intent',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...result.details});
}

/** Async declaration preflight for an execution receipt bound to an already valid financial intent. */
export async function validateFinancialExecution(bundleJson, taskJson, policyJson, intentJson, executionJson, evaluatedAt) {
 const intentResult=await validateFinancialIntent(bundleJson,taskJson,policyJson,intentJson,evaluatedAt);
 if(!intentResult.valid)return report('financial-execution',intentResult.errors,{validation_stage:'execution',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS});
 const intent=read(intentJson,schemas['financial-intent'],'financial_intent');
 const execution=read(executionJson,schemas['financial-execution'],'financial_execution');
 if(execution.errors.length)return report('financial-execution',execution.errors,{validation_stage:'execution',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS});
 const context=financialContext(bundleJson,taskJson,policyJson,JSON.stringify(intent.value.transaction),'financial_intent/transaction');
 if(context.errors.length)return report('financial-execution',context.errors,{validation_stage:'execution',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS});
 const result=await financialDetails(context);
 if(result.errors.length)return report('financial-execution',result.errors,{validation_stage:'execution',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...result.details});
 const errors=financialExecutionErrors(intent.value,execution.value,result.details.subject_digest,evaluatedAt);
 return report('financial-execution',errors,{validation_stage:'execution',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...result.details,execution:execution.value});
}

/** Bind an already-approved financial intent to the supported fields of one supplied Safe CALL envelope. */
export async function validateSafeProposal(bundleJson, taskJson, policyJson, intentJson, safeProposalJson, evaluatedAt) {
 const intentResult=await validateFinancialIntent(bundleJson,taskJson,policyJson,intentJson,evaluatedAt);
 if(!intentResult.valid)return report('safe-proposal',intentResult.errors,{validation_stage:'wallet-proposal',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS,...SAFE_LIMITATIONS,safe_call_envelope_matches_intent:false});
 const intent=read(intentJson,schemas['financial-intent'],'financial_intent');
 const proposal=read(safeProposalJson,schemas['safe-proposal'],'safe_proposal');
 if(proposal.errors.length)return report('safe-proposal',proposal.errors,{validation_stage:'wallet-proposal',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS,...SAFE_LIMITATIONS,safe_call_envelope_matches_intent:false});
 const context=financialContext(bundleJson,taskJson,policyJson,JSON.stringify(intent.value.transaction),'financial_intent/transaction');
 if(context.errors.length)return report('safe-proposal',context.errors,{validation_stage:'wallet-proposal',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...FINANCIAL_LIMITATIONS,...SAFE_LIMITATIONS,safe_call_envelope_matches_intent:false});
 const result=await financialDetails(context);
 if(result.errors.length)return report('safe-proposal',result.errors,{validation_stage:'wallet-proposal',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...result.details,...SAFE_LIMITATIONS,safe_call_envelope_matches_intent:false});
 const errors=safeProposalErrors(intent.value,proposal.value,result.details.subject_digest);
 const matchesIntent=errors.length===0;
 return report('safe-proposal',errors,{validation_stage:'wallet-proposal',evaluated_at:typeof evaluatedAt==='string'?evaluatedAt:null,...result.details,...SAFE_LIMITATIONS,safe_call_envelope_matches_intent:matchesIntent,safe_proposal:proposal.value});
}
