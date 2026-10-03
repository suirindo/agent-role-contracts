/** Compatibility facade. New generic consumers should import the /core subpath. */
export { VERSION, MAX_INPUT_BYTES, validateBundle, explainTask, validateHandoff, describeTaskAction, validateTaskActionBinding, describeTaskLifecycle, validateTaskLifecycle } from './core.mjs';
export { describeFinancialIntent, validateFinancialIntent, validateFinancialExecution, validateSafeProposal } from './finance-profile.mjs';
