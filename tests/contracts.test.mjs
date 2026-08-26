import assert from "node:assert/strict";
import test from "node:test";
import { validateContract } from "../lib/contracts.ts";

const valid = {
  name: "Managed services",
  status: "Active",
  startDate: "2026-09-01",
  renewalDate: "2027-09-01",
  currency: "USD",
  terms: "Net 30",
  items: [{
    serviceName: "Monthly support",
    billingType: "Monthly",
    quantity: 1,
    unitRate: 500,
    billingStart: "2026-09-01",
  }],
};

test("normalizes a contract renewal date", () => {
  const contract = validateContract(valid);
  assert.equal(contract.renewalDate, "2027-09-01");
  assert.equal(contract.terms, "Net 30");
  assert.equal("endDate" in contract, false);
  assert.equal("currency" in contract, false);
});
