"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ContractManager, { type BillingContract, type ContractItem } from "./components/ContractManager";
import BillingGuide from "./components/BillingGuide";

type Invoice = {
  number: string;
  customer: string;
  initials: string;
  color: string;
  issue: string;
  due: string;
  amount: number;
  balance: number;
  currency: string;
  status: "Draft" | "Issued" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Voided";
};

type LineItem = { id: number; description: string; quantity: number; rate: number };
type Customer = {
  id: string;
  legalName: string;
  contactName: string;
  email: string;
  address: string;
  taxId: string;
  currency: string;
  tenant: string;
  renewalDate: string;
  status: "Active" | "Inactive";
};
type GeneratedInvoice = {
  invoice: Invoice;
  billingEmail: string;
  billingAddress: string;
  taxId: string;
  terms: string;
  lines: LineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  notes: string;
};

type Dashboard = {
  monetaryByCurrency: {currency:string;outstanding:number;overdue:number;collected:number}[];
  openInvoices: number;
  overdueInvoices: number;
  paymentCount: number;
  activeCustomers: number;
  overdueItems: { number:string; customer:string; dueDate:string; balance:number; currency:string;daysOverdue:number }[];
  renewals: { customer:string; renewalDate:string }[];
  generatedAt: string;
};

const emptyCustomer = (): Customer => ({ id: "", legalName: "", contactName: "", email: "", address: "", taxId: "", currency: "USD", tenant: "", renewalDate: "", status: "Active" });

