import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest} from './experiments/cross-tool-effects/contract.mjs';
import {describeEffectRequest,evaluateEffectRequest} from './experiments/cross-tool-effects/policy.mjs';
import {explain} from './explain.mjs';
const read=n=>JSON.parse(readFileSync(new URL('./examples/'+n+'.json',import.meta.url)));
const bundle=read('starter-bundle'),task=read('starter-task'),H='sha256:'+'a'.repeat(64);
const base={bundle,task,contract:{schema_version:'0.1-draft',profile:'cross-tool-effects/0.1-draft',id:'fictional-display',revision:1,task_binding:{canonicalization:'JCS/RFC8785',bundle_task_digest:digest('arc-ctei-task/0.1',{bundle,task})},allowed_effects:['network.send'],read_sources:[],destinations:['lab.receiver'],flows:[{id:'f',effect:'network.send',destination_ref:'lab.receiver',source_refs:['public'],allowed_labels:['public']}],provenance:{mode:'session-union',on_missing:'deny',allow_declassification:false},limits:{max_read_bytes:10,max_egress_bytes_per_action:10,max_egress_bytes_per_run:10,max_egress_calls_per_run:1,max_events:10}},request:{effect:'network.send',run_id:'run',session_id:'session',tenant:'tenant',source_refs:['public'],destination_ref:'lab.receiver',content_sha256:H,byte_length:1,adapter_digest:H,tool_definition_digest:H},provenance:{run_id:'run',session_id:'session',tenant:'tenant',complete:true,sources:[{source_ref:'public',classification:'public',content_sha256:H}],exposure_source_refs:['public'],usage:{egress_bytes:0,egress_calls:0,event_count:0}}};
const input=f=>Object.fromEntries(Object.entries(f).map(([k,v])=>[k+'Json',JSON.stringify(v)]));
const reports=[];
reports.push({name:'条件成立の記述のみ',report:await describeEffectRequest(input(base)),expected:'ALLOW'});
reports.push({name:'レビュー宣言未供給',report:await evaluateEffectRequest(input(base)),expected:'UNKNOWN'});
const denied=structuredClone(base);denied.contract.allowed_effects=[];
reports.push({name:'送信がタスク条件にない',report:await evaluateEffectRequest(input(denied)),expected:'DENY'});
reports.push({name:'不正入力',report:await evaluateEffectRequest({}),expected:'REJECT_INPUT'});
for(const {report,expected} of reports){assert.equal(report.policy_result,expected);const text=explain(report);assert.ok(text.includes('実行許可は確立していない'));assert.ok(!text.includes('送信してよい'));}
const r=reports[0].report;
let rejected=0;
for(const patch of [{authority_status:'VERIFIED'},{execution_authorized:true},{policy_result:'surprise'},{binding_status:'surprise'},{receiver_observed:true},{diagnostics:[{code:7}]},{binding_status:'INCONSISTENT'},{diagnostics:[{code:'CTE_BINDING_REQUIRED'}]},{diagnostics:[{code:'CTE_FLOW_NOT_ALLOWED'}]},{policy_result:'REJECT_INPUT'}]){assert.throws(()=>explain({...r,...patch}));rejected++;}
const hostile=explain({...r,policy_result:'UNKNOWN',diagnostics:[{code:'<script>unsafe</script>'}],private_payload:'DO_NOT_DISPLAY'});assert.ok(!hostile.includes('<script>'));assert.ok(!hostile.includes('DO_NOT_DISPLAY'));
console.log(JSON.stringify({evidence_class:'AUTHOR_OFFLINE_DISPLAY_CHECK',subject:'e982d4650d8a3512bde46733c4d13dba3130812f',actual_d1_reports:reports.length,unsupported_reports_rejected:rejected,unknown_code_payload_not_echoed:true,examples:reports.map(({name,report})=>({name,raw_report:report,explanation:explain(report)})),limitations:'Fictional inputs; description ALLOW does not validate binding. No approval fabricated, no effects, no user testing, no canonical QC or public API change.'},null,2));
