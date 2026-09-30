// Pure extraction/adaptation of conditionalInputErrors, requiredInputsForContract,
// authorityErrors and runtimeNeutralFindings. Catalogues are explicit arguments.
export function conditionalInputErrors(contract) {
  const errors = [];
  const inputContract = contract?.contract;
  if (!inputContract || !Array.isArray(inputContract.conditional_required_inputs)) return errors;
  const required = new Set(Array.isArray(inputContract.required_inputs) ? inputContract.required_inputs : []);
  const optional = new Set(Array.isArray(inputContract.optional_inputs) ? inputContract.optional_inputs : []);
  for (const rule of inputContract.conditional_required_inputs) {
    const conditionInput = rule?.when?.input;
    if (typeof conditionInput === 'string' && !required.has(conditionInput) && !optional.has(conditionInput)) {
      errors.push(`conditional when input must be declared: ${conditionInput}`);
    }
    for (const input of Array.isArray(rule?.required_inputs) ? rule.required_inputs : []) {
      if (required.has(input)) errors.push(`conditional required input is already unconditional: ${input}`);
      else if (!optional.has(input)) errors.push(`conditional required input must be declared optional: ${input}`);
    }
  }
  return errors;
}

export function requiredInputsForContract(contract, providedInputs = {}) {
  const inputContract = contract?.contract ?? {};
  const required = [...(Array.isArray(inputContract.required_inputs) ? inputContract.required_inputs : [])];
  for (const rule of Array.isArray(inputContract.conditional_required_inputs) ? inputContract.conditional_required_inputs : []) {
    if (Object.hasOwn(providedInputs, rule.when.input) && providedInputs[rule.when.input] === rule.when.equals) required.push(...rule.required_inputs);
  }
  return [...new Set(required)];
}

export function authorityErrors(contract, taxonomy, authority) {
  const errors = [];
  const policy = contract.authority;
  if (!policy || typeof policy !== 'object') return errors;
  const capabilities = Array.isArray(policy.capabilities) ? policy.capabilities : [];
  const prohibited = Array.isArray(policy.prohibited_capabilities) ? policy.prohibited_capabilities : [];
  const writeScopes = Array.isArray(policy.allowed_write_scopes) ? policy.allowed_write_scopes : [];

  for (const capability of capabilities) {
    if (!taxonomy.capabilities.includes(capability)) errors.push(`unknown capability: ${capability}`);
  }
  for (const capability of prohibited) {
    if (!taxonomy.capabilities.includes(capability)) errors.push(`unknown prohibited capability: ${capability}`);
    if (capabilities.includes(capability)) errors.push(`capability overlaps prohibited capability: ${capability}`);
  }

  if (policy.authority_mode === 'read_only') {
    for (const capability of capabilities) {
      if (authority.read_only_forbids.includes(capability)) errors.push(`read_only role cannot use ${capability}`);
    }
    if (writeScopes.length > 0) errors.push('read_only role cannot declare allowed_write_scopes');
  }
  if (['write_scoped', 'operator'].includes(policy.authority_mode)) {
    if (writeScopes.length === 0) errors.push(`${policy.authority_mode} role requires allowed_write_scopes`);
    if (!capabilities.some((capability) => authority.read_only_forbids.includes(capability))) {
      errors.push(`${policy.authority_mode} role requires at least one capability forbidden to read_only roles`);
    }
  }
  if (policy.authority_mode === 'human_only') {
    if (capabilities.length > 0) errors.push('human_only role cannot declare executable capabilities');
    if (writeScopes.length > 0) errors.push('human_only role cannot declare allowed_write_scopes');
  }
  return errors;
}

const runtimeFieldKeys = new Set(['invoke','subagenttype','roleplayedby','permissionmode','tools','model','maxturns']);
const sortedUnique = values => [...new Set(values)].sort((a,b)=>a<b?-1:a>b?1:0);
function normalizedRuntimeKey(key) {
  return String(key).toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}
function runtimeStringFindings(value, path) {
  const findings = [];
  const normalized = value.toLowerCase().replaceAll('\\', '/');
  if (/(?:^|\/)\.(?:claude|codex)(?:\/|$)/.test(normalized)) {
    findings.push(`${path}: runtime固有のパス`);
  }
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*[:=]/);
    if (match && runtimeFieldKeys.has(normalizedRuntimeKey(match[1]))) {
      findings.push(`${path}: runtime固有の項目 ${normalizedRuntimeKey(match[1])}`);
    }
  }
  return findings;
}
export function runtimeNeutralFindings(value, path = '$') {
  const findings = [];
  const inspect = (item, itemPath) => {
    if (Array.isArray(item)) item.forEach((child, index) => inspect(child, `${itemPath}[${index}]`));
    else if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        const normalizedKey = normalizedRuntimeKey(key);
        if (runtimeFieldKeys.has(normalizedKey)) findings.push(`${itemPath}.${key}: runtime固有の項目 ${normalizedKey}`);
        inspect(child, `${itemPath}.${key}`);
      }
    } else if (typeof item === 'string') findings.push(...runtimeStringFindings(item, itemPath));
  };
  inspect(value, path);
  return sortedUnique(findings);
}