const money = (value: number,currency="USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const currencyTotals=(rows:Dashboard["monetaryByCurrency"]|undefined,key:"outstanding"|"overdue"|"collected")=>rows?.filter((row)=>row[key]!==0).map((row)=>money(row[key],row.currency)).join(" + ")||money(0);

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All invoices");
  const [showComposer, setShowComposer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [activePage, setActivePage] = useState<"overview" | "invoices" | "customers" | "guide">("overview");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [toast, setToast] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({name:"Billing user",email:"",initials:"BU",authenticated:false});
  const [customerForm, setCustomerForm] = useState<Customer>(emptyCustomer());
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMenu, setCustomerMenu] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [contractCustomer, setContractCustomer] = useState<Customer | null>(null);
  const [sourceContract, setSourceContract] = useState<{id:string;itemIds:string[]}|null>(null);
  const [customer, setCustomer] = useState("Northstar Health");
  const [billingEmail, setBillingEmail] = useState("billing@northstarhealth.com");
  const [billingAddress, setBillingAddress] = useState("2400 Market Street\nSan Francisco, CA 94114\nUnited States");
  const [taxId, setTaxId] = useState("US-94-3812057");
  const [terms, setTerms] = useState("Net 30");
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [invoiceCurrency,setInvoiceCurrency]=useState("USD");
  const [notes, setNotes] = useState("Thank you for your business. Please reference the invoice number with payment.");
  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, description: "Nivora Scale — Monthly", quantity: 1, rate: 12400 },
  ]);
  const [generated, setGenerated] = useState<GeneratedInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [editingIssueDate, setEditingIssueDate] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [invoiceMenu, setInvoiceMenu] = useState<string | null>(null);
  const [pendingInvoiceRemoval, setPendingInvoiceRemoval] = useState<Invoice | null>(null);
  const [invoiceRemovalReason,setInvoiceRemovalReason]=useState("");
  const [paymentInvoice, setPaymentInvoice] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0,10));
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReference, setPaymentReference] = useState("");

  const loadData = async () => {
    const [customerResponse, invoiceResponse, dashboardResponse, userResponse] = await Promise.all([fetch("/api/customers",{cache:"no-store"}), fetch("/api/invoices",{cache:"no-store"}), fetch("/api/dashboard",{cache:"no-store"}),fetch("/api/me",{cache:"no-store"})]);
    if (!customerResponse.ok || !invoiceResponse.ok || !dashboardResponse.ok) throw new Error("Database connection unavailable");
    const customerRows: Customer[] = await customerResponse.json();
    const invoiceRows = await invoiceResponse.json();
    const mappedInvoices: Invoice[] = invoiceRows.map((row: { InvoiceNumber:string; CustomerName:string; IssueDate:string; DueDate:string; Amount:number; Balance:number; Status:Invoice["status"];Currency:string }) => ({ number:row.InvoiceNumber, customer:row.CustomerName, initials:row.CustomerName.split(" ").map((part) => part[0]).join("").slice(0,2), color:"coral", issue:new Date(row.IssueDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), due:new Date(row.DueDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), amount:Number(row.Amount), balance:Number(row.Balance), status:row.Status,currency:row.Currency||"USD" }));
    setCustomers(customerRows); setInvoices(mappedInvoices); setDashboard(await dashboardResponse.json()); if (userResponse.ok) setUser(await userResponse.json());
    if (customerRows.length && !customerRows.some((item) => item.legalName === customer)) { const first=customerRows[0]; setCustomer(first.legalName); setBillingEmail(first.email); setBillingAddress(first.address); setTaxId(first.taxId); }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch(() => setToast("Database connection unavailable")).finally(() => setLoading(false));
    // Initial production data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const matchesQuery = `${invoice.number} ${invoice.customer}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === "All invoices" || invoice.status === filter);
  }), [filter, invoices, query]);
  const filteredCustomers = useMemo(() => customers.filter((record) => `${record.legalName} ${record.contactName} ${record.email} ${record.tenant}`.toLowerCase().includes(customerQuery.toLowerCase())), [customerQuery, customers]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const selectCustomer = (name: string) => {
    setCustomer(name);
    const record = customers.find((item) => item.legalName === name);
    if (record) {
      setBillingEmail(record.email); setBillingAddress(record.address); setTaxId(record.taxId);setInvoiceCurrency(record.currency);
    }
  };

  const startCustomer = (record?: Customer) => {
    setCustomerForm(record ? { ...record } : emptyCustomer());
    setShowCustomerForm(true);
  };

  const setCustomerField = <K extends keyof Customer>(field: K, value: Customer[K]) => setCustomerForm((current) => ({ ...current, [field]: value }));

  const saveCustomer = async () => {
    const editing = Boolean(customerForm.id);
    const record = { ...customerForm, id: customerForm.id || `cus-${Date.now()}` };
    const response = await fetch(editing ? `/api/customers/${record.id}` : "/api/customers", { method: editing ? "PUT" : "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(record) });
    if (!response.ok) { notify("Customer could not be saved"); return; }
    const saved = await response.json();
    setCustomers((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
    setShowCustomerForm(false);
    setCustomer(record.legalName); setBillingEmail(record.email); setBillingAddress(record.address); setTaxId(record.taxId);
    notify(editing ? "Customer updated" : "Customer created");
  };

  const deleteCustomer = async (record: Customer) => {
    if (invoices.some((invoice) => invoice.customer === record.legalName)) { setPendingDelete(null); notify("Customer has invoices and cannot be deleted"); return; }
    const response = await fetch(`/api/customers/${record.id}`, { method:"DELETE" });
    if (!response.ok) { setPendingDelete(null); notify("Customer could not be deleted"); return; }
    setCustomers((current) => current.filter((item) => item.id !== record.id));
    setPendingDelete(null); setCustomerMenu(null);
    notify("Customer deleted");
  };

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * (taxRate / 100);
  const invoiceTotal = discountedSubtotal + tax;

  const updateLine = (id: number, field: keyof LineItem, value: string | number) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  };

  const startNewInvoice = () => {
    setSourceContract(null); setEditingInvoice(null); setEditingIssueDate(""); setEditingDueDate(""); setLines([{id:Date.now(),description:"Nivora Scale — Monthly",quantity:1,rate:12400}]); setDiscount(0); setTaxRate(0);
    if (customers.length) selectCustomer(customers[0].legalName);
    setShowComposer(true);
  };

  const invoiceContract = (contract:BillingContract, items:ContractItem[]) => {
    const record=contractCustomer; if(!record||!contract.id)return;
    selectCustomer(record.legalName); setInvoiceCurrency(record.currency); setTerms(contract.terms);
    setLines(items.map((item,index)=>({id:Date.now()+index,description:item.description?`${item.serviceName} — ${item.description}`:item.serviceName,quantity:item.quantity,rate:Math.max(0,item.unitRate-(item.discount/item.quantity))})));
    setSourceContract({id:contract.id,itemIds:items.flatMap((item)=>item.id?[item.id]:[])}); setDiscount(0); setTaxRate(0); setContractCustomer(null); setShowComposer(true);
  };

  const editInvoice = async (invoice: Invoice) => {
    setInvoiceMenu(null);
    const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.number)}`);
    if (!response.ok) { notify("Invoice could not be opened"); return; }
    const record=await response.json(); const payload=record.payload;
    if (!payload) { notify("This invoice has no editable detail"); return; }
    setEditingInvoice(invoice.number); setEditingIssueDate(payload.issueDate || ""); setEditingDueDate(payload.dueDate || ""); setCustomer(payload.customer); setBillingEmail(payload.billingEmail || ""); setBillingAddress(payload.billingAddress || ""); setTaxId(payload.taxId || ""); setTerms(payload.terms || "Net 30");setInvoiceCurrency(payload.currency||invoice.currency||"USD"); setLines((payload.lines || []).map((line:LineItem,index:number)=>({...line,id:line.id || Date.now()+index}))); setDiscount(Number(payload.discount || 0)); setTaxRate(Number(payload.taxRate || 0)); setNotes(payload.notes || ""); setShowComposer(true);
  };

  const removeInvoice = async (invoice: Invoice) => {
    const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.number)}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:invoiceRemovalReason})}); const result=await response.json().catch(()=>({}));
    if (!response.ok) { setPendingInvoiceRemoval(null); notify(result.error || "Invoice could not be removed"); return; }
    setPendingInvoiceRemoval(null);setInvoiceRemovalReason(""); setInvoiceMenu(null); await loadData(); notify(result.action === "deleted" ? "Draft invoice deleted" : "Invoice voided");
  };

  const changeInvoiceStatus=async(invoice:Invoice,action:"issue"|"mark-sent")=>{setInvoiceMenu(null);const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.number)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});const result=await response.json().catch(()=>({}));if(!response.ok){notify(result.error||"Invoice status could not be changed");return;}await loadData();notify(action==="issue"?"Invoice issued":"Invoice marked as sent");};

  const viewInvoice=async(invoice:Invoice)=>{setInvoiceMenu(null);const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.number)}`);if(!response.ok){notify("Invoice could not be opened");return;}const record=await response.json();const payload=record.payload;if(!payload){notify("Invoice detail is unavailable");return;}setGenerated({invoice,billingEmail:payload.billingEmail||"",billingAddress:payload.billingAddress||"",taxId:payload.taxId||"",terms:payload.terms||"",lines:payload.lines||[],subtotal:Number(payload.subtotal||0),discount:Number(payload.discount||0),taxRate:Number(payload.taxRate||0),tax:Number(payload.tax||0),total:Number(payload.total||invoice.amount),notes:payload.notes||""});setShowInvoice(true);};

  const createInvoice = async () => {
    const issueDate = editingIssueDate ? new Date(`${editingIssueDate}T00:00:00`) : new Date(); const due = editingDueDate ? new Date(`${editingDueDate}T00:00:00`) : new Date(issueDate); if (!editingDueDate) due.setDate(due.getDate() + (terms === "Net 15" ? 15 : terms === "Due on receipt" ? 0 : 30));
    const dueDate = due.toISOString().slice(0,10);
    const payload={ customer, billingEmail, billingAddress, taxId, terms, currency:invoiceCurrency,lines, subtotal, discount, taxRate, tax, total:invoiceTotal, notes, issueDate:issueDate.toISOString().slice(0,10), dueDate, contractId:sourceContract?.id, contractItemIds:sourceContract?.itemIds };
    const response = await fetch(editingInvoice ? `/api/invoices/${encodeURIComponent(editingInvoice)}` : "/api/invoices", { method:editingInvoice ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    if (!response.ok) { notify("Invoice could not be generated"); return; }
    const { number } = await response.json();
    const invoice: Invoice = { number, customer, initials: customer.split(" ").map((part) => part[0]).join("").slice(0, 2), color: "coral", issue: issueDate.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), due: due.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), amount: invoiceTotal, balance: invoiceTotal, status: "Draft",currency:invoiceCurrency };
    const fullInvoice = { invoice, billingEmail, billingAddress, taxId, terms, lines: lines.map((line) => ({ ...line })), subtotal, discount, taxRate, tax, total: invoiceTotal, notes };
    setInvoices((current)=>editingInvoice ? current.map((item)=>item.number===number ? invoice : item) : [invoice,...current]);
    setGenerated(fullInvoice);
    setShowComposer(false);
    setShowInvoice(true);
    notify(editingInvoice ? `${invoice.number} updated` : `${invoice.number} generated`);
    setEditingInvoice(null); setSourceContract(null);
    loadData().catch(() => notify("Dashboard refresh failed"));
  };

  const openPayment = () => {
    const open = invoices.find((invoice) => invoice.balance > 0);
    setPaymentInvoice(open?.number || ""); setPaymentAmount(open?.balance || 0); setPaymentReference(""); setShowPayment(true);
  };

  const selectPaymentInvoice = (number: string) => {
    setPaymentInvoice(number); setPaymentAmount(invoices.find((invoice) => invoice.number === number)?.balance || 0);
  };

  const recordPayment = async () => {
    const response = await fetch("/api/payments",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({invoiceNumber:paymentInvoice,amount:paymentAmount,paymentDate,method:paymentMethod,reference:paymentReference})});
    if (!response.ok) { const result=await response.json().catch(()=>({})); notify(result.error || "Payment could not be recorded"); return; }
    setShowPayment(false); await loadData(); notify("Payment recorded and dashboard updated");
  };

  const downloadPdf = async () => {
    if (!generated) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const { invoice } = generated;
    doc.setFillColor(22, 63, 53); doc.rect(0, 0, 612, 105, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(23); doc.text("NIVORA", 48, 54);
    doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.text("Accounts receivable", 48, 75);
    doc.setFontSize(27); doc.setFont("helvetica", "bold"); doc.text("INVOICE", 564, 54, { align: "right" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(invoice.number, 564, 75, { align: "right" });
    doc.setTextColor(24, 33, 30); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("BILL TO", 48, 142);
    doc.setFontSize(13); doc.text(invoice.customer, 48, 163); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(generated.billingAddress.split("\n"), 48, 180); doc.text(generated.billingEmail, 48, 224); doc.text(`Tax ID: ${generated.taxId || "—"}`, 48, 239);
    doc.setFont("helvetica", "bold"); doc.text("ISSUE DATE", 350, 142); doc.text("DUE DATE", 460, 142); doc.text("TERMS", 350, 188); doc.text("CURRENCY", 460, 188);
    doc.setFont("helvetica", "normal"); doc.text(invoice.issue, 350, 160); doc.text(invoice.due, 460, 160); doc.text(generated.terms, 350, 206); doc.text(invoice.currency, 460, 206);
    let y = 278; doc.setFillColor(242, 246, 244); doc.rect(48, y, 516, 28, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("DESCRIPTION", 60, y + 18); doc.text("QTY", 390, y + 18, { align: "right" }); doc.text("RATE", 475, y + 18, { align: "right" }); doc.text("AMOUNT", 552, y + 18, { align: "right" }); y += 50;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    generated.lines.forEach((line) => { doc.text(line.description, 60, y); doc.text(String(line.quantity), 390, y, { align: "right" }); doc.text(money(line.rate,invoice.currency), 475, y, { align: "right" }); doc.text(money(line.quantity * line.rate,invoice.currency), 552, y, { align: "right" }); doc.setDrawColor(232, 235, 232); doc.line(48, y + 13, 564, y + 13); y += 32; });
    y = Math.max(y + 15, 430); const labelX = 405; doc.text("Subtotal", labelX, y); doc.text(money(generated.subtotal,invoice.currency), 552, y, { align: "right" });
    if (generated.discount > 0) { y += 22; doc.text("Discount", labelX, y); doc.text(`-${money(generated.discount,invoice.currency)}`, 552, y, { align: "right" }); }
    y += 22; doc.text(`Tax (${generated.taxRate}%)`, labelX, y); doc.text(money(generated.tax,invoice.currency), 552, y, { align: "right" }); y += 18;
    doc.setDrawColor(22, 63, 53); doc.line(395, y, 564, y); y += 25; doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Total", labelX, y); doc.text(money(generated.total,invoice.currency), 552, y, { align: "right" });
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("NOTES", 48, 650); doc.setFont("helvetica", "normal"); doc.setTextColor(92, 102, 97); doc.text(doc.splitTextToSize(generated.notes, 330), 48, 667);
    doc.setFillColor(22, 63, 53); doc.rect(0, 748, 612, 44, "F"); doc.setTextColor(255, 255, 255); doc.text("Nivora · billing@nivora.com · nivora.com", 306, 773, { align: "center" });
    doc.save(`${invoice.number}.pdf`);
    notify("PDF downloaded");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Image className="brand-logo" src="/nivora-logo.webp" width={1256} height={262} alt="Nivora" /></div>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <button className={`nav-item nav-button ${activePage === "overview" ? "active" : ""}`} onClick={() => { setActivePage("overview"); setShowCustomerForm(false); }}><span>⌂</span> Overview</button>
          <button className={`nav-item nav-button ${activePage === "invoices" ? "active" : ""}`} onClick={() => { setActivePage("invoices"); setShowCustomerForm(false); }}><span>▤</span> Invoices <b>{invoices.length}</b></button>
          <button className={`nav-item nav-button ${activePage === "customers" ? "active" : ""}`} onClick={() => { setActivePage("customers"); setShowCustomerForm(false); }}><span>♙</span> Customers <b>{customers.length}</b></button>
        </nav>
        <div className="sidebar-foot">
          <button className={`help-card ${activePage === "guide" ? "active" : ""}`} onClick={() => { setActivePage("guide"); setShowCustomerForm(false); }}><span>?</span><div><strong>Need a hand?</strong><small>Visit the billing guide</small></div><b>→</b></button>
          <div className="account"><span className="avatar">{user.initials}</span><div><strong>{user.name}</strong><small>{user.email || "Billing admin"}</small></div><a className="account-signout" href="/.auth/logout" aria-label="Sign out">↗</a></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoices, customers..." /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><button className="primary" onClick={startNewInvoice}><span>＋</span> New invoice</button></div>
        </header>

        {activePage === "overview" ? <div className="content" id="overview">
          <section className="title-row">
            <div><p className="eyebrow">Accounts receivable</p><h1>Billing overview</h1><p>Live receivables, collections, and customer activity from Azure SQL.</p></div>
            <div className="date-chip"><span>◫</span> {new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
          </section>

          <section className="metrics" aria-label="Receivables summary">
            <article className="metric featured"><div className="metric-head"><span>Outstanding</span><i className="live-indicator">● Live</i></div><strong>{loading ? "—" : currencyTotals(dashboard?.monetaryByCurrency,"outstanding")}</strong><small>Across {dashboard?.openInvoices || 0} open invoices</small><div className="mini-bars" aria-hidden="true">{[18,22,15,29,26,35,31,44,38,54,48,62].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></article>
            <article className="metric"><div className="metric-head"><span>Overdue</span><i className={(dashboard?.overdueInvoices || 0) > 0 ? "trend down" : "trend up"}>{(dashboard?.overdueInvoices || 0) > 0 ? "Needs attention" : "All current"}</i></div><strong>{loading ? "—" : currencyTotals(dashboard?.monetaryByCurrency,"overdue")}</strong><small>{dashboard?.overdueInvoices || 0} overdue invoices</small></article>
            <article className="metric"><div className="metric-head"><span>Collected this month</span><i className="live-indicator">● Posted</i></div><strong>{loading ? "—" : currencyTotals(dashboard?.monetaryByCurrency,"collected")}</strong><small>{dashboard?.paymentCount || 0} payments received</small></article>
            <article className="metric"><div className="metric-head"><span>Active customers</span><i className="live-indicator">● Synced</i></div><strong>{loading ? "—" : dashboard?.activeCustomers || 0}</strong><small>Billing accounts in good standing</small><div className="avatars">{customers.slice(0,4).map((item)=><span key={item.id}>{item.legalName.split(" ").map((part)=>part[0]).join("").slice(0,2)}</span>)}</div></article>
          </section>

          <section className="main-grid">
            <article className="panel invoices-panel" id="invoices">
              <div className="panel-head"><div><h2>Recent invoices</h2><p>Keep an eye on what’s due and what’s paid.</p></div><button className="text-button" onClick={() => { setFilter("All invoices"); setQuery(""); }}>View all <span>→</span></button></div>
              <div className="table-tools"><div className="tabs">{["All invoices", "Sent", "Overdue", "Paid"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "Overdue" && (dashboard?.overdueInvoices || 0) > 0 && <i>{dashboard?.overdueInvoices}</i>}</button>)}</div></div>
              <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
                {filtered.map((invoice) => <tr key={invoice.number}><td><strong>{invoice.number}</strong><small>Issued {invoice.issue}</small></td><td><div className="customer"><span className={`customer-avatar ${invoice.color}`}>{invoice.initials}</span>{invoice.customer}</div></td><td>{invoice.due}</td><td><strong>{money(invoice.amount,invoice.currency)}</strong>{invoice.balance !== invoice.amount && invoice.balance > 0 && <small>{money(invoice.balance,invoice.currency)} due</small>}</td><td><span className={`status ${invoice.status.toLowerCase().replace(" ", "-")}`}><i />{invoice.status}</span></td><td><div className="invoice-actions"><button className="more" aria-label={`Actions for ${invoice.number}`} aria-expanded={invoiceMenu===invoice.number} onClick={()=>setInvoiceMenu((current)=>current===invoice.number ? null : invoice.number)}>•••</button>{invoiceMenu===invoice.number && <div className="invoice-menu"><button onClick={()=>viewInvoice(invoice)}>View invoice</button>{invoice.status==="Draft" && <><button onClick={()=>editInvoice(invoice)}>Edit invoice</button><button onClick={()=>changeInvoiceStatus(invoice,"issue")}>Issue invoice</button></>}{invoice.status==="Issued" && <button onClick={()=>changeInvoiceStatus(invoice,"mark-sent")}>Mark as sent</button>}<button className="danger" disabled={invoice.status==="Paid" || invoice.status==="Voided"} onClick={()=>{setInvoiceMenu(null);setInvoiceRemovalReason("");setPendingInvoiceRemoval(invoice);}}>{invoice.status==="Draft" ? "Delete draft" : "Void invoice"}</button></div>}</div></td></tr>)}
                {!filtered.length && <tr><td colSpan={6} className="empty">No invoices match your search.</td></tr>}
              </tbody></table></div>
            </article>

            <aside className="right-column">
              <article className="panel attention"><div className="panel-head"><div><h2>Needs attention</h2><p>Live exceptions and renewals.</p></div><span className="count">{(dashboard?.overdueItems.length || 0)+(dashboard?.renewals.length || 0)}</span></div>
                {dashboard?.overdueItems.map((item)=><div className="attention-item" key={item.number}><span className="attention-icon coral-bg">!</span><div><strong>{item.customer}</strong><p>{item.number} · {item.daysOverdue} days overdue · {money(item.balance,item.currency)}</p></div><button onClick={() => notify(`Reminder prepared for ${item.customer}`)}>Remind</button></div>)}
                {dashboard?.renewals.map((item)=><div className="attention-item" key={item.customer}><span className="attention-icon amber-bg">◷</span><div><strong>{item.customer}</strong><p>Renews {new Date(item.renewalDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p></div><button onClick={() => { setActivePage("customers"); setCustomerQuery(item.customer); }}>Review</button></div>)}
                {!loading && !dashboard?.overdueItems.length && !dashboard?.renewals.length && <div className="attention-empty"><span>✓</span><strong>Everything is current</strong><p>No overdue invoices or upcoming renewals.</p></div>}
              </article>
              <article className="panel quick"><div className="panel-head"><div><h2>Quick actions</h2><p>The things you do most.</p></div></div><div className="quick-grid"><button onClick={startNewInvoice}><span>＋</span><strong>New invoice</strong><small>Bill a customer</small></button><button onClick={() => { setActivePage("customers"); startCustomer(); }}><span>♙</span><strong>Add customer</strong><small>Create a profile</small></button><button disabled={!invoices.some((invoice)=>invoice.balance>0)} onClick={openPayment}><span>◇</span><strong>Record payment</strong><small>Apply funds</small></button><button onClick={() => window.print()}><span>⌁</span><strong>Export report</strong><small>Print live summary</small></button></div></article>
            </aside>
          </section>
        </div> : activePage === "invoices" ? <div className="content invoices-page" id="invoices-page">
          <section className="title-row invoices-page-head"><div><p className="eyebrow">Accounts receivable</p><h1>Invoices</h1><p>{invoices.length} invoice{invoices.length === 1 ? "" : "s"} across all billing accounts</p></div><button className="primary" onClick={startNewInvoice}>＋ New invoice</button></section>
          <section className="panel invoices-page-panel" aria-label="Invoices">
            <div className="invoice-page-tools"><div className="tabs">{["All invoices", "Draft", "Issued", "Sent", "Overdue", "Paid"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "Overdue" && (dashboard?.overdueInvoices || 0) > 0 && <i>{dashboard?.overdueInvoices}</i>}</button>)}</div></div>
            <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
              {filtered.map((invoice) => <tr key={invoice.number}><td><strong>{invoice.number}</strong><small>Issued {invoice.issue}</small></td><td><div className="customer"><span className={`customer-avatar ${invoice.color}`}>{invoice.initials}</span>{invoice.customer}</div></td><td>{invoice.due}</td><td><strong>{money(invoice.amount,invoice.currency)}</strong>{invoice.balance !== invoice.amount && invoice.balance > 0 && <small>{money(invoice.balance,invoice.currency)} due</small>}</td><td><span className={`status ${invoice.status.toLowerCase().replace(" ", "-")}`}><i />{invoice.status}</span></td><td><div className="invoice-actions"><button className="more" aria-label={`Actions for ${invoice.number}`} aria-expanded={invoiceMenu===invoice.number} onClick={()=>setInvoiceMenu((current)=>current===invoice.number ? null : invoice.number)}>•••</button>{invoiceMenu===invoice.number && <div className="invoice-menu"><button onClick={()=>viewInvoice(invoice)}>View invoice</button>{invoice.status==="Draft" && <><button onClick={()=>editInvoice(invoice)}>Edit invoice</button><button onClick={()=>changeInvoiceStatus(invoice,"issue")}>Issue invoice</button></>}{invoice.status==="Issued" && <button onClick={()=>changeInvoiceStatus(invoice,"mark-sent")}>Mark as sent</button>}<button className="danger" disabled={invoice.status==="Paid" || invoice.status==="Voided"} onClick={()=>{setInvoiceMenu(null);setInvoiceRemovalReason("");setPendingInvoiceRemoval(invoice);}}>{invoice.status==="Draft" ? "Delete draft" : "Void invoice"}</button></div>}</div></td></tr>)}
              {!filtered.length && <tr><td colSpan={6} className="empty">No invoices match your search and filter.</td></tr>}
            </tbody></table></div>
          </section>
        </div> : activePage === "customers" ? <div className="content customers-page" id="customers">
          {!showCustomerForm ? <>
            <section className="title-row customers-page-head"><div><p className="eyebrow">Billing directory</p><h1>Customers</h1><p>{customers.filter((item) => item.status === "Active").length} active customer accounts</p></div><button className="primary customer-add" onClick={() => startCustomer()}>＋ Add customer</button></section>
            <label className="customer-search"><span>⌕</span><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search customers..." /></label>
            <section className="customer-list customer-page-list" aria-label="Customers"><div className="customer-list-head"><span>Customer</span><span>Contact</span><span>Renewal</span><span>Status</span><span></span></div>{filteredCustomers.map((record) => <div className="customer-record" key={record.id}><div><span className="customer-avatar mint">{record.legalName.split(" ").map((part) => part[0]).join("").slice(0,2)}</span><p><strong>{record.legalName}</strong><small>{record.tenant || "No tenant assigned"}</small></p></div><div><strong>{record.contactName || "—"}</strong><small>{record.email}</small></div><span>{record.renewalDate ? new Date(`${record.renewalDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span><span className={`customer-status ${record.status.toLowerCase()}`}>{record.status}</span><div className="customer-actions"><button className="kebab" aria-label={`Actions for ${record.legalName}`} aria-expanded={customerMenu === record.id} onClick={() => setCustomerMenu((current) => current === record.id ? null : record.id)}>•••</button>{customerMenu === record.id && <div className="customer-menu"><button onClick={() => { setCustomerMenu(null); setContractCustomer(record); }}>Billing contracts</button><button onClick={() => { setCustomerMenu(null); startCustomer(record); }}>Edit customer</button><button className="danger" onClick={() => { setCustomerMenu(null); setPendingDelete(record); }}>Delete customer</button></div>}</div></div>)}{!filteredCustomers.length && <div className="customer-empty">No customers match your search.</div>}</section>
          </> : <section className="customer-editor" aria-labelledby="customers-title">
            <div className="customer-editor-head"><div><p className="eyebrow">Customer account</p><h1 id="customers-title">{customerForm.id ? "Edit customer" : "Add customer"}</h1></div><button onClick={() => setShowCustomerForm(false)}>← Back to customers</button></div>
            <div className="customer-form-section"><h3>Company information</h3><div className="form-grid"><label>Legal company name *<input autoFocus value={customerForm.legalName} onChange={(event) => setCustomerField("legalName", event.target.value)} /></label><label>Tax ID / EIN<input value={customerForm.taxId} onChange={(event) => setCustomerField("taxId", event.target.value)} /></label><label>Billing contact<input value={customerForm.contactName} onChange={(event) => setCustomerField("contactName", event.target.value)} /></label><label>Billing email *<input type="email" value={customerForm.email} onChange={(event) => setCustomerField("email", event.target.value)} /></label><label className="full">Billing address *<textarea value={customerForm.address} onChange={(event) => setCustomerField("address", event.target.value)} placeholder="Street address, city, region, postal code, country" /></label></div></div>
            <div className="customer-form-section"><h3>Billing settings</h3><div className="form-grid three"><label>Currency<select value={customerForm.currency} onChange={(event) => setCustomerField("currency", event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option></select></label><label>Status<select value={customerForm.status} onChange={(event) => setCustomerField("status", event.target.value as Customer["status"])}><option>Active</option><option>Inactive</option></select></label><label>Nivora tenant / Azure subscription<input value={customerForm.tenant} onChange={(event) => setCustomerField("tenant", event.target.value)} /></label></div>{customerForm.id && <div className="customer-contract-link"><div><strong>Billing contracts</strong><p>Manage payment terms, projects, recurring services, dates, and scheduled charges.</p></div><button onClick={() => setContractCustomer(customerForm)}>Manage contracts</button></div>}</div>
            <div className="customer-page-actions"><button onClick={() => setShowCustomerForm(false)}>Cancel</button><button className="primary" disabled={!customerForm.legalName.trim() || !customerForm.email.trim() || !customerForm.address.trim()} onClick={saveCustomer}>{customerForm.id ? "Save changes" : "Create customer"}</button></div>
          </section>}
        </div> : <BillingGuide onOpenCustomers={() => { setActivePage("customers"); setShowCustomerForm(false); }} onOpenInvoices={() => setActivePage("invoices")} onNewInvoice={startNewInvoice} />}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={activePage === "overview" ? "active" : ""} onClick={() => { setActivePage("overview"); setShowCustomerForm(false); }}><span>⌂</span>Overview</button>
        <button className={activePage === "invoices" ? "active" : ""} onClick={() => { setActivePage("invoices"); setShowCustomerForm(false); }}><span>▤</span>Invoices</button>
        <button className={activePage === "customers" ? "active" : ""} onClick={() => { setActivePage("customers"); setShowCustomerForm(false); }}><span>♙</span>Customers</button>
        <button className={activePage === "guide" ? "active" : ""} onClick={() => { setActivePage("guide"); setShowCustomerForm(false); }}><span>?</span>Guide</button>
      </nav>
      {contractCustomer && <ContractManager customer={contractCustomer} onClose={()=>{setContractCustomer(null);loadData().catch(()=>notify("Customer renewal refresh failed"));}} onInvoice={invoiceContract}/>} 
      {pendingDelete && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={() => setPendingDelete(null)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}><span className="danger-icon">!</span><h2 id="delete-title">Delete {pendingDelete.legalName}?</h2><p>This permanently removes the customer record. Customers with invoices cannot be deleted.</p><div><button onClick={() => setPendingDelete(null)}>Cancel</button><button className="danger-button" onClick={() => deleteCustomer(pendingDelete)}>Delete customer</button></div></section></div>}
      {pendingInvoiceRemoval && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={()=>setPendingInvoiceRemoval(null)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="invoice-remove-title" onMouseDown={(event)=>event.stopPropagation()}><span className="danger-icon">!</span><h2 id="invoice-remove-title">{pendingInvoiceRemoval.status==="Draft" ? "Delete" : "Void"} {pendingInvoiceRemoval.number}?</h2><p>{pendingInvoiceRemoval.status==="Draft" ? "This permanently removes the draft invoice." : "This keeps the audit record but sets its balance to zero."}</p>{pendingInvoiceRemoval.status!=="Draft"&&<input aria-label="Void reason" placeholder="Reason for voiding" value={invoiceRemovalReason} onChange={(event)=>setInvoiceRemovalReason(event.target.value)}/>}<div><button onClick={()=>setPendingInvoiceRemoval(null)}>Cancel</button><button className="danger-button" disabled={pendingInvoiceRemoval.status!=="Draft"&&!invoiceRemovalReason.trim()} onClick={()=>removeInvoice(pendingInvoiceRemoval)}>{pendingInvoiceRemoval.status==="Draft" ? "Delete draft" : "Void invoice"}</button></div></section></div>}
      {showComposer && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowComposer(false)}>
        <section className="modal invoice-composer" role="dialog" aria-modal="true" aria-labelledby="invoice-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><div><p className="eyebrow">{editingInvoice ? "Draft invoice" : "New receivable"}</p><h2 id="invoice-title">{editingInvoice ? `Edit ${editingInvoice}` : "Generate invoice"}</h2></div><button onClick={() => {setShowComposer(false);setEditingInvoice(null);}} aria-label="Close">×</button></div>
          <div className="invoice-step"><span>1</span><div><strong>Customer & terms</strong><small>Who you’re billing and when it’s due</small></div></div>
          <div className="form-grid">
            <label>Customer<select value={customer} onChange={(event) => selectCustomer(event.target.value)}>{customers.filter((item) => item.status === "Active").map((item) => <option key={item.id}>{item.legalName}</option>)}</select></label>
            <label>Billing email<input type="email" value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} /></label>
            <label>Payment terms<select value={terms} onChange={(event) => setTerms(event.target.value)}><option>Net 30</option><option>Net 15</option><option>Due on receipt</option></select></label>
            <label>Currency<select value={invoiceCurrency} onChange={(event)=>setInvoiceCurrency(event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option></select></label>
            <label>Tax ID / EIN<input value={taxId} onChange={(event) => setTaxId(event.target.value)} /></label>
            <label className="full">Billing address<textarea value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} /></label>
          </div>
          <div className="invoice-step"><span>2</span><div><strong>Invoice items</strong><small>Add recurring, implementation, or usage charges</small></div></div>
          <div className="line-card"><div className="line-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
            {lines.map((line) => <div className="line-row" key={line.id}><label><span>Description</span><input value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} /></label><label><span>Quantity</span><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", Number(event.target.value))} /></label><label><span>Rate</span><input type="number" min="0" value={line.rate} onChange={(event) => updateLine(line.id, "rate", Number(event.target.value))} /></label><strong aria-label="Line total">{money(line.quantity * line.rate,invoiceCurrency)}</strong>{lines.length > 1 && <button className="remove-line" aria-label="Remove line" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>×</button>}</div>)}
            <button className="add-line" onClick={() => setLines((current) => [...current, { id: Date.now(), description: "Implementation fee", quantity: 1, rate: 0 }])}>＋ Add line item</button>
          </div>
          <div className="invoice-step"><span>3</span><div><strong>Totals & notes</strong><small>Apply adjustments and review the amount due</small></div></div>
          <div className="adjustments"><label>Discount ($)<input type="number" min="0" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><label>Tax rate (%)<input type="number" min="0" value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value))} /></label></div>
          <div className="notes-total"><label>Customer-facing note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><div><p><span>Subtotal</span><strong>{money(subtotal,invoiceCurrency)}</strong></p>{discount > 0 && <p><span>Discount</span><strong>−{money(discount,invoiceCurrency)}</strong></p>}<p><span>Tax ({taxRate}%)</span><strong>{money(tax,invoiceCurrency)}</strong></p><p className="total"><span>Total due</span><strong>{money(invoiceTotal,invoiceCurrency)}</strong></p></div></div>
          <div className="modal-actions"><button onClick={() => {setShowComposer(false);setEditingInvoice(null);}}>Cancel</button><button className="primary" disabled={!customer || !billingEmail || !lines.length || invoiceTotal <= 0} onClick={createInvoice}>{editingInvoice ? "Save changes" : "Generate invoice"}</button></div>
        </section>
      </div>}
      {showInvoice && generated && <div className="modal-backdrop invoice-preview-backdrop" role="presentation" onMouseDown={() => setShowInvoice(false)}><section className="modal invoice-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}><div className="preview-toolbar"><div><strong id="preview-title">{generated.invoice.number}</strong><small>{generated.invoice.status} · Ready to print</small></div><div><button onClick={() => window.print()}>Print</button><button className="primary" onClick={downloadPdf}>↓ Download PDF</button><button className="close-preview" onClick={() => setShowInvoice(false)}>×</button></div></div><article className="invoice-paper"><header><div className="invoice-brand"><Image src="/nivora-logo.webp" width={1256} height={262} alt="Nivora" /><small>Subscription intelligence</small></div><div><h2>INVOICE</h2><p>{generated.invoice.number}</p></div></header><section className="invoice-parties"><div><small>BILL TO</small><strong>{generated.invoice.customer}</strong><p>{generated.billingAddress.split("\n").map((row) => <span key={row}>{row}<br /></span>)}</p><p>{generated.billingEmail}<br />Tax ID: {generated.taxId || "—"}</p></div><div className="invoice-meta"><p><span>Issue date</span><strong>{generated.invoice.issue}</strong></p><p><span>Due date</span><strong>{generated.invoice.due}</strong></p><p><span>Terms</span><strong>{generated.terms}</strong></p><p><span>Currency</span><strong>{generated.invoice.currency}</strong></p></div></section><table className="invoice-lines"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{generated.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.rate,generated.invoice.currency)}</td><td>{money(line.quantity * line.rate,generated.invoice.currency)}</td></tr>)}</tbody></table><section className="invoice-bottom"><div><small>NOTES</small><p>{generated.notes}</p></div><div><p><span>Subtotal</span><strong>{money(generated.subtotal,generated.invoice.currency)}</strong></p>{generated.discount > 0 && <p><span>Discount</span><strong>−{money(generated.discount,generated.invoice.currency)}</strong></p>}<p><span>Tax ({generated.taxRate}%)</span><strong>{money(generated.tax,generated.invoice.currency)}</strong></p><p className="grand-total"><span>Total due</span><strong>{money(generated.total,generated.invoice.currency)}</strong></p></div></section><footer>Questions? Contact billing@nivora.com · Thank you for your business.</footer></article></section></div>}
      {showPayment && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowPayment(false)}><section className="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Accounts receivable</p><h2 id="payment-title">Record payment</h2></div><button onClick={() => setShowPayment(false)} aria-label="Close">×</button></div><div className="form-grid"><label>Invoice<select value={paymentInvoice} onChange={(event)=>selectPaymentInvoice(event.target.value)}>{invoices.filter((invoice)=>invoice.balance>0).map((invoice)=><option key={invoice.number} value={invoice.number}>{invoice.number} · {invoice.customer} · {money(invoice.balance,invoice.currency)} due</option>)}</select></label><label>Amount<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event)=>setPaymentAmount(Number(event.target.value))} /></label><label>Payment date<input type="date" value={paymentDate} onChange={(event)=>setPaymentDate(event.target.value)} /></label><label>Method<select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value)}><option>Bank transfer</option><option>Credit card</option><option>Check</option></select></label><label className="full">Transaction or check reference<input value={paymentReference} onChange={(event)=>setPaymentReference(event.target.value)} placeholder="e.g. ACH-840193" /></label></div><div className="modal-actions"><button onClick={() => setShowPayment(false)}>Cancel</button><button className="primary" disabled={!paymentInvoice || paymentAmount <= 0 || paymentAmount > (invoices.find((invoice)=>invoice.number===paymentInvoice)?.balance || 0)} onClick={recordPayment}>Record payment</button></div></section></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}
