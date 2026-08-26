import { authorize } from "@/lib/auth";
import { validateContract } from "@/lib/contracts";
import { ensureSchema, getPool } from "@/lib/db";
import sql from "mssql";

export const dynamic = "force-dynamic";

const date = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value
      ? String(value).slice(0, 10)
      : "";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = authorize(request, [
    "Billing.Admin",
    "Billing.Operator",
    "Billing.Reader",
  ]);
  if (auth.response) return auth.response;
  try {
    await ensureSchema();
    const { id } = await context.params;
    const result = await (await getPool())
      .request()
      .input("customerId", sql.NVarChar(64), id)
      .query(
        "SELECT * FROM dbo.BillingContracts WHERE CustomerId=@customerId ORDER BY CreatedAt DESC; SELECT i.* FROM dbo.BillingContractItems i JOIN dbo.BillingContracts c ON c.Id=i.ContractId WHERE c.CustomerId=@customerId ORDER BY i.CreatedAt",
      );
    const sets = result.recordsets as unknown as Array<
      Array<Record<string, unknown>>
    >;
    const items = sets[1];
    return Response.json(
      sets[0].map((row) => ({
        id: row.Id,
        customerId: row.CustomerId,
        name: row.Name,
        status: row.Status,
        startDate: date(row.StartDate),
        renewalDate: date(row.RenewalDate),
        terms: row.PaymentTerms,
        notes: row.Notes,
        items: items
          .filter((item) => item.ContractId === row.Id)
          .map((item) => ({
            id: item.Id,
            serviceName: item.ServiceName,
            description: item.Description,
            billingType: item.BillingType,
            quantity: Number(item.Quantity),
            unitRate: Number(item.UnitRate),
            discount: Number(item.Discount),
            taxable: Boolean(item.Taxable),
            billingStart: date(item.BillingStart),
            billingEnd: date(item.BillingEnd),
            nextBillingDate: date(item.NextBillingDate),
            lastInvoicedAt: item.LastInvoicedAt,
            status: item.Status,
          })),
      })),
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Contracts unavailable" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = authorize(request, ["Billing.Admin", "Billing.Operator"]);
  if (auth.response) return auth.response;
  try {
    await ensureSchema();
    const { id: customerId } = await context.params;
    const contract = validateContract(await request.json());
    const id = contract.id || `ctr-${Date.now()}`;
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const customer = await new sql.Request(transaction)
        .input("customerId", sql.NVarChar(64), customerId)
        .query("SELECT Id FROM dbo.BillingCustomers WHERE Id=@customerId");
      if (!customer.recordset.length) throw new Error("Customer not found");
      await new sql.Request(transaction)
        .input("id", sql.NVarChar(64), id)
        .input("customerId", sql.NVarChar(64), customerId)
        .input("name", sql.NVarChar(240), contract.name)
        .input("status", sql.NVarChar(20), contract.status)
        .input("start", sql.Date, contract.startDate)
        .input("renewal", sql.Date, contract.renewalDate || null)
        .input("terms", sql.NVarChar(40), contract.terms)
        .input("notes", sql.NVarChar(1000), contract.notes || "")
        .query(
          "INSERT dbo.BillingContracts(Id,CustomerId,Name,Status,StartDate,RenewalDate,PaymentTerms,Notes) VALUES(@id,@customerId,@name,@status,@start,@renewal,@terms,@notes)",
        );
      for (const [index, item] of contract.items.entries())
        await new sql.Request(transaction)
          .input("id", sql.NVarChar(64), item.id || `${id}-item-${index + 1}`)
          .input("contractId", sql.NVarChar(64), id)
          .input("service", sql.NVarChar(240), item.serviceName)
          .input("description", sql.NVarChar(500), item.description || "")
          .input("type", sql.NVarChar(30), item.billingType)
          .input("quantity", sql.Decimal(19, 4), item.quantity)
          .input("rate", sql.Decimal(19, 4), item.unitRate)
          .input("discount", sql.Decimal(19, 2), item.discount || 0)
          .input("taxable", sql.Bit, item.taxable ? 1 : 0)
          .input("start", sql.Date, item.billingStart)
          .input("end", sql.Date, item.billingEnd || null)
          .input("next", sql.Date, item.nextBillingDate || item.billingStart)
          .input("status", sql.NVarChar(20), item.status || "Active")
          .query(
            "INSERT dbo.BillingContractItems(Id,ContractId,ServiceName,Description,BillingType,Quantity,UnitRate,Discount,Taxable,BillingStart,BillingEnd,NextBillingDate,Status) VALUES(@id,@contractId,@service,@description,@type,@quantity,@rate,@discount,@taxable,@start,@end,@next,@status)",
          );
      await new sql.Request(transaction)
        .input("entityId", sql.NVarChar(100), id)
        .input("actorId", sql.NVarChar(100), auth.principal!.userId)
        .input("actorEmail", sql.NVarChar(320), auth.principal!.email)
        .input("after", sql.NVarChar(sql.MAX), JSON.stringify(contract))
        .query(
          "INSERT dbo.BillingAuditLog(EntityType,EntityId,Action,ActorId,ActorEmail,AfterJson) VALUES('Contract',@entityId,'Created',@actorId,@actorEmail,@after)",
        );
      await transaction.commit();
      return Response.json({ ...contract, id, customerId }, { status: 201 });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create contract",
      },
      { status: 400 },
    );
  }
}
