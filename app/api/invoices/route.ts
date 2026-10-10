import { validateInvoice, remitToAddress } from "@/lib/billing";
import { authorize } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";
import sql from "mssql";

export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const auth=authorize(request,["Billing.Admin","Billing.Operator","Billing.Reader"]); if(auth.response)return auth.response;
  try { await ensureSchema(); const result=await (await getPool()).request().query("SELECT InvoiceNumber,CustomerName,IssueDate,DueDate,Amount,Balance,Status,Currency FROM dbo.BillingInvoices ORDER BY Id DESC"); return Response.json(result.recordset); }
  catch(error){console.error(error);return Response.json({error:"Database unavailable"},{status:503});}
}

export async function POST(request:Request) {
  const auth=authorize(request,["Billing.Admin","Billing.Operator"]); if(auth.response)return auth.response;
  try {
    await ensureSchema(); const invoice={...validateInvoice(await request.json()),remitTo:remitToAddress()}; const pool=await getPool(); const transaction=new sql.Transaction(pool); await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const customer=await new sql.Request(transaction).input("name",sql.NVarChar(240),invoice.customer).query("SELECT TOP 1 Id FROM dbo.BillingCustomers WHERE LegalName=@name AND Status='Active'");
      if(!customer.recordset.length)throw new Error("Active customer not found");
      const year=Number(invoice.issueDate.slice(0,4));
      const sequence=await new sql.Request(transaction).input("year",sql.Int,year).query(`
        IF NOT EXISTS(SELECT 1 FROM dbo.BillingInvoiceSequences WITH(UPDLOCK,HOLDLOCK) WHERE InvoiceYear=@year)
          INSERT dbo.BillingInvoiceSequences(InvoiceYear,LastNumber) SELECT @year,ISNULL(MAX(TRY_CONVERT(int,RIGHT(InvoiceNumber,4))),0) FROM dbo.BillingInvoices WHERE InvoiceNumber LIKE CONCAT('INV-',@year,'-%');
        UPDATE dbo.BillingInvoiceSequences WITH(UPDLOCK,HOLDLOCK) SET LastNumber=LastNumber+1 OUTPUT INSERTED.LastNumber WHERE InvoiceYear=@year;
      `);
      const number=`INV-${year}-${String(sequence.recordset[0].LastNumber).padStart(4,"0")}`;
      await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("customerId",sql.NVarChar(64),customer.recordset[0].Id).input("customer",sql.NVarChar(240),invoice.customer).input("issueDate",sql.Date,invoice.issueDate).input("dueDate",sql.Date,invoice.dueDate).input("amount",sql.Decimal(19,2),invoice.total).input("currency",sql.Char(3),invoice.currency).input("payload",sql.NVarChar(sql.MAX),JSON.stringify(invoice)).query("INSERT dbo.BillingInvoices(InvoiceNumber,CustomerId,CustomerName,IssueDate,DueDate,Amount,Balance,Status,Currency,Payload) VALUES(@number,@customerId,@customer,@issueDate,@dueDate,@amount,@amount,'Draft',@currency,@payload)");
      for(let position=0;position<invoice.lines.length;position++){const line=invoice.lines[position];await new sql.Request(transaction).input("number",sql.NVarChar(40),number).input("position",sql.Int,position+1).input("description",sql.NVarChar(500),line.description).input("quantity",sql.Decimal(19,4),line.quantity).input("rate",sql.Decimal(19,4),line.rate).input("amount",sql.Decimal(19,2),Math.round(line.quantity*line.rate*100)/100).query("INSERT dbo.BillingInvoiceLines(InvoiceNumber,Position,Description,Quantity,Rate,Amount) VALUES(@number,@position,@description,@quantity,@rate,@amount)");}
      const contractItemIds=Array.isArray(invoice.contractItemIds)?invoice.contractItemIds.filter((id):id is string=>typeof id==="string"&&id.length<=64):[];
      for(const itemId of contractItemIds) await new sql.Request(transaction).input("itemId",sql.NVarChar(64),itemId).input("customerId",sql.NVarChar(64),customer.recordset[0].Id).query(`UPDATE dbo.BillingContractItems SET LastInvoicedAt=SYSUTCDATETIME(),Status=CASE WHEN BillingType='One-time' THEN 'Completed' ELSE Status END,NextBillingDate=CASE WHEN BillingType='Monthly' THEN DATEADD(month,1,NextBillingDate) WHEN BillingType='Annual' THEN DATEADD(year,1,NextBillingDate) WHEN BillingType='One-time' THEN NULL ELSE NextBillingDate END,UpdatedAt=SYSUTCDATETIME() WHERE Id=@itemId AND EXISTS(SELECT 1 FROM dbo.BillingContracts c WHERE c.Id=ContractId AND c.CustomerId=@customerId)`);
      await new sql.Request(transaction).input("entityId",sql.NVarChar(100),number).input("actorId",sql.NVarChar(100),auth.principal!.userId).input("actorEmail",sql.NVarChar(320),auth.principal!.email).input("after",sql.NVarChar(sql.MAX),JSON.stringify(invoice)).query("INSERT dbo.BillingAuditLog(EntityType,EntityId,Action,ActorId,ActorEmail,AfterJson) VALUES('Invoice',@entityId,'Created',@actorId,@actorEmail,@after)");
      await transaction.commit(); return Response.json({number,total:invoice.total,currency:invoice.currency,remitTo:invoice.remitTo},{status:201});
    }catch(error){await transaction.rollback();throw error;}
  }catch(error){console.error(error);return Response.json({error:error instanceof Error?error.message:"Could not create invoice"},{status:400});}
}
