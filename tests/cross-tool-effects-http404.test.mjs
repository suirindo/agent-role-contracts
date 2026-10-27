import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopbackHttp404 } from '../experiments/cross-tool-effects/lab/faults.mjs';
import { startObserver } from '../experiments/cross-tool-effects/lab/run.mjs';

test('404 receiver mode needs opt-in and cannot combine with drop-response before fork',async()=>{
 await assert.rejects(startObserver({respondNotFound:true}),/LAB_LOOPBACK_OPT_IN_REQUIRED/);
 await assert.rejects(startObserver({loopback:true,respondNotFound:'yes'}),/LAB_LOOPBACK_OPT_IN_REQUIRED/);
 await assert.rejects(startObserver({loopback:true,dropResponse:true,respondNotFound:true}),/LAB_LOOPBACK_OPT_IN_REQUIRED/);
});
test('http404 lab needs explicit opt-in',async()=>{await assert.rejects(runLoopbackHttp404(),/LAB_LOOPBACK_OPT_IN_REQUIRED/);});
test('actual 404-after-effect with 204 and no-send controls',{skip:process.env.ARC_CTEI_LOOPBACK_LAB!=='1'},async()=>{
 const report=await runLoopbackHttp404({loopback:true});
 assert.equal(report.expected_observations_matched,true);
 assert.deepEqual(report.cases.map(c=>c.id),['healthy-204-control','http-404-after-effect','no-send-control']);
 const [ok,nf,none]=report.cases;
 assert.equal(ok.send_result.http_status,204);assert.equal(ok.sender_observed_success,true);
 assert.equal(nf.send_result.http_status,404);assert.equal(nf.sender_observed_success,false);
 assert.equal(nf.receiver_observation.receipts.length,1);assert.equal(nf.receiver_observation.receipts[0].byte_length,50);
 assert.equal(none.receiver_observation.connections,0);assert.equal(none.send_result.executor_starts,0);
 for(const c of report.cases){assert.equal(c.replay_observation.connections,0);assert.equal(c.replay_observation.receipts.length,0);}
});
