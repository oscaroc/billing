"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

export type ContractItem = { id?:string;serviceName:string;description:string;billingType:"One-time"|"Monthly"|"Annual"|"Usage-based"|"Milestone";quantity:number;unitRate:number;discount:number;taxable:boolean;billingStart:string;billingEnd:string;nextBillingDate:string;lastInvoicedAt?:string;status:"Active"|"Paused"|"Completed" };
export type BillingContract = { id?:string;customerId?:string;name:string;status:"Draft"|"Active"|"Paused"|"Completed"|"Cancelled";startDate:string;renewalDate:string;terms:string;notes:string;items:ContractItem[] };
type CustomerSummary = {id:string;legalName:string;currency:string};

const today=()=>new Date().toISOString().slice(0,10);
const emptyItem=():ContractItem=>({serviceName:"",description:"",billingType:"One-time",quantity:1,unitRate:0,discount:0,taxable:false,billingStart:today(),billingEnd:"",nextBillingDate:today(),status:"Active"});
const emptyContract=():BillingContract=>({name:"",status:"Active",startDate:today(),renewalDate:"",terms:"Net 30",notes:"",items:[emptyItem()]});
const money=(value:number,currency:string)=>new Intl.NumberFormat("en-US",{style:"currency",currency}).format(value);

function EditableMoneyInput({value,onChange}:{value:number;onChange:(value:number)=>void}){
  const [displayValue,setDisplayValue]=useState(String(value));
  return <input
    type="number"
    min="0"
    step="0.01"
    inputMode="decimal"
    value={displayValue}
    onChange={(event)=>{
      const next=event.target.value;
      setDisplayValue(next);
      onChange(next===""?0:Number(next));
    }}
    onBlur={()=>setDisplayValue(String(value))}
  />;
}

