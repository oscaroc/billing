import test from "node:test";
import assert from "node:assert/strict";

// Mirrors the selection logic in app/components/ContractManager.tsx.
const today = () => new Date().toISOString().slice(0, 10);
const shift = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const billableItems = (c) => c.items.filter((i) => i.status === "Active" && (!i.billingEnd || i.billingEnd >= today()));
const dueItems = (c) => billableItems(c).filter((i) => i.billingType === "One-time" ? !i.lastInvoicedAt : (!i.nextBillingDate || i.nextBillingDate <= today()));
const invoiceItems = (c) => { const due = dueItems(c); return due.length ? due : billableItems(c); };
const blockedReason = (c) => c.status !== "Active" ? `Contract is ${c.status}, not Active` : !invoiceItems(c).length ? "No active items to invoice" : "";

const item = (over = {}) => ({ serviceName: "svc", billingType: "Monthly", status: "Active", nextBillingDate: today(), billingEnd: "", ...over });
const contract = (items, over = {}) => ({ status: "Active", items, ...over });

test("scheduled-ahead contract can still be invoiced on demand", () => {
  const c = contract([item({ nextBillingDate: shift(30) })]);
  assert.equal(dueItems(c).length, 0, "nothing is due yet");
  assert.equal(invoiceItems(c).length, 1, "but the item is still billable");
  assert.equal(blockedReason(c), "", "so the button is enabled");
});

test("due items are preferred over the full billable set", () => {
  const c = contract([item({ serviceName: "due", nextBillingDate: today() }), item({ serviceName: "later", nextBillingDate: shift(30) })]);
  assert.deepEqual(invoiceItems(c).map((i) => i.serviceName), ["due"], "only the due item is seeded");
});

test("never seeds an empty invoice", () => {
  for (const c of [contract([]), contract([item({ status: "Paused" })]), contract([item({ billingEnd: shift(-1) })])]) {
    assert.equal(invoiceItems(c).length, 0);
    assert.equal(blockedReason(c), "No active items to invoice");
  }
});

test("non-Active contracts stay blocked, and say why", () => {
  assert.equal(blockedReason(contract([item()], { status: "Draft" })), "Contract is Draft, not Active");
});

// A One-time item is due only when it has never been invoiced. The previous
// `|| !i.nextBillingDate` clause short-circuited that test, so an invoiced item
// whose next date had been cleared read as due again on every press.
test("already-invoiced one-time item is never due again", () => {
  for (const nextBillingDate of ["", shift(-30), shift(30)]) {
    const c = contract([item({ billingType: "One-time", lastInvoicedAt: "2026-01-01", nextBillingDate })]);
    assert.equal(dueItems(c).length, 0, `nextBillingDate=${nextBillingDate || "(blank)"}`);
  }
});

test("never-invoiced one-time item is due regardless of next date", () => {
  const c = contract([item({ billingType: "One-time", lastInvoicedAt: undefined, nextBillingDate: shift(30) })]);
  assert.equal(dueItems(c).length, 1);
});

test("recurring item with no schedule is still due", () => {
  const c = contract([item({ billingType: "Monthly", nextBillingDate: "" })]);
  assert.equal(dueItems(c).length, 1);
});

test("an invoiced one-time item stays billable for deliberate on-demand re-invoicing", () => {
  const c = contract([item({ billingType: "One-time", lastInvoicedAt: "2026-01-01", nextBillingDate: shift(30) })]);
  assert.equal(dueItems(c).length, 0, "not offered automatically");
  assert.equal(invoiceItems(c).length, 1, "but reachable if the user presses the button");
});
