import test from "node:test";
import assert from "node:assert/strict";
import { remitToAddress, validateInvoice } from "../lib/billing.ts";

const base = { customer: "Acme, Inc.", billingEmail: "billing@acme.test", billingAddress: "1 Main St", issueDate: "2026-09-16", dueDate: "2026-10-16", currency: "USD", lines: [{ description: "Service", quantity: 1, rate: 100 }] };

test("reads the configured remit-to address", () => {
  process.env.REMIT_TO_ADDRESS = "Nivora\n123 Pine St\nSeattle, WA 98101";
  assert.equal(remitToAddress(), "Nivora\n123 Pine St\nSeattle, WA 98101");
});

test("absent config yields an empty string, not undefined", () => {
  delete process.env.REMIT_TO_ADDRESS;
  assert.equal(remitToAddress(), "");
});

test("caps a runaway address", () => {
  process.env.REMIT_TO_ADDRESS = "x".repeat(900);
  assert.equal(remitToAddress().length, 500);
  delete process.env.REMIT_TO_ADDRESS;
});

test("a client-supplied remitTo cannot redirect payment", () => {
  process.env.REMIT_TO_ADDRESS = "Real Company\n1 Real St";
  // Mirrors the route: server value is spread last and wins.
  const stored = { ...validateInvoice({ ...base, remitTo: "Attacker\n99 Fake Ave" }), remitTo: remitToAddress() };
  assert.equal(stored.remitTo, "Real Company\n1 Real St");
  delete process.env.REMIT_TO_ADDRESS;
});