export default function ContractManager({customer,onClose,onInvoice}:{customer:CustomerSummary;onClose:()=>void;onInvoice:(contract:BillingContract,items:ContractItem[])=>void}){
  const [contracts,setContracts]=useState<BillingContract[]>([]); const [form,setForm]=useState<BillingContract|null>(null); const [loading,setLoading]=useState(true); const [message,setMessage]=useState("");
  const load=async()=>{setLoading(true);const response=await authFetch(`/api/customers/${customer.id}/contracts`,{cache:"no-store"});setContracts(response.ok?await response.json():[]);setLoading(false);};
  useEffect(()=>{let active=true;authFetch(`/api/customers/${customer.id}/contracts`,{cache:"no-store"}).then(async(response)=>response.ok?response.json():[]).then((rows)=>{if(active)setContracts(rows);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[customer.id]);
  const updateItem=(index:number,patch:Partial<ContractItem>)=>setForm((current)=>current?{...current,items:current.items.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item)}:current);
  const save=async()=>{if(!form)return;const response=await authFetch(form.id?`/api/contracts/${form.id}`:`/api/customers/${customer.id}/contracts`,{method:form.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});if(!response.ok){setMessage((await response.json().catch(()=>({}))).error||"Contract could not be saved");return;}setForm(null);setMessage("Contract saved");await load();};
  const remove=async(contract:BillingContract)=>{const response=await authFetch(`/api/contracts/${contract.id}`,{method:"DELETE"});if(!response.ok){setMessage("Contract could not be deleted");return;}setMessage("Contract deleted");await load();};
  const billableItems=(contract:BillingContract)=>contract.items.filter((item)=>item.status==="Active"&&(!item.billingEnd||item.billingEnd>=today()));
  // Marked Active, but every item is past its billing end (or paused/completed).
  const ended=(contract:BillingContract)=>contract.status==="Active"&&contract.items.length>0&&!billableItems(contract).length;
  const dueItems=(contract:BillingContract)=>billableItems(contract).filter((item)=>item.billingType==="One-time"?!item.lastInvoicedAt:(!item.nextBillingDate||item.nextBillingDate<=today()));
  // Invoicing ahead of the schedule is allowed: the button seeds the invoice
  // editor, which the user still reviews and submits. Nothing bills itself.
  const invoiceItems=(contract:BillingContract)=>{const due=dueItems(contract);return due.length?due:billableItems(contract);};
  const blockedReason=(contract:BillingContract)=>contract.status!=="Active"?`Contract is ${contract.status}, not Active`:!invoiceItems(contract).length?"No active items to invoice":"";
  return <div className="modal-backdrop contract-layer" role="presentation" onMouseDown={onClose}><section className="modal contracts-modal" role="dialog" aria-modal="true" aria-labelledby="contracts-title" onMouseDown={(event)=>event.stopPropagation()}>
    {!form?<><div className="modal-head"><div><p className="eyebrow">{customer.legalName}</p><h2 id="contracts-title">Billing contracts</h2><small>Projects, recurring services, and scheduled charges</small></div><button aria-label="Close contracts" onClick={onClose}>×</button></div>
      <div className="contract-toolbar"><p>{contracts.length} {contracts.length===1?"contract":"contracts"}</p><button className="primary" onClick={()=>setForm(emptyContract())}>＋ New contract</button></div>
      <div className="contract-list">{loading?<p className="contract-empty">Loading contracts…</p>:contracts.map((contract)=>{const due=dueItems(contract);const items=invoiceItems(contract);const blocked=blockedReason(contract);return <article className="contract-card" key={contract.id}><header><div><strong>{contract.name}</strong><small>{contract.startDate} {contract.renewalDate?`· Renews ${contract.renewalDate}`:"· No renewal date"}</small></div><span className={`customer-status ${ended(contract)?"inactive":contract.status.toLowerCase()}`}>{ended(contract)?"Ended":contract.status}</span></header><div className="contract-items">{contract.items.map((item)=><div key={item.id}><div><strong>{item.serviceName}</strong><small>{item.billingType}{item.nextBillingDate?` · Next ${item.nextBillingDate}`:""}</small></div><b>{money(Math.max(0,item.quantity*item.unitRate-item.discount),customer.currency)}</b></div>)}</div><footer><span>{due.length} item{due.length===1?"":"s"} due now</span><div><button onClick={()=>setForm(structuredClone(contract))}>Edit</button><button className="danger" onClick={()=>remove(contract)}>Delete</button><button className="primary" disabled={Boolean(blocked)} title={blocked||`Generate an invoice from ${items.length} item${items.length===1?"":"s"}`} onClick={()=>onInvoice(contract,items)}>Generate invoice</button></div></footer></article>})}{!loading&&!contracts.length?<div className="contract-empty"><span>▤</span><strong>No billing contracts yet</strong><p>Add a project with one-time or recurring services.</p></div>:null}</div>
    </>:<><div className="modal-head"><div><p className="eyebrow">Billing agreement</p><h2 id="contracts-title">{form.id?"Edit contract":"New contract"}</h2></div><button aria-label="Back to contracts" onClick={()=>setForm(null)}>×</button></div>
      <div className="customer-form-section"><h3>Contract details</h3><div className="form-grid three"><label className="full">Contract / project name *<input autoFocus value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Website and growth services" /></label><label>Status<select value={form.status} onChange={(event)=>setForm({...form,status:event.target.value as BillingContract["status"]})}><option>Draft</option><option>Active</option><option>Paused</option><option>Completed</option><option>Cancelled</option></select></label><label>Payment terms<select value={form.terms} onChange={(event)=>setForm({...form,terms:event.target.value})}><option>Net 30</option><option>Net 15</option><option>Due on receipt</option></select></label><label>Start date *<input type="date" value={form.startDate} onChange={(event)=>setForm({...form,startDate:event.target.value})}/></label><label>Renewal date<input type="date" value={form.renewalDate} onChange={(event)=>setForm({...form,renewalDate:event.target.value})}/></label><label className="full">Internal notes<textarea value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})}/></label></div></div>
      <div className="customer-form-section"><div className="contract-section-head"><div><h3>Contract items</h3><p>Add one-time projects and recurring services to the same agreement.</p></div><button onClick={()=>setForm({...form,items:[...form.items,emptyItem()]})}>＋ Add item</button></div>{form.items.map((item,index)=><article className="contract-item-form" key={item.id||index}><header><strong>Item {index+1}</strong>{form.items.length>1?<button aria-label={`Remove item ${index+1}`} onClick={()=>setForm({...form,items:form.items.filter((_,itemIndex)=>itemIndex!==index)})}>×</button>:null}</header><div className="form-grid three"><label className="full">Service / project name *<input value={item.serviceName} onChange={(event)=>updateItem(index,{serviceName:event.target.value})} placeholder="Website design"/></label><label>Billing type<select value={item.billingType} onChange={(event)=>updateItem(index,{billingType:event.target.value as ContractItem["billingType"]})}><option>One-time</option><option>Monthly</option><option>Annual</option><option>Usage-based</option><option>Milestone</option></select></label><label>Quantity<input type="number" min="0.0001" step="0.01" value={item.quantity} onChange={(event)=>updateItem(index,{quantity:Number(event.target.value)})}/></label><label>Rate<EditableMoneyInput value={item.unitRate} onChange={(unitRate)=>updateItem(index,{unitRate})}/></label><label>Billing start<input type="date" value={item.billingStart} onChange={(event)=>updateItem(index,{billingStart:event.target.value,nextBillingDate:event.target.value})}/></label><label>Billing end<input type="date" value={item.billingEnd} onChange={(event)=>updateItem(index,{billingEnd:event.target.value})}/></label><label>Next billing date<input type="date" value={item.nextBillingDate} onChange={(event)=>updateItem(index,{nextBillingDate:event.target.value})}/></label><label>Item discount<EditableMoneyInput value={item.discount} onChange={(discount)=>updateItem(index,{discount})}/></label><label>Status<select value={item.status} onChange={(event)=>updateItem(index,{status:event.target.value as ContractItem["status"]})}><option>Active</option><option>Paused</option><option>Completed</option></select></label><label className="full">Description<textarea value={item.description} onChange={(event)=>updateItem(index,{description:event.target.value})}/></label><label className="checkbox-label"><input type="checkbox" checked={item.taxable} onChange={(event)=>updateItem(index,{taxable:event.target.checked})}/> Taxable</label></div></article>)}</div>
      <div className="modal-actions"><span className="form-message">{message}</span><button onClick={()=>setForm(null)}>Cancel</button><button className="primary" disabled={!form.name.trim()||!form.startDate||!form.items.length||form.items.some((item)=>!item.serviceName.trim()||!item.billingStart||item.quantity<=0||item.unitRate<0)} onClick={save}>Save contract</button></div>
    </>}
    {!form&&message?<div className="contract-message">{message}</div>:null}
  </section></div>;
}
