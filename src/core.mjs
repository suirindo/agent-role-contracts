/** Domain-neutral public API: JSON-text declarations only, no execution authority. */
import schemas from './schemas.core.generated.mjs';
import { read, checkBundle, checkTask } from './validation.mjs';
import { buildReport } from './report.mjs';
import { VERSION } from './version.mjs';
export { VERSION };
export { MAX_INPUT_BYTES } from './validation.mjs';
const order=(a,b)=>a<b?-1:a>b?1:0;
const unique=v=>[...new Set(v)].sort(order);
const issue=(code,path,message)=>({code,path,message});
const report=(kind,errors,details={})=>buildReport(VERSION,kind,errors,details);
export function validateBundle(bundleJson) {
 const b=checkBundle(bundleJson);
 return report('bundle',b.errors,b.bundle?{policy_version:b.bundle.policy_version,role_count:b.roles.size,route_count:b.bundle.routes.length}:{});
}
export function explainTask(bundleJson,taskJson) {
 const b=checkBundle(bundleJson);if(b.errors.length)return report('explain',b.errors);
 const t=checkTask(b,taskJson);
 return report('explain',t.errors,t.task?{policy_version:b.bundle.policy_version,task_id:t.task.id,task_type:t.task.type,accountable:t.route.accountable,executors:[...t.route.executors],reviewers:[...t.route.reviewers],human_approval_required:t.route.require_human_approval,roles:t.details}:{});
}
export function validateHandoff(bundleJson,taskJson,handoffJson) {
 const b=checkBundle(bundleJson);if(b.errors.length)return report('handoff',b.errors);
 const t=checkTask(b,taskJson);if(t.errors.length)return report('handoff',t.errors);
 const h=read(handoffJson,schemas.handoff,'handoff');if(h.errors.length)return report('handoff',h.errors);
 const v=h.value,errors=[],participants=unique([t.route.accountable,...t.route.executors,...t.route.reviewers]);
 if(v.task_id!==t.task.id)errors.push(issue('HANDOFF_TASK_MISMATCH','handoff/task_id','Handoff refers to a different task'));
 if(v.objective!==t.task.objective)errors.push(issue('HANDOFF_OBJECTIVE_MISMATCH','handoff/objective','Handoff objective differs from the bound task'));
 for(const key of ['from_agent','suggested_next_agent'])if(!participants.includes(v[key]))errors.push(issue('HANDOFF_ROLE_OUTSIDE_ROUTE',`handoff/${key}`,'Role is not a participant in the declared task route'));
 if(v.from_agent===v.suggested_next_agent)errors.push(issue('HANDOFF_SELF','handoff/suggested_next_agent','A handoff must target a different role'));
 const from=b.roles.get(v.from_agent);
 if(from && !from.authority.may_delegate_to.includes(v.suggested_next_agent) && from.authority.reports_to!==v.suggested_next_agent)errors.push(issue('HANDOFF_RELATION_UNDECLARED','handoff/suggested_next_agent','Neither delegation nor reporting relation is declared'));
 if(v.current_status==='ready_for_review' && (!t.route.executors.includes(v.from_agent)||!t.route.reviewers.includes(v.suggested_next_agent)))errors.push(issue('HANDOFF_REVIEW_ROUTE','handoff/current_status','Review handoff must go from an executor to a reviewer'));
 if(v.current_status==='complete' && v.unresolved.length)errors.push(issue('HANDOFF_COMPLETE_UNRESOLVED','handoff/unresolved','Complete contradicts recorded unresolved items'));
 if(v.current_status==='blocked' && !v.unresolved.length)errors.push(issue('HANDOFF_BLOCKER_MISSING','handoff/unresolved','Blocked requires a recorded unresolved item'));
 return report('handoff',errors,{task_id:t.task.id,from_agent:v.from_agent,next_agent:v.suggested_next_agent,declared_status:v.current_status});
}
