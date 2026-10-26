// Offline research display. Never authenticates a report or grants execution.
const labels={ALLOW:'操作条件の計算結果は成立（実行権限は未確認）',DENY:'供給された記録に禁止条件あり',UNKNOWN:'判定に必要な条件が未確認',REJECT_INPUT:'入力形式を受理できない'};
const binding={UNKNOWN:'未確認',CONSISTENT:'供給された宣言と整合',INCONSISTENT:'供給された宣言と不整合'};
const known={CTE_BINDING_REQUIRED:'対象に結び付いたレビュー・承認宣言を確認する。',CTE_PROVENANCE_INCOMPLETE:'参照データの一覧と来歴の完全性を確認する。',CTE_FLOW_NOT_ALLOWED:'参照した全データを一括して許可するルールを確認する。',CTE_EFFECT_NOT_DECLARED:'このタスクで要求された操作が明示されているか確認する。',CTE_INPUT_INVALID:'入力を既存D1スキーマと照合する。'};
export function explain(report) {
 if(!report||report.profile!=='cross-tool-effects/d1-report/0.1'||!Object.hasOwn(labels,report.policy_result)||!Object.hasOwn(binding,report.binding_status)||report.authority_status!=='UNKNOWN'||report.execution_status!=='NOT_PERFORMED'||report.coverage!=='SUPPLIED_SNAPSHOTS_ONLY'||!Array.isArray(report.diagnostics)||report.diagnostics.length>64||report.diagnostics.some(x=>!x||typeof x.code!=='string'||x.code.length>128)) throw Error('UNSUPPORTED_REPORT');
 for(const k of ['execution_authorized','runtime_enforcement','identity_verified','evidence_verified','action_executed','replay_protection_enforced','source_bytes_observed','receiver_observed'])if(report[k]!==false)throw Error('UNSUPPORTED_REPORT');
 if(report.policy_result==='ALLOW'&&(report.binding_status==='INCONSISTENT'||report.diagnostics.length!==0))throw Error('CONTRADICTORY_REPORT');
 if(report.policy_result==='REJECT_INPUT'&&(report.binding_status!=='UNKNOWN'||report.diagnostics.length!==1||report.diagnostics[0].code!=='CTE_INPUT_INVALID'))throw Error('CONTRADICTORY_REPORT');
 const next=[...new Set(report.diagnostics.map(x=>Object.hasOwn(known,x.code)?known[x.code]:'原レポートの診断コードと対象入力を照合する。'))];
 return ['研究用の説明表示（入力レポートの真正性は未検証）','',`判定：${labels[report.policy_result]}`,`対象の結び付き：${binding[report.binding_status]}`,'','確認範囲：供給されたJSONの比較結果。実際の権限・データ・送信先の観測は含まれない。','不足する証拠：実行権限の認証、実操作の観測、実行経路での制御。','操作の実行：このレポートでは未実施。実行許可は確立していない。','', '次の確認：',...(next.length?next:['実行主体が持つ正規の権限・承認・実行経路を別途確認する。']).map(x=>'- '+x)].join('\n')+'\n';
}
