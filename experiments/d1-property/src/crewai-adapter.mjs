/** Source-only CrewAI adapter spike. Declaration consistency only; no CrewAI runtime or execution authority. */
import { explainTask } from './core.mjs';
import { buildReport } from './report.mjs';
import { parseJsonRejectDuplicateKeys } from './strict-json.mjs';
import { MAX_INPUT_BYTES } from './validation.mjs';
import { VERSION } from './version.mjs';

const LIMITATIONS = Object.freeze({
  crewai_runtime_loaded: false,
  framework_config_executed: false,
  tool_semantics_mapped: false,
  delegation_enforced: false,
  reviewer_identity_authenticated: false,
  output_file_written: false,
});
const issue = (code, path, message) => ({ code, path, message });
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const roleId = /^[a-z0-9][a-z0-9-]*$/;
const taskName = /^[a-z0-9][a-z0-9_-]*$/;
const unique = values => [...new Set(values)];

function readJson(text, label) {
  if (typeof text !== 'string') return { errors: [issue('INPUT_NOT_JSON_TEXT', label, 'Pass JSON text, not an object or executable configuration')] };
  if (text.length > MAX_INPUT_BYTES || new TextEncoder().encode(text).length > MAX_INPUT_BYTES) {
    return { errors: [issue('INPUT_TOO_LARGE', label, 'Input exceeds 1 MiB')] };
  }
  let value;
  try {
    value = parseJsonRejectDuplicateKeys(text, 'JSON_INVALID');
  } catch {
    return { errors: [issue('JSON_INVALID', label, 'Invalid JSON, duplicate decoded keys, or nesting deeper than 64')] };
  }
  let nodes = 0;
  try {
    const inspect = item => {
      if (++nodes > 50000) throw new Error('INPUT_NODE_LIMIT');
      if (typeof item === 'number' && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) throw new Error('UNSAFE_NUMBER');
      if (item && typeof item === 'object') {
        for (const key of Object.keys(item)) {
          if (key === '__proto__') throw new Error('RESERVED_JSON_KEY');
          inspect(item[key]);
        }
      }
    };
    inspect(value);
  } catch (error) {
    return { errors: [issue(error.message, label, 'JSON exceeds the supported data profile')] };
  }
  return { value, errors: [] };
}

function allowedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(issue('CREWAI_UNSUPPORTED_FIELD', path + '/' + key, 'Field is outside the bounded CrewAI spike profile'));
  }
}
function requireString(value, key, path, errors) {
  if (typeof value?.[key] !== 'string' || !value[key].trim()) {
    errors.push(issue('CREWAI_FIELD_REQUIRED', path + '/' + key, key + ' must be a non-empty string'));
    return false;
  }
  return true;
}
function requireStringArray(value, key, path, errors, { nonEmpty = false } = {}) {
  const current = value?.[key];
  if (!Array.isArray(current) || current.some(item => typeof item !== 'string' || !item.trim()) || (nonEmpty && current.length === 0) || unique(current).length !== current.length) {
    errors.push(issue('CREWAI_FIELD_REQUIRED', path + '/' + key, key + ' must be ' + (nonEmpty ? 'a non-empty ' : '') + 'array of unique non-empty strings'));
    return false;
  }
  return true;
}

