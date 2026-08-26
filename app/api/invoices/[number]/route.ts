import { validateInvoice } from "@/lib/billing";
import { authorize } from "@/lib/auth";
import { ensureSchema,getPool } from "@/lib/db";
import sql from "mssql";

export const dynamic="force-dynamic";
type Context={params:Promise<{number:string}>};

export async function GET(request:Request,context:Context){
  const auth=authorize(request,["Billing.Admin","Billing.Operator","Billing.Reader"]);if(auth.response)return auth.response;
  try{await ensureSchema();const{number}=await context.params;const result=await(await getPool()).request().input("number",sql.NVarChar(40),number).query("SELECT InvoiceNumber,CustomerName,IssueDate,DueDate,Amount,Balance,Status,Currency,Payload,IssuedAt,SentAt,VoidReason FROM dbo.BillingInvoices WHERE InvoiceNumber=@number; SELECT Position,Description,Quantity,Rate,Amount FROM dbo.BillingInvoiceLines WHERE InvoiceNumber=@number ORDER BY Position");const sets=result.recordsets as unknown as Array<Array<Record<string,unknown>>>;if(!sets[0].length)return Response.json({error:"Invoice not found"},{status:404});const row=sets[0][0];return Response.json({...row,payload:row.Payload?JSON.parse(String(row.Payload)):null,lines:sets[1]});}catch(error){console.error(error);return Response.json({error:"Invoice unavailable"},{status:500});}
}

export async function PUT(request:Request,context:Context){
  const auth=authorize(request,["Billing.Admin","Billing.Operator"]);if(auth.response)return auth.response;
  try{await ensureSchema();const{number}=await context.params;const invoice=validateInvoice(await request.json());const pool=await getPool();const transaction=new sql.Transaction(pool);await transaction.begin();try{
    const existing=await new sql.Request(transaction).input("number",sql.NVarChar(40),number).query("SELECT * FROM dbo.BillingInvoices WITH(UPDLOCK,ROWLOCK) WHERE InvoiceNumber=@number");if(!existing.recordset.length)throw new Error("Invoice not found");if(existing.recordset[0].Status!=="Draft")throw new Error("Only draft invoices can be edited");
    const customer=await new sql.Request(transaction).input("name",sql.NVarChar(240),invoice.customer).query("SELECT TOP 1 Id FROM dbo.BillingCustomers WHERE LegalName=@name AND Status='Active'");if(!customer.recordset.length)throw new Error("Active customer not found");
    await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("customerId",sql.NVarChar(64),customer.recordset[0].Id).input("customer",sql.NVarChar(240),invoice.customer).input("issueDate",sql.Date,invoice.issueDate).input("dueDate",sql.Date,invoice.dueDate).input("amount",sql.Decimal(19,2),invoice.total).input("currency",sql.Char(3),invoice.currency).input("payload",sql.NVarChar(sql.MAX),JSON.stringify(invoice)).query("UPDATE dbo.BillingInvoices SET CustomerId=@customerId,CustomerName=@customer,IssueDate=@issueDate,DueDate=@dueDate,Amount=@amount,Balance=@amount,Currency=@currency,Payload=@payload,UpdatedAt=SYSUTCDATETIME() WHERE InvoiceNumber=@number; DELETE dbo.BillingInvoiceLines WHERE InvoiceNumber=@number");
    for(let position=0;position<invoice.lines.length;position++){const line=invoice.lines[position];await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("position",sql.Int,position+1).input("description",sql.NVarChar(500),line.description).input("quantity",sql.Decimal(19,4),line.quantity).input("rate",sql.Decimal(19,4),line.rate).input("amount",sql.Decimal(19,2),Math.round(line.quantity*line.rate*100)/100).query("INSERT dbo.BillingInvoiceLines(InvoiceNumber,Position,Description,Quantity,Rate,Amount) VALUES(@number,@position,@description,@quantity,@rate,@amount)");}
    await audit(transaction,number,"Updated",auth.principal!,existing.recordset[0],invoice);await transaction.commit();return Response.json({number,total:invoice.total,currency:invoice.currency});
  }catch(error){await transaction.rollback();throw error;}}catch(error){console.error(error);return Response.json({error:error instanceof Error?error.message:"Could not update invoice"},{status:400});}
}

