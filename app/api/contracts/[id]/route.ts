import { authorize } from "@/lib/auth";
import { validateContract } from "@/lib/contracts";
import { ensureSchema, getPool } from "@/lib/db";
import sql from "mssql";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = authorize(request, ["Billing.Admin", "Billing.Operator"]);
  if (auth.response) return auth.response;
  try {
    await ensureSchema();
    const { id } = await context.params;
    const contract = validateContract(await request.json());
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const before = await new sql.Request(transaction)
        .input("id", sql.NVarChar(64), id)
        .query("SELECT * FROM dbo.BillingContracts WHERE Id=@id");
      if (!before.recordset.length) throw new Error("Contract not found");
      await new sql.Request(transaction)
        .input("id", sql.NVarChar(64), id)
        .input("name", sql.NVarChar(240), contract.name)
        .input("status", sql.NVarChar(20), contract.status)
        .input("start", sql.Date, contract.startDate)
        .input("renewal", sql.Date, contract.renewalDate || null)
        .input("terms", sql.NVarChar(40), contract.terms)
        .input("notes", sql.NVarChar(1000), contract.notes || "")
        .query(
          "UPDATE dbo.BillingContracts SET Name=@name,Status=@status,StartDate=@start,RenewalDate=@renewal,PaymentTerms=@terms,Notes=@notes,UpdatedAt=SYSUTCDATETIME() WHERE Id=@id; DELETE dbo.BillingContractItems WHERE ContractId=@id",
        );
      for (const [index, item] of contract.items.entries())
        await new sql.Request(transaction)
          .input(
            "itemId",
            sql.NVarChar(64),
            item.id || `${id}-item-${Date.now()}-${index}`,
          )
          .input("id", sql.NVarChar(64), id)
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
            "INSERT dbo.BillingContractItems(Id,ContractId,ServiceName,Description,BillingType,Quantity,UnitRate,Discount,Taxable,BillingStart,BillingEnd,NextBillingDate,Status) VALUES(@itemId,@id,@service,@description,@type,@quantity,@rate,@discount,@taxable,@start,@end,@next,@status)",
          );
      await transaction.commit();
      return Response.json({ ...contract, id });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update contract",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = authorize(request, ["Billing.Admin"]);
  if (auth.response) return auth.response;
  try {
    await ensureSchema();
    const { id } = await context.params;
    const result = await (await getPool())
      .request()
      .input("id", sql.NVarChar(64), id)
      .query("DELETE dbo.BillingContracts OUTPUT DELETED.Id WHERE Id=@id");
    if (!result.recordset.length)
      return Response.json({ error: "Contract not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not delete contract" },
      { status: 409 },
    );
  }
}