function validateAgent(id, config, errors) {
  const path = 'agents/' + id;
  if (!roleId.test(id)) errors.push(issue('CREWAI_AGENT_ID_UNMAPPABLE', path, 'Spike requires CrewAI agent IDs that are already valid ARC role IDs'));
  if (!isObject(config)) {
    errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path, 'Agent config must be an object'));
    return;
  }
  allowedKeys(config, new Set(['role', 'goal', 'backstory', 'llm', 'tools', 'settings']), path, errors);
  requireString(config, 'role', path, errors);
  requireString(config, 'goal', path, errors);
  requireString(config, 'backstory', path, errors);
  if (Object.hasOwn(config, 'llm') && (typeof config.llm !== 'string' || !config.llm.trim())) errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path + '/llm', 'llm must be a non-empty string when declared'));
  if (Object.hasOwn(config, 'tools')) {
    if (!Array.isArray(config.tools)) errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path + '/tools', 'tools must be an array when declared'));
    else if (config.tools.length) errors.push(issue('CREWAI_TOOLS_UNMAPPED', path + '/tools', 'Tool semantics are not mapped by this spike; non-empty tools fail closed'));
  }
  if (Object.hasOwn(config, 'settings')) {
    if (!isObject(config.settings)) errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path + '/settings', 'settings must be an object when declared'));
    else {
      allowedKeys(config.settings, new Set(['verbose', 'allow_delegation']), path + '/settings', errors);
      if (Object.hasOwn(config.settings, 'verbose') && typeof config.settings.verbose !== 'boolean') errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path + '/settings/verbose', 'verbose must be boolean'));
      if (config.settings.allow_delegation === true) errors.push(issue('CREWAI_DELEGATION_UNMAPPED', path + '/settings/allow_delegation', 'Delegation targets are not explicit in this spike, so allow_delegation=true fails closed'));
      if (Object.hasOwn(config.settings, 'allow_delegation') && typeof config.settings.allow_delegation !== 'boolean') errors.push(issue('CREWAI_AGENT_CONFIG_INVALID', path + '/settings/allow_delegation', 'allow_delegation must be boolean'));
    }
  }
}

function validateTaskShape(task, path, errors) {
  if (!isObject(task)) {
    errors.push(issue('CREWAI_TASK_INVALID', path, 'Task must be an object'));
    return;
  }
  allowedKeys(task, new Set(['name', 'description', 'expected_output', 'agent', 'context', 'output_file', 'markdown', 'create_directory', 'tools']), path, errors);
  for (const key of ['name', 'description', 'expected_output', 'agent']) requireString(task, key, path, errors);
  if (typeof task.name === 'string' && !taskName.test(task.name)) errors.push(issue('CREWAI_TASK_NAME_UNMAPPABLE', path + '/name', 'Spike supports lowercase alphanumeric task names with _ or -'));
  if (Object.hasOwn(task, 'context') && !requireStringArray(task, 'context', path, errors)) return;
  if (Object.hasOwn(task, 'output_file') && (typeof task.output_file !== 'string' || !task.output_file.trim())) errors.push(issue('CREWAI_TASK_INVALID', path + '/output_file', 'output_file must be a non-empty string'));
  if (Object.hasOwn(task, 'markdown') && typeof task.markdown !== 'boolean') errors.push(issue('CREWAI_TASK_INVALID', path + '/markdown', 'markdown must be boolean'));
  if (Object.hasOwn(task, 'create_directory') && typeof task.create_directory !== 'boolean') errors.push(issue('CREWAI_TASK_INVALID', path + '/create_directory', 'create_directory must be boolean'));
  if (task.create_directory === true) errors.push(issue('CREWAI_DIRECTORY_CREATION_UNMAPPED', path + '/create_directory', 'Directory creation is an extra write semantic not covered by this spike'));
  if (Object.hasOwn(task, 'tools')) {
    if (!Array.isArray(task.tools)) errors.push(issue('CREWAI_TASK_INVALID', path + '/tools', 'tools must be an array when declared'));
    else if (task.tools.length) errors.push(issue('CREWAI_TOOLS_UNMAPPED', path + '/tools', 'Task tool semantics are not mapped by this spike'));
  }
}

