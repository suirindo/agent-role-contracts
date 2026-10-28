/** Prints compact verification reports for synthetic scenarios; no key, payload or signature output. */
import { verifyTaskApprovalReceipt } from './approval.mjs';
import { scenario, render } from './fixtures.mjs';

const cases = [
 ['legitimate receipt', () => {}],
 ['stale pending request revision', s => { s.context.request_revision = 2; }],
 ['revoked key', s => { s.registry.keys[0].status = 'revoked'; }],
 ['expired at verifier time', s => { s.context.evaluated_at_ms = s.payload.expires_at_ms; }],
 ['known D1 deny retained', s => { s.f.contract.allowed_effects = ['filesystem.read']; }],
 ['receipt missing', s => { s.omit = 'receiptJson'; }],
];
for (const [name, mutate] of cases) {
 const s = await scenario();
 mutate(s);
 const input = render(s);
 if (s.omit) delete input[s.omit];
 const r = await verifyTaskApprovalReceipt(input);
 console.log(name.padEnd(34), r.result.padEnd(17), 'sig=' + r.receipt_signature_verified, 'execution_authorized=' + r.execution_authorized, r.diagnostics.map(d => d.code).join(',') || '-');
}