export async function PATCH(request:Request,context:Context){
  const auth=authorize(request,["Billing.Admin","Billing.Operator"]);if(auth.response)return auth.response;
  try{await ensureSchema();const{number}=await context.params;const body=await request.json();const action=String(body.action||"");const pool=await getPool();const transaction=new sql.Transaction(pool);await transaction.begin();try{
    const existing=await new sql.Request(transaction).input("number",sql.NVarChar(40),number).query("SELECT * FROM dbo.BillingInvoices WITH(UPDLOCK,ROWLOCK) WHERE InvoiceNumber=@number");if(!existing.recordset.length)throw new Error("Invoice not found");const status=existing.recordset[0].Status;
    const next=action==="issue"&&status==="Draft"?"Issued":action==="mark-sent"&&["Issued","Sent"].includes(status)?"Sent":null;if(!next)throw new Error("Invalid invoice status transition");
    await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("status",sql.NVarChar(30),next).input("action",sql.NVarChar(30),action).query("UPDATE dbo.BillingInvoices SET Status=@status,IssuedAt=CASE WHEN @action='issue' THEN SYSUTCDATETIME() ELSE IssuedAt END,SentAt=CASE WHEN @action='mark-sent' THEN SYSUTCDATETIME() ELSE SentAt END,UpdatedAt=SYSUTCDATETIME() WHERE InvoiceNumber=@number");
    await audit(transaction,number,next,auth.principal!,existing.recordset[0],{status:next});await transaction.commit();return Response.json({number,status:next});
  }catch(error){await transaction.rollback();throw error;}}catch(error){console.error(error);return Response.json({error:error instanceof Error?error.message:"Could not change invoice status"},{status:409});}
}

export async function DELETE(request:Request,context:Context){
  const auth=authorize(request,["Billing.Admin"]);if(auth.response)return auth.response;
  try{await ensureSchema();const{number}=await context.params;const body=await request.json().catch(()=>({}));const reason=String(body.reason||"").trim();const pool=await getPool();const transaction=new sql.Transaction(pool);await transaction.begin();try{
    const result=await new sql.Request(transaction).input("number",sql.NVarChar(40),number).query("SELECT *,(SELECT COUNT(*) FROM dbo.BillingPayments WHERE InvoiceNumber=@number AND ReversedAt IS NULL) AS PaymentCount FROM dbo.BillingInvoices WITH(UPDLOCK,ROWLOCK) WHERE InvoiceNumber=@number");if(!result.recordset.length)throw new Error("Invoice not found");const row=result.recordset[0];
    if(row.Status==="Draft"&&Number(row.PaymentCount)===0){await audit(transaction,number,"DraftDeleted",auth.principal!,row,null,reason);await new sql.Request(transaction).input("number",sql.NVarChar(40),number).query("DELETE dbo.BillingInvoices WHERE InvoiceNumber=@number");await transaction.commit();return Response.json({action:"deleted"});}
    if(["Paid","Voided"].includes(row.Status))throw new Error(`${row.Status} invoices cannot be voided`);if(!reason)throw new Error("A void reason is required");
    await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("reason",sql.NVarChar(500),reason).query("UPDATE dbo.BillingInvoices SET Status='Voided',Balance=0,VoidReason=@reason,UpdatedAt=SYSUTCDATETIME() WHERE InvoiceNumber=@number");await audit(transaction,number,"Voided",auth.principal!,row,{status:"Voided"},reason);await transaction.commit();return Response.json({action:"voided"});
  }catch(error){await transaction.rollback();throw error;}}catch(error){console.error(error);return Response.json({error:error instanceof Error?error.message:"Could not remove invoice"},{status:409});}
}

async function audit(transaction:sql.Transaction,entityId:string,action:string,principal:{userId:string;email:string},before:unknown,after:unknown,reason=""){await new sql.Request(transaction).input("entityId",sql.NVarChar(100),entityId).input("action",sql.NVarChar(50),action).input("actorId",sql.NVarChar(100),principal.userId).input("actorEmail",sql.NVarChar(320),principal.email).input("before",sql.NVarChar(sql.MAX),before?JSON.stringify(before):null).input("after",sql.NVarChar(sql.MAX),after?JSON.stringify(after):null).input("reason",sql.NVarChar(500),reason||null).query("INSERT dbo.BillingAuditLog(EntityType,EntityId,Action,ActorId,ActorEmail,BeforeJson,AfterJson,Reason) VALUES('Invoice',@entityId,@action,@actorId,@actorEmail,@before,@after,@reason)");}
