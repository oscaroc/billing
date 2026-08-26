"use client";

type BillingGuideProps = {
  onOpenCustomers: () => void;
  onOpenInvoices: () => void;
  onNewInvoice: () => void;
};

const guideLinks = [
  ["start", "Start here"],
  ["customers", "Customers"],
  ["contracts", "Billing contracts"],
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["statuses", "Status reference"],
];

export default function BillingGuide({ onOpenCustomers, onOpenInvoices, onNewInvoice }: BillingGuideProps) {
  return <div className="content docs-page">
    <section className="docs-intro">
      <div><p className="eyebrow">Nivora billing guide</p><h1>From agreement to payment</h1><p>A practical operating guide for keeping customer billing accurate, traceable, and current.</p></div>
      <div className="docs-intro-actions"><button onClick={onOpenCustomers}>Open customers</button><button className="primary" onClick={onNewInvoice}>＋ New invoice</button></div>
    </section>

    <section className="docs-journey" aria-label="Billing workflow">
      <div><span>1</span><strong>Customer</strong><small>Identity and currency</small></div>
      <i>→</i>
      <div><span>2</span><strong>Contract</strong><small>Terms and schedule</small></div>
      <i>→</i>
      <div><span>3</span><strong>Invoice</strong><small>Charges and due date</small></div>
      <i>→</i>
      <div><span>4</span><strong>Payment</strong><small>Settlement and balance</small></div>
    </section>

    <div className="docs-layout">
      <aside className="docs-nav" aria-label="Guide sections"><strong>In this guide</strong>{guideLinks.map(([id, label]) => <a key={id} href={`#guide-${id}`}>{label}</a>)}</aside>
      <div className="docs-content">
        <section id="guide-start" className="docs-section"><p className="docs-kicker">01 · Start here</p><h2>The reliable billing sequence</h2><p>Set up the customer first, attach one or more billing contracts, generate charges from the contract, then record payments against issued invoices. Following this sequence keeps currency, terms, and contract history connected.</p><ol className="docs-checklist"><li><span>1</span><div><strong>Create the customer account</strong><p>Add legal name, billing contact, address, tax ID, account currency, and tenant reference.</p></div></li><li><span>2</span><div><strong>Add the billing contract</strong><p>Set payment terms, agreement dates, services, rates, and each item’s billing schedule.</p></div></li><li><span>3</span><div><strong>Generate and issue the invoice</strong><p>Review due items, totals, tax, and customer-facing notes before issuing.</p></div></li><li><span>4</span><div><strong>Record settlement</strong><p>Apply the payment to the correct invoice and retain its method and reference.</p></div></li></ol><div className="docs-callout"><span>✓</span><div><strong>Best starting point</strong><p>Use contract-generated invoices for recurring or agreement-based work. Create a standalone invoice for truly ad hoc charges.</p></div></div></section>

        <section id="guide-customers" className="docs-section"><p className="docs-kicker">02 · Customers</p><h2>One account, one billing currency</h2><p>The customer record is the billing identity. Currency belongs here so all contracts for the customer share the same monetary basis.</p><div className="docs-columns"><div><h3>Required</h3><ul><li>Legal company name</li><li>Billing email</li><li>Billing address</li></ul></div><div><h3>Recommended</h3><ul><li>Billing contact</li><li>Tax ID or EIN</li><li>Nivora tenant or Azure subscription</li></ul></div></div><button className="docs-link-button" onClick={onOpenCustomers}>Go to customers →</button></section>

        <section id="guide-contracts" className="docs-section"><p className="docs-kicker">03 · Billing contracts</p><h2>Keep agreement terms where they belong</h2><p>A customer can have multiple contracts. Each contract owns its payment terms, start and renewal dates, status, and billable items.</p><div className="docs-rule-grid"><div><span>Agreement</span><strong>Name, status, terms, dates</strong></div><div><span>Item</span><strong>Service, billing type, quantity, rate</strong></div><div><span>Schedule</span><strong>Billing start, end, next billing date</strong></div><div><span>Adjustments</span><strong>Discount and taxable setting</strong></div></div><div className="docs-callout warning"><span>!</span><div><strong>Before generating</strong><p>Confirm the contract is Active and each due item has the correct next billing date. Paused or completed items are excluded.</p></div></div></section>

        <section id="guide-invoices" className="docs-section"><p className="docs-kicker">04 · Invoices</p><h2>Draft deliberately, issue once</h2><p>A draft can be edited or deleted. Once issued, preserve the audit trail: mark it sent, record payments, or void it with a reason instead of deleting it.</p><div className="docs-flow"><div><span className="status draft"><i />Draft</span><small>Review and edit</small></div><b>→</b><div><span className="status issued"><i />Issued</span><small>Official receivable</small></div><b>→</b><div><span className="status sent"><i />Sent</span><small>Delivered to customer</small></div><b>→</b><div><span className="status paid"><i />Paid</span><small>Balance settled</small></div></div><div className="docs-actions"><button onClick={onOpenInvoices}>Open invoices</button><button className="primary" onClick={onNewInvoice}>＋ Create invoice</button></div></section>

        <section id="guide-payments" className="docs-section"><p className="docs-kicker">05 · Payments</p><h2>Apply funds to the exact receivable</h2><p>Record the payment date, amount, method, and transaction reference. Partial payments reduce the balance while keeping the invoice open; full settlement moves it to Paid.</p><div className="docs-columns"><div><h3>Before recording</h3><ul><li>Confirm invoice number</li><li>Check remaining balance</li><li>Verify payment date</li></ul></div><div><h3>Keep for reconciliation</h3><ul><li>Bank or card reference</li><li>Payment method</li><li>Exact received amount</li></ul></div></div></section>

        <section id="guide-statuses" className="docs-section"><p className="docs-kicker">06 · Status reference</p><h2>What each invoice state means</h2><div className="docs-status-list"><div><span className="status draft"><i />Draft</span><p>Editable and not yet an official receivable.</p></div><div><span className="status issued"><i />Issued</span><p>Finalized and ready to send.</p></div><div><span className="status sent"><i />Sent</span><p>Delivered to the billing contact.</p></div><div><span className="status partially-paid"><i />Partially Paid</span><p>A balance remains after one or more payments.</p></div><div><span className="status overdue"><i />Overdue</span><p>Past the due date with an outstanding balance.</p></div><div><span className="status paid"><i />Paid</span><p>Balance is fully settled.</p></div><div><span className="status voided"><i />Voided</span><p>Cancelled with audit history retained.</p></div></div></section>
      </div>
    </div>
  </div>;
}
