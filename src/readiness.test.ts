import {test} from "node:test";
import assert from "node:assert/strict";
import {planPayments, paymentTimeline, shiftBusinessDays, type Obligation, type CashAccount} from "./readiness";
const payroll: Obligation = {id:"payroll", title:"Payroll", currency:"USD", amount:24000, due:"2026-10-30", transferDays:2, bufferDays:2, accountId:"usd",accountName:"USD payroll"};
const gbp: CashAccount = {id:"gbp",name:"GBP bank",currency:"GBP",available:100000,kind:"BANKING"};
test("Friday payroll needs a Monday move with two settlement days and two buffer days",()=> {
  assert.deepEqual(paymentTimeline(payroll),{payOn:"2026-10-30", readyBy:"2026-10-28",moveBy:"2026-10-26"});
  assert.equal(shiftBusinessDays("2026-10-26",-1),"2026-10-23");
  assert.equal(shiftBusinessDays("2026-10-26",-1,["2026-10-23"]),"2026-10-22");
});
test("cash in GBP does not make an absent USD account ready",()=> {
  const [result] = planPayments([gbp],[payroll],"2026-10-23");
  assert.equal(result?.kind,"transfer");
  assert.equal(result?.shortfall,24000);
  if (result?.kind === "transfer") {
    assert.ok(Math.abs(result.debit-24000/1.3)<.001);
    assert.equal(result.overdue,false);
  }
  assert.equal(planPayments([gbp],[payroll],"2026-10-27")[0]?.kind,"transfer");
});
test("treasury and unknown available balances cannot fund payroll",()=> {
  assert.equal(planPayments([{...gbp,kind:"INVESTMENT"}],[payroll],"2026-10-23")[0]?.kind,"blocked");
  assert.equal(planPayments([{...gbp,available:null}],[payroll],"2026-10-23")[0]?.kind,"blocked");
});
test("two bills cannot spend the same target balance twice",()=> {
  const first = {...payroll,currency:"GBP",accountId:"gbp",amount:70000};
  const results = planPayments([gbp],[first,{...first,id:"second"}],"2026-10-23");
  assert.equal(results[0]?.kind,"ready");
  assert.equal(results[1]?.kind,"blocked");
  assert.equal(results[1]?.shortfall,40000);
});
test("two transfers cannot reserve the same source cash twice",()=> {
  const results=planPayments([{...gbp,available:20000}],[payroll,{...payroll,id:"second",accountId:"other-usd"}],"2026-10-23");
  assert.equal(results[0]?.kind,"transfer");
  assert.equal(results[1]?.kind,"blocked");
});
test("a wrong-currency target is blocked even with enough nominal money",()=> {
  assert.equal(planPayments([{...gbp,id:"usd"}],[payroll],"2026-10-23")[0]?.kind,"blocked");
});
test("weekend payments move to Friday; invalid calendar dates fail",()=> {
  assert.equal(paymentTimeline({...payroll,due:"2026-11-01"}).payOn,"2026-10-30");
  assert.throws(()=>shiftBusinessDays("2026-02-30",1),/calendar date/);
});
