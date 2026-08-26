import assert from "node:assert/strict";
import test from "node:test";
import { validateInvoice } from "../lib/billing.ts";

const valid={customer:"Acme, Inc.",billingEmail:"billing@acme.test",billingAddress:"1 Main St",issueDate:"2026-08-24",dueDate:"2026-09-23",currency:"cad",discount:50,taxRate:5,lines:[{description:"Nivora monthly",quantity:2,rate:100}]};

test("calculates authoritative invoice totals",()=>{
  const invoice=validateInvoice(valid);
  assert.equal(invoice.subtotal,200);
  assert.equal(invoice.tax,7.5);
  assert.equal(invoice.total,157.5);
  assert.equal(invoice.currency,"CAD");
});

test("rejects client totals and invalid financial inputs",()=>{
  assert.equal(validateInvoice({...valid,total:1}).total,157.5);
  assert.throws(()=>validateInvoice({...valid,discount:201}),/Discount cannot exceed/);
  assert.throws(()=>validateInvoice({...valid,taxRate:101}),/tax rate is invalid/);
  assert.throws(()=>validateInvoice({...valid,lines:[{description:"",quantity:1,rate:10}]}),/line items are invalid/);
});

test("rejects invalid invoice identity and dates",()=>{
  assert.throws(()=>validateInvoice({...valid,billingEmail:"invalid"}),/required/);
  assert.throws(()=>validateInvoice({...valid,dueDate:"2026-08-23"}),/cannot precede/);
  assert.throws(()=>validateInvoice({...valid,currency:"US"}),/Currency is invalid/);
});
