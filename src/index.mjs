/** Compatibility facade. New generic consumers should import the /core subpath. */
export { VERSION, MAX_INPUT_BYTES, validateBundle, explainTask, validateHandoff } from './core.mjs';
export { describeFinancialIntent, validateFinancialIntent, validateFinancialExecution } from './finance-profile.mjs';
