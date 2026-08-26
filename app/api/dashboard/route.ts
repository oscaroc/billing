import { ensureSchema, getPool } from "@/lib/db";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const auth=authorize(request,["Billing.Admin","Billing.Operator","Billing.Reader"]);if(auth.response)return auth.response;
  try {
    await ensureSchema();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Currency,
        COALESCE(SUM(CASE WHEN Status NOT IN ('Paid','Voided') THEN Balance ELSE 0 END),0) AS Outstanding,
        COALESCE(SUM(CASE WHEN Status NOT IN ('Paid','Voided') AND DueDate < CAST(GETUTCDATE() AS date) THEN Balance ELSE 0 END),0) AS Overdue
      FROM dbo.BillingInvoices GROUP BY Currency;

      SELECT COUNT(CASE WHEN Status NOT IN ('Paid','Voided') THEN 1 END) AS OpenInvoices,
        COUNT(CASE WHEN Status NOT IN ('Paid','Voided') AND DueDate < CAST(GETUTCDATE() AS date) THEN 1 END) AS OverdueInvoices
      FROM dbo.BillingInvoices;

      SELECT i.Currency,COALESCE(SUM(p.Amount),0) AS Collected,COUNT(*) AS PaymentCount
      FROM dbo.BillingPayments p JOIN dbo.BillingInvoices i ON i.InvoiceNumber=p.InvoiceNumber
      WHERE PaymentDate >= DATEFROMPARTS(YEAR(GETUTCDATE()),MONTH(GETUTCDATE()),1)
        AND PaymentDate < DATEADD(month,1,DATEFROMPARTS(YEAR(GETUTCDATE()),MONTH(GETUTCDATE()),1))
        AND p.ReversedAt IS NULL GROUP BY i.Currency;

      SELECT COUNT(*) AS ActiveCustomers FROM dbo.BillingCustomers WHERE Status='Active';

      SELECT TOP 3 InvoiceNumber,CustomerName,DueDate,Balance,Currency,
        DATEDIFF(day,DueDate,CAST(GETUTCDATE() AS date)) AS DaysOverdue
      FROM dbo.BillingInvoices
      WHERE Status NOT IN ('Paid','Voided') AND DueDate < CAST(GETUTCDATE() AS date)
      ORDER BY DueDate;

      SELECT TOP 3 c.LegalName,bc.RenewalDate AS RenewalDate
      FROM dbo.BillingContracts bc
      JOIN dbo.BillingCustomers c ON c.Id=bc.CustomerId
      WHERE c.Status='Active' AND bc.Status='Active'
        AND bc.RenewalDate >= CAST(GETUTCDATE() AS date)
        AND bc.RenewalDate < DATEADD(day,60,CAST(GETUTCDATE() AS date))
      ORDER BY bc.RenewalDate;
    `);
    const sets = result.recordsets as unknown as Array<Array<Record<string,unknown>>>;
    const counts = sets[1][0];
    const monetaryByCurrency=sets[0].map((row)=>({currency:String(row.Currency||"USD"),outstanding:Number(row.Outstanding),overdue:Number(row.Overdue),collected:0}));
    for(const row of sets[2]){const currency=String(row.Currency||"USD");const item=monetaryByCurrency.find((entry)=>entry.currency===currency);if(item)item.collected=Number(row.Collected);else monetaryByCurrency.push({currency,outstanding:0,overdue:0,collected:Number(row.Collected)});}
    return Response.json({
      monetaryByCurrency,
      openInvoices: Number(counts.OpenInvoices), overdueInvoices: Number(counts.OverdueInvoices),
      paymentCount: sets[2].reduce((sum,row)=>sum+Number(row.PaymentCount),0),
      activeCustomers: Number(sets[3][0].ActiveCustomers),
      overdueItems: sets[4].map((row) => ({ number:row.InvoiceNumber, customer:row.CustomerName, dueDate:row.DueDate, balance:Number(row.Balance), currency:String(row.Currency||"USD"),daysOverdue:Number(row.DaysOverdue) })),
      renewals: sets[5].map((row) => ({ customer:row.LegalName, renewalDate:row.RenewalDate })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error:"Dashboard data unavailable" }, { status:503 });
  }
}
