import { ensureSchema, getPool, customerFromRow } from "@/lib/db";
import sql from "mssql";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const auth=authorize(request,["Billing.Admin","Billing.Operator","Billing.Reader"]);if(auth.response)return auth.response;
  try { await ensureSchema(); const result = await (await getPool()).request().query("SELECT c.*,contracts.ContractCount,contracts.ActiveContractCount,contracts.NextContractRenewal FROM dbo.BillingCustomers c OUTER APPLY (SELECT COUNT(*) AS ContractCount,SUM(CASE WHEN bc.Status='Active' THEN 1 ELSE 0 END) AS ActiveContractCount,MIN(CASE WHEN bc.Status='Active' AND bc.RenewalDate>=CAST(GETUTCDATE() AS date) THEN bc.RenewalDate END) AS NextContractRenewal FROM dbo.BillingContracts bc WHERE bc.CustomerId=c.Id) contracts ORDER BY c.LegalName"); return Response.json(result.recordset.map(customerFromRow)); }
  catch (error) { console.error(error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const auth=authorize(request,["Billing.Admin","Billing.Operator"]);if(auth.response)return auth.response;
  try {
    await ensureSchema(); const body = await request.json(); const id = body.id || `cus-${Date.now()}`; const pool = await getPool();
    if(!String(body.legalName||"").trim()||!String(body.email||"").includes("@")||!String(body.address||"").trim())return Response.json({error:"Legal name, billing email, and address are required"},{status:400});
    await pool.request().input("id", sql.NVarChar(64), id).input("legalName", sql.NVarChar(240), body.legalName).input("contactName", sql.NVarChar(160), body.contactName || "").input("email", sql.NVarChar(320), body.email).input("address", sql.NVarChar(1000), body.address).input("taxId", sql.NVarChar(100), body.taxId || "").input("currency", sql.Char(3), body.currency || "USD").input("tenant", sql.NVarChar(240), body.tenant || "").input("status", sql.NVarChar(20), body.status || "Active").query("INSERT dbo.BillingCustomers (Id,LegalName,ContactName,Email,Address,TaxId,Currency,Tenant,Status) VALUES (@id,@legalName,@contactName,@email,@address,@taxId,@currency,@tenant,@status)");
    await pool.request().input("id",sql.NVarChar(100),id).input("actorId",sql.NVarChar(100),auth.principal!.userId).input("actorEmail",sql.NVarChar(320),auth.principal!.email).input("after",sql.NVarChar(sql.MAX),JSON.stringify({...body,id})).query("INSERT dbo.BillingAuditLog(EntityType,EntityId,Action,ActorId,ActorEmail,AfterJson) VALUES('Customer',@id,'Created',@actorId,@actorEmail,@after)");
    return Response.json({ ...body, id }, { status: 201 });
  } catch (error) { console.error(error); return Response.json({ error: "Could not create customer" }, { status: 500 }); }
}
