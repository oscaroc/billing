"use client";

type CustomerOption = { id:string; legalName:string; status:"Active"|"Inactive" };
export type InvoiceLine = { id:number; description:string; quantity:number; rate:number };

type InvoiceEditorProps = {
  editingInvoice:string|null;
  customer:string;
  customers:CustomerOption[];
  billingEmail:string;
  billingAddress:string;
  taxId:string;
  terms:string;
  currency:string;
  lines:InvoiceLine[];
  discount:number;
  taxRate:number;
  notes:string;
  subtotal:number;
  tax:number;
  total:number;
  onCustomerChange:(value:string)=>void;
  onBillingEmailChange:(value:string)=>void;
  onBillingAddressChange:(value:string)=>void;
  onTaxIdChange:(value:string)=>void;
  onTermsChange:(value:string)=>void;
  onCurrencyChange:(value:string)=>void;
  onLineChange:(id:number,field:keyof InvoiceLine,value:string|number)=>void;
  onRemoveLine:(id:number)=>void;
  onAddLine:()=>void;
  onDiscountChange:(value:number)=>void;
  onTaxRateChange:(value:number)=>void;
  onNotesChange:(value:string)=>void;
  onCancel:()=>void;
  onSubmit:()=>void;
  money:(value:number,currency:string)=>string;
};

export default function InvoiceEditor(props:InvoiceEditorProps){
  return <div className="content invoice-editor-page">
    <section className="invoice-editor-head"><div><p className="eyebrow">{props.editingInvoice?"Draft invoice":"New receivable"}</p><h1>{props.editingInvoice?`Edit ${props.editingInvoice}`:"Create invoice"}</h1><p>Build the receivable, confirm terms, and review the total before saving.</p></div><button onClick={props.onCancel}>← Back</button></section>

    <div className="invoice-editor-layout"><div className="invoice-editor-main">
      <section className="invoice-editor-section"><div className="invoice-step"><span>1</span><div><strong>Customer & terms</strong><small>Who you are billing and when payment is due</small></div></div><div className="form-grid"><label>Customer<select value={props.customer} onChange={(event)=>props.onCustomerChange(event.target.value)}>{props.customers.filter((item)=>item.status==="Active").map((item)=><option key={item.id}>{item.legalName}</option>)}</select></label><label>Billing email<input type="email" value={props.billingEmail} onChange={(event)=>props.onBillingEmailChange(event.target.value)}/></label><label>Payment terms<select value={props.terms} onChange={(event)=>props.onTermsChange(event.target.value)}><option>Net 30</option><option>Net 15</option><option>Due on receipt</option></select></label><label>Currency<select value={props.currency} onChange={(event)=>props.onCurrencyChange(event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option></select></label><label>Tax ID / EIN<input value={props.taxId} onChange={(event)=>props.onTaxIdChange(event.target.value)}/></label><label className="full">Billing address<textarea value={props.billingAddress} onChange={(event)=>props.onBillingAddressChange(event.target.value)}/></label></div></section>

      <section className="invoice-editor-section"><div className="invoice-step"><span>2</span><div><strong>Invoice items</strong><small>Add recurring, implementation, or usage charges</small></div></div><div className="line-card"><div className="line-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>{props.lines.map((line)=><div className="line-row" key={line.id}><label><span>Description</span><input value={line.description} onChange={(event)=>props.onLineChange(line.id,"description",event.target.value)}/></label><label><span>Quantity</span><input type="number" min="1" value={line.quantity} onChange={(event)=>props.onLineChange(line.id,"quantity",Number(event.target.value))}/></label><label><span>Rate</span><input type="number" min="0" value={line.rate} onChange={(event)=>props.onLineChange(line.id,"rate",Number(event.target.value))}/></label><strong aria-label="Line total">{props.money(line.quantity*line.rate,props.currency)}</strong>{props.lines.length>1&&<button className="remove-line" aria-label="Remove line" onClick={()=>props.onRemoveLine(line.id)}>×</button>}</div>)}<button className="add-line" onClick={props.onAddLine}>＋ Add line item</button></div></section>

      <section className="invoice-editor-section"><div className="invoice-step"><span>3</span><div><strong>Adjustments & notes</strong><small>Apply discounts, tax, and customer-facing context</small></div></div><div className="adjustments"><label>Discount ($)<input type="number" min="0" value={props.discount} onChange={(event)=>props.onDiscountChange(Number(event.target.value))}/></label><label>Tax rate (%)<input type="number" min="0" value={props.taxRate} onChange={(event)=>props.onTaxRateChange(Number(event.target.value))}/></label></div><label className="invoice-note">Customer-facing note<textarea value={props.notes} onChange={(event)=>props.onNotesChange(event.target.value)}/></label></section>
    </div>

    <aside className="invoice-editor-summary"><p className="docs-kicker">Invoice summary</p><h2>{props.total>0?props.money(props.total,props.currency):props.money(0,props.currency)}</h2><div><p><span>Subtotal</span><strong>{props.money(props.subtotal,props.currency)}</strong></p>{props.discount>0&&<p><span>Discount</span><strong>−{props.money(props.discount,props.currency)}</strong></p>}<p><span>Tax ({props.taxRate}%)</span><strong>{props.money(props.tax,props.currency)}</strong></p><p className="total"><span>Total due</span><strong>{props.money(props.total,props.currency)}</strong></p></div><small>{props.lines.length} line item{props.lines.length===1?"":"s"} · {props.terms} · {props.currency}</small></aside>
    </div>

    <div className="invoice-editor-actions"><button onClick={props.onCancel}>Cancel</button><button className="primary" disabled={!props.customer||!props.billingEmail||!props.lines.length||props.total<=0} onClick={props.onSubmit}>{props.editingInvoice?"Save changes":"Generate invoice"}</button></div>
  </div>;
}
