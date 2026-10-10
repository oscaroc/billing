export type InvoiceLineInput={description:string;quantity:number;rate:number};

// Where customers mail cheques. Server-side config, never taken from the
// request body: a client must not be able to redirect payment.
export function remitToAddress(){return (process.env.REMIT_TO_ADDRESS||"").trim().slice(0,500);}

export function validateInvoice(body:Record<string,unknown>) {
  const lines=Array.isArray(body.lines) ? body.lines.map((raw)=>({description:String(raw?.description || "").trim(),quantity:Number(raw?.quantity),rate:Number(raw?.rate)})) : [];
  const discount=Number(body.discount || 0); const taxRate=Number(body.taxRate || 0);
  if (!String(body.customer || "").trim() || !String(body.billingEmail || "").includes("@") || !String(body.billingAddress || "").trim()) throw new Error("Customer, billing email, and address are required");
  if (!lines.length || lines.length>100 || lines.some((line)=>!line.description || !Number.isFinite(line.quantity) || line.quantity<=0 || !Number.isFinite(line.rate) || line.rate<0)) throw new Error("Invoice line items are invalid");
  if (!Number.isFinite(discount) || discount<0 || !Number.isFinite(taxRate) || taxRate<0 || taxRate>100) throw new Error("Discount or tax rate is invalid");
  const subtotal=round(lines.reduce((sum,line)=>sum+line.quantity*line.rate,0));
  if (discount>subtotal) throw new Error("Discount cannot exceed subtotal");
  const taxable=round(subtotal-discount); const tax=round(taxable*(taxRate/100)); const total=round(taxable+tax);
  const issueDate=validDate(body.issueDate); const dueDate=validDate(body.dueDate);
  if (dueDate<issueDate) throw new Error("Due date cannot precede issue date");
  const currency=String(body.currency || "USD").toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency is invalid");
  const contractId=typeof body.contractId==="string"?body.contractId:undefined;
  const contractItemIds=Array.isArray(body.contractItemIds)?body.contractItemIds.filter((id):id is string=>typeof id==="string"):[];
  return {...body,customer:String(body.customer).trim(),billingEmail:String(body.billingEmail).trim(),billingAddress:String(body.billingAddress).trim(),lines,discount,taxRate,subtotal,tax,total,issueDate,dueDate,currency,contractId,contractItemIds};
}

function validDate(value:unknown){const text=String(value || "");if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(`${text}T00:00:00Z`)))throw new Error("Invoice dates are invalid");return text;}
function round(value:number){return Math.round((value+Number.EPSILON)*100)/100;}
