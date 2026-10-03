/** Internal declaration context. No optional profile or runtime dependency. */
import schemas from './schemas.core.generated.mjs';
import { validateSchema } from './schema.mjs';
import { parseJsonRejectDuplicateKeys } from './strict-json.mjs';
import { conditionalInputErrors, requiredInputsForContract, authorityErrors, runtimeNeutralFindings } from './contract-checks.mjs';
export const MAX_INPUT_BYTES = 1048576;
const own=(v,k)=>Object.hasOwn(v,k);
const order=(a,b)=>a<b?-1:a>b?1:0;
const unique=v=>[...new Set(v)].sort(order);
const issue=(code,path,message)=>({code,path,message});
function read(text,schema,label) {
 if(typeof text!=='string') return {errors:[issue('INPUT_NOT_JSON_TEXT',label,'Pass a JSON string, not an object or executable configuration')]};
 if(text.length>MAX_INPUT_BYTES || new TextEncoder().encode(text).length>MAX_INPUT_BYTES) return {errors:[issue('INPUT_TOO_LARGE',label,'Input exceeds 1 MiB')]};
 let value;
 try {value=parseJsonRejectDuplicateKeys(text,'JSON_INVALID');}
 catch {return {errors:[issue('JSON_INVALID',label,'Invalid JSON, duplicate decoded keys, or nesting deeper than 64')]};}
 let nodes=0;
 function inspect(v) {
  if(++nodes>50000) throw new Error('INPUT_NODE_LIMIT');
  if(typeof v==='number' && !Number.isFinite(v)) throw new Error('NONFINITE_NUMBER');
  if(typeof v==='number' && Number.isInteger(v) && !Number.isSafeInteger(v)) throw new Error('UNSAFE_INTEGER');
  if(v && typeof v==='object') for(const k of Object.keys(v)) {
   if(k==='__proto__') throw new Error('RESERVED_JSON_KEY');
   inspect(v[k]);
  }
 }
 try {inspect(value);} catch(e) {return {errors:[issue(e.message,label,'JSON exceeds the supported data profile')]};}
 return {value,errors:validateSchema(value,schema).errors.map(e=>({...e,path:label+e.path}))};
}
function duplicateErrors(rows,key,code,path,fieldPrefix='') {
 const seen=new Set();const errors=[];
 rows.forEach((v,i)=>{if(seen.has(v[key]))errors.push(issue(code,`${path}/${i}/${fieldPrefix}${key}`,`Duplicate ${key}: ${v[key]}`));seen.add(v[key]);});
 return errors;
}
function cycleErrors(roles,relation) {
 const map=new Map(roles.map((role,index)=>[role.id,{role,index}]));const visited=new Set(),stack=new Set(),errors=[];
 function walk(id) {
  if(stack.has(id)) {const entry=map.get(id);errors.push(issue('ROLE_RELATION_CYCLE',`bundle/roles/${entry.index}/contract/authority/${relation}`,`Cycle in ${relation}`));return;}
  if(visited.has(id)||!map.has(id))return;
  stack.add(id);
  const raw=map.get(id).role.authority[relation];
  for(const target of Array.isArray(raw)?raw:raw?[raw]:[])walk(target);
  stack.delete(id);visited.add(id);
 }
 for(const id of [...map.keys()].sort(order))walk(id);
 return errors;
}
function portableScope(s) {
 const exact=s.endsWith('/**')?s.slice(0,-3):s;
 return exact.length>0 && exact.split('/').every(p=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && p!=='.' && p!=='..');
}
function scopeContains(allowedScope,requestedScope) {
 if(typeof allowedScope!=='string'||typeof requestedScope!=='string'||!portableScope(allowedScope)||!portableScope(requestedScope))return false;
 const allowedTree=allowedScope.endsWith('/**'),requestedTree=requestedScope.endsWith('/**');
 const allowedBase=allowedTree?allowedScope.slice(0,-3):allowedScope;
 const requestedBase=requestedTree?requestedScope.slice(0,-3):requestedScope;
 if(!allowedTree)return !requestedTree && requestedBase===allowedBase;
 return requestedBase===allowedBase || requestedBase.startsWith(allowedBase+'/');
}
function validKnowledgeUri(s) {
 if(s.startsWith('repository://')) {
  const m=s.match(/^repository:\/\/([a-z0-9][a-z0-9._-]*)\/(.+)$/);
  return !!m && portableScope(m[2]) && !m[2].includes('*');
 }
 try {const u=new URL(s);return u.protocol==='https:' && !u.username && !u.password && !!u.hostname;}
 catch{return false;}
}
function checkBundle(text) {
 const parsed=read(text,schemas.bundle,'bundle');
 if(parsed.errors.length)return {errors:parsed.errors};
 const b=parsed.value,roles=b.roles.map(r=>r.contract),ids=new Set(roles.map(r=>r.id));
 const byId=new Map(roles.map(r=>[r.id,r]));const knowledge=new Map(b.knowledge.map(k=>[k.id,k.uri]));
 const errors=[...duplicateErrors(roles,'id','ROLE_ID_DUPLICATE','bundle/roles','contract/'),...duplicateErrors(b.knowledge,'id','KNOWLEDGE_ID_AMBIGUOUS','bundle/knowledge'),...duplicateErrors(b.routes,'task_type','ROUTE_AMBIGUOUS','bundle/routes')];
 for(const cap of b.policy.read_only_forbids)if(!b.policy.capabilities.includes(cap))errors.push(issue('POLICY_UNKNOWN_CAPABILITY','bundle/policy',`Unknown read_only_forbids capability: ${cap}`));
 const aliases=new Map();
 for(const [i,{contract:r,body}] of b.roles.entries()) {
  const path=`bundle/roles/${i}`;
  for(const message of conditionalInputErrors(r))errors.push(issue('CONDITIONAL_INPUT_CONTRACT',path+'/contract/contract',message));
  for(const input of r.contract.required_inputs)if(r.contract.optional_inputs.includes(input))errors.push(issue('INPUT_REQUIRED_OPTIONAL_OVERLAP',path,`Input is both required and optional: ${input}`));
  for(const message of authorityErrors(r,b.policy,b.policy))errors.push(issue('AUTHORITY_CONTRADICTION',path+'/contract/authority',message));
  // output_schema describes future output data, not executable role settings.
  // JSON shape/size limits still apply; this field is not evaluated or fetched.
  const runtimeDeclaration={...r,contract:{...r.contract,output_schema:null}};
  for(const message of runtimeNeutralFindings(runtimeDeclaration).concat(runtimeNeutralFindings(body,'body')))errors.push(issue('RUNTIME_SPECIFIC_DECLARATION',path,message));
  if(r.status==='deprecated' && (!r.replacement || !r.remove_after))errors.push(issue('DEPRECATED_REPLACEMENT_REQUIRED',path,'Deprecated roles require replacement and remove_after'));
  if(r.replacement && (!ids.has(r.replacement)||r.replacement===r.id))errors.push(issue('REPLACEMENT_INVALID',path,`Replacement must be a different declared role: ${r.replacement}`));
  for(const alias of r.aliases) {
   if(ids.has(alias)||aliases.has(alias))errors.push(issue('ROLE_ALIAS_COLLISION',path,`Alias collides with a role ID or another alias: ${alias}`));
   aliases.set(alias,r.id);
  }
  for(const target of [...r.authority.may_delegate_to,...(r.authority.reports_to?[r.authority.reports_to]:[])]) {
   if(!ids.has(target))errors.push(issue('ROLE_REFERENCE_UNKNOWN',path,`Unknown related role: ${target}`));
  }
  for(const scope of r.authority.allowed_write_scopes)if(!portableScope(scope))errors.push(issue('WRITE_SCOPE_SYNTAX',path,'Write scope must be a portable relative file/directory, optionally ending /**'));
  for(const id of [...r.knowledge.required_knowledge,...r.knowledge.optional_knowledge])if(!knowledge.has(id))errors.push(issue('KNOWLEDGE_REFERENCE_UNKNOWN',path,`Knowledge ID is not declared: ${id}`));
 }
 errors.push(...cycleErrors(roles,'may_delegate_to'),...cycleErrors(roles,'reports_to'));
 for(const [i,k] of b.knowledge.entries())if(!validKnowledgeUri(k.uri))errors.push(issue('KNOWLEDGE_URI_INVALID',`bundle/knowledge/${i}/uri`,'Only portable repository:// references or https:// URLs without credentials are supported'));
 for(const [i,r] of b.routes.entries()) {
  const path=`bundle/routes/${i}`;
  for(const id of unique([r.accountable,...r.executors,...r.reviewers])) {
   if(!ids.has(id))errors.push(issue('ROUTE_ROLE_UNKNOWN',path,`Unknown routed role: ${id}`));
   else if(byId.get(id).status!=='active')errors.push(issue('ROUTE_ROLE_INACTIVE',path,`Role is not active: ${id}`));
  }
  for(const id of r.executors)if(r.reviewers.includes(id))errors.push(issue('SELF_REVIEW_DECLARED',path,`Role is both implementer and reviewer: ${id}`));
  for(const id of r.reviewers)if(byId.has(id)&&byId.get(id).authority.authority_mode!=='read_only')errors.push(issue('REVIEWER_NOT_READ_ONLY',path,`Reviewer must declare read_only: ${id}`));
 }
 return {bundle:b,roles:byId,knowledge,errors};
}
function checkTask(b,taskJson) {
 const t=read(taskJson,schemas.task,'task');if(t.errors.length)return {errors:t.errors};
 const task=t.value,route=b.bundle.routes.find(r=>r.task_type===task.type);
 if(!route)return {errors:[issue('TASK_TYPE_UNROUTED','task/type','No explicit route; no fallback will be executed')]};
 const errors=[],details=[];
 const requestedScope=task.inputs.scope;
 for(const id of route.executors) {
  const r=b.roles.get(id);
  if(!r||!['write_scoped','operator'].includes(r.authority.authority_mode))continue;
  if(typeof requestedScope!=='string'||!portableScope(requestedScope))errors.push(issue('TASK_WRITE_SCOPE_INVALID','task/inputs/scope',`Write executor ${id} requires one portable relative task scope`));
  else if(!r.authority.allowed_write_scopes.some(allowed=>scopeContains(allowed,requestedScope)))errors.push(issue('TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY','task/inputs/scope',`Task scope is outside declared write scopes for role ${id}: ${requestedScope}`));
 }
 for(const id of unique([route.accountable,...route.executors,...route.reviewers])) {
  const r=b.roles.get(id),required=requiredInputsForContract(r,task.inputs);
  const missing=required.filter(k=>!own(task.inputs,k)||task.inputs[k]===null||(typeof task.inputs[k]==='string'&&!task.inputs[k].trim()));
  for(const key of missing)errors.push(issue('TASK_INPUT_REQUIRED',`task/inputs/${key}`,`Required by role ${id}`));
  details.push({id,authority_mode:r.authority.authority_mode,capabilities:r.authority.capabilities,prohibited_capabilities:r.authority.prohibited_capabilities,allowed_write_scopes:r.authority.allowed_write_scopes,required_inputs:required,missing_inputs:missing,knowledge_references:unique([...r.knowledge.required_knowledge,...r.knowledge.optional_knowledge]).map(k=>({id:k,uri:b.knowledge.get(k)}))});
 }
 return {task,route,details,errors};
}

export { read, checkBundle, checkTask };
