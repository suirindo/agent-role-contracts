const order=(a,b)=>a<b?-1:a>b?1:0;

const FAIL_CLOSED_CLAIMS=Object.freeze({
 execution_authorized:false,
 runtime_enforcement:false,
 identity_verified:false,
 evidence_verified:false,
 source_files_checked:false,
 sensitive_data_scanned:false,
 output_schema_validated:false,
});

export function buildReport(version,kind,errors,details={}) {
 return {...details,tool:'agent-role-contracts',version,kind,valid:errors.length===0,
  ...FAIL_CLOSED_CLAIMS,
  errors:errors.sort((a,b)=>order(a.path,b.path)||order(a.code,b.code)||order(a.message,b.message))};
}