export function validateCrewAIConfigMapping(bundleJson, crewJson, agentsJson, mappingJson) {
  const details = {
    adapter_profile: 'crewai-config/0.1-spike',
    framework: 'CrewAI',
    config_profile: 'jsonc-json-subset',
    implementation_task: null,
    review_task: null,
    executor_agent: null,
    reviewer_agent: null,
    accountable_agent: null,
    output_file: null,
    project_coverage_complete: false,
  };
  const finish = errors => buildReport(VERSION, 'crewai-config-mapping', errors, { ...details, ...LIMITATIONS });

  const parsed = [
    ['crew', readJson(crewJson, 'crew')],
    ['agents', readJson(agentsJson, 'agents')],
    ['mapping', readJson(mappingJson, 'mapping')],
  ];
  const parseErrors = parsed.flatMap(([, result]) => result.errors);
  if (parseErrors.length) return finish(parseErrors);
  const crew = parsed[0][1].value;
  const agents = parsed[1][1].value;
  const mapping = parsed[2][1].value;
  const errors = [];

  if (!isObject(crew)) errors.push(issue('CREWAI_CREW_INVALID', 'crew', 'crew.jsonc root must be an object'));
  if (!isObject(agents)) errors.push(issue('CREWAI_AGENTS_INVALID', 'agents', 'Normalized agent config map must be an object'));
  if (!isObject(mapping)) errors.push(issue('CREWAI_MAPPING_INVALID', 'mapping', 'Mapping must be an object'));
  if (errors.length) return finish(errors);

  allowedKeys(crew, new Set(['name', 'agents', 'tasks', 'inputs', 'process', 'verbose']), 'crew', errors);
  requireString(crew, 'name', 'crew', errors);
  requireStringArray(crew, 'agents', 'crew', errors, { nonEmpty: true });
  if (!Array.isArray(crew.tasks) || crew.tasks.length === 0) errors.push(issue('CREWAI_FIELD_REQUIRED', 'crew/tasks', 'tasks must be a non-empty array'));
  if (crew.process !== 'sequential') errors.push(issue('CREWAI_PROCESS_UNSUPPORTED', 'crew/process', 'Spike requires explicit sequential process so review context ordering is checkable'));
  if (Object.hasOwn(crew, 'verbose') && typeof crew.verbose !== 'boolean') errors.push(issue('CREWAI_CREW_INVALID', 'crew/verbose', 'verbose must be boolean'));
  if (Object.hasOwn(crew, 'inputs') && !isObject(crew.inputs)) errors.push(issue('CREWAI_CREW_INVALID', 'crew/inputs', 'inputs must be an object when declared'));

  allowedKeys(mapping, new Set(['schema_version', 'implementation_task', 'review_task', 'arc_task_type']), 'mapping', errors);
  if (mapping.schema_version !== '0.1') errors.push(issue('CREWAI_MAPPING_VERSION', 'mapping/schema_version', 'Expected schema_version 0.1'));
  for (const key of ['implementation_task', 'review_task', 'arc_task_type']) requireString(mapping, key, 'mapping', errors);

  if (!Array.isArray(crew.tasks)) return finish(errors);
  crew.tasks.forEach((task, index) => validateTaskShape(task, 'crew/tasks/' + index, errors));
  const named = new Map();
  crew.tasks.forEach((task, index) => {
    if (!isObject(task) || typeof task.name !== 'string') return;
    if (named.has(task.name)) errors.push(issue('CREWAI_TASK_DUPLICATE', 'crew/tasks/' + index + '/name', 'Duplicate CrewAI task name: ' + task.name));
    named.set(task.name, task);
  });

  if (isObject(agents)) {
    for (const [id, config] of Object.entries(agents)) validateAgent(id, config, errors);
    if (Array.isArray(crew.agents)) {
      const declared = [...crew.agents].sort();
      const supplied = Object.keys(agents).sort();
      if (JSON.stringify(declared) !== JSON.stringify(supplied)) errors.push(issue('CREWAI_AGENT_SET_MISMATCH', 'agents', 'Normalized agent configs must exactly match crew.agents for complete spike coverage'));
    }
  }

  const implementation = named.get(mapping.implementation_task);
  const review = named.get(mapping.review_task);
  details.implementation_task = mapping.implementation_task ?? null;
  details.review_task = mapping.review_task ?? null;
  if (!implementation) errors.push(issue('CREWAI_IMPLEMENTATION_TASK_MISSING', 'mapping/implementation_task', 'Mapped implementation task does not exist'));
  if (!review) errors.push(issue('CREWAI_REVIEW_TASK_MISSING', 'mapping/review_task', 'Mapped review task does not exist'));
  if (crew.tasks.length !== 2 || (implementation && review && implementation === review)) errors.push(issue('CREWAI_PROJECT_COVERAGE_INCOMPLETE', 'crew/tasks', 'Spike requires exactly one implementation task and one review task'));

  if (implementation && review) {
    details.executor_agent = implementation.agent ?? null;
    details.reviewer_agent = review.agent ?? null;
    details.output_file = implementation.output_file ?? null;
    if (!Object.hasOwn(implementation, 'output_file')) errors.push(issue('CREWAI_OUTPUT_FILE_REQUIRED', 'crew/tasks/' + crew.tasks.indexOf(implementation) + '/output_file', 'Implementation task must explicitly declare output_file'));
    if (review.agent === implementation.agent) errors.push(issue('CREWAI_REVIEW_NOT_INDEPENDENT', 'mapping/review_task', 'Implementation and review tasks must use different declared agents'));
    if (!Array.isArray(review.context) || !review.context.includes(implementation.name)) errors.push(issue('CREWAI_REVIEW_CONTEXT_MISSING', 'crew/tasks/' + crew.tasks.indexOf(review) + '/context', 'Review task must explicitly depend on the implementation task'));
    if (Object.hasOwn(review, 'output_file')) errors.push(issue('CREWAI_REVIEW_WRITES_OUTPUT', 'crew/tasks/' + crew.tasks.indexOf(review) + '/output_file', 'Read-only review mapping cannot declare output_file'));
    if (!agents[implementation.agent]) errors.push(issue('CREWAI_AGENT_CONFIG_MISSING', 'crew/tasks/' + crew.tasks.indexOf(implementation) + '/agent', 'Implementation agent config is missing'));
    if (!agents[review.agent]) errors.push(issue('CREWAI_AGENT_CONFIG_MISSING', 'crew/tasks/' + crew.tasks.indexOf(review) + '/agent', 'Review agent config is missing'));
  }

  if (errors.length) return finish(errors);
  const arcTask = {
    schema_version: '0.1',
    id: 'crewai-' + implementation.name,
    type: mapping.arc_task_type,
    objective: implementation.description,
    inputs: { scope: implementation.output_file },
    acceptance_criteria: [implementation.expected_output],
  };
  const core = explainTask(bundleJson, JSON.stringify(arcTask));
  details.arc_task = arcTask;
  if (!core.valid) return finish(core.errors);

  details.accountable_agent = core.accountable;
  if (!Array.isArray(crew.agents) || !crew.agents.includes(core.accountable) || !agents[core.accountable]) {
    errors.push(issue('CREWAI_ACCOUNTABLE_AGENT_MISSING', 'crew/agents', 'ARC accountable role must exist as an explicit CrewAI agent in the bounded project'));
  }
  if (core.executors.length !== 1 || core.executors[0] !== implementation.agent) {
    errors.push(issue('CREWAI_EXECUTOR_ROUTE_MISMATCH', 'crew/tasks/' + crew.tasks.indexOf(implementation) + '/agent', 'CrewAI implementation agent must exactly match the ARC routed executor'));
  }
  if (core.reviewers.length !== 1 || core.reviewers[0] !== review.agent) {
    errors.push(issue('CREWAI_REVIEWER_ROUTE_MISMATCH', 'crew/tasks/' + crew.tasks.indexOf(review) + '/agent', 'CrewAI review agent must exactly match the ARC routed reviewer'));
  }
  if (core.accountable === implementation.agent || core.accountable === review.agent) {
    errors.push(issue('CREWAI_ACCOUNTABLE_SEPARATION', 'crew/agents', 'Spike requires accountable, executor, and reviewer to be distinct roles'));
  }
  details.project_coverage_complete = errors.length === 0;
  return finish(errors);
}
