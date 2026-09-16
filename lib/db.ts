import { ManagedIdentityCredential } from "@azure/identity";
import sql from "mssql";

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let schemaReady: Promise<void> | null = null;

export async function getPool() {
  if (!poolPromise) {
    // Hand the driver the credential, not a token: it calls getToken() per
    // connection and the credential refreshes on expiry. Fetching one token
    // here pinned the pool to a ~1h token, after which every new connection
    // failed with ELOGIN until the container restarted.
    const credential = new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : undefined);
    poolPromise = new sql.ConnectionPool({
      server: process.env.SQL_SERVER || "nivora-prod-sql2.database.windows.net",
      database: process.env.SQL_DATABASE || "nivora",
      authentication: { type: "token-credential", options: { credential } },
      options: { encrypt: true, trustServerCertificate: false, connectTimeout: 30000 },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    }).connect().catch((error) => { poolPromise = null; throw error; });
  }
  return poolPromise;
}

export async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID('dbo.BillingCustomers', 'U') IS NULL
      CREATE TABLE dbo.BillingCustomers (
        Id nvarchar(64) NOT NULL PRIMARY KEY,
        LegalName nvarchar(240) NOT NULL,
        ContactName nvarchar(160) NOT NULL DEFAULT '',
        Email nvarchar(320) NOT NULL,
        Address nvarchar(1000) NOT NULL,
        TaxId nvarchar(100) NOT NULL DEFAULT '',
        Currency char(3) NOT NULL DEFAULT 'USD',
        Tenant nvarchar(240) NOT NULL DEFAULT '',
        Status nvarchar(20) NOT NULL DEFAULT 'Active',
        CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
      IF OBJECT_ID('dbo.BillingInvoices', 'U') IS NULL
      CREATE TABLE dbo.BillingInvoices (
        Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InvoiceNumber nvarchar(40) NOT NULL UNIQUE,
        CustomerId nvarchar(64) NULL,
        CustomerName nvarchar(240) NOT NULL,
        IssueDate date NOT NULL,
        DueDate date NOT NULL,
        Amount decimal(19,2) NOT NULL,
        Balance decimal(19,2) NOT NULL,
        Status nvarchar(30) NOT NULL DEFAULT 'Draft',
        Payload nvarchar(max) NULL,
        CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_BillingInvoices_Customers FOREIGN KEY (CustomerId) REFERENCES dbo.BillingCustomers(Id)
      );
      IF OBJECT_ID('dbo.BillingPayments', 'U') IS NULL
      CREATE TABLE dbo.BillingPayments (
        Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InvoiceNumber nvarchar(40) NOT NULL,
        PaymentDate date NOT NULL,
        Amount decimal(19,2) NOT NULL,
        PaymentMethod nvarchar(60) NOT NULL,
        Reference nvarchar(160) NOT NULL DEFAULT '',
        CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_BillingPayments_Invoices FOREIGN KEY (InvoiceNumber) REFERENCES dbo.BillingInvoices(InvoiceNumber)
      );
    `);
    if (process.env.RUN_BILLING_MIGRATIONS === "1") {
      await pool.request().query(`
      IF OBJECT_ID('dbo.BillingInvoiceSequences','U') IS NULL CREATE TABLE dbo.BillingInvoiceSequences (InvoiceYear int NOT NULL PRIMARY KEY,LastNumber int NOT NULL);
      IF COL_LENGTH('dbo.BillingInvoices','Currency') IS NULL ALTER TABLE dbo.BillingInvoices ADD Currency char(3) NOT NULL CONSTRAINT DF_BillingInvoices_Currency DEFAULT 'USD';
      IF COL_LENGTH('dbo.BillingInvoices','UpdatedAt') IS NULL ALTER TABLE dbo.BillingInvoices ADD UpdatedAt datetime2 NOT NULL CONSTRAINT DF_BillingInvoices_UpdatedAt DEFAULT SYSUTCDATETIME();
      IF COL_LENGTH('dbo.BillingInvoices','IssuedAt') IS NULL ALTER TABLE dbo.BillingInvoices ADD IssuedAt datetime2 NULL;
      IF COL_LENGTH('dbo.BillingInvoices','SentAt') IS NULL ALTER TABLE dbo.BillingInvoices ADD SentAt datetime2 NULL;
      IF COL_LENGTH('dbo.BillingInvoices','VoidReason') IS NULL ALTER TABLE dbo.BillingInvoices ADD VoidReason nvarchar(500) NULL;
      IF OBJECT_ID('dbo.BillingInvoiceLines','U') IS NULL CREATE TABLE dbo.BillingInvoiceLines (Id bigint IDENTITY(1,1) PRIMARY KEY,InvoiceNumber nvarchar(40) NOT NULL,Position int NOT NULL,Description nvarchar(500) NOT NULL,Quantity decimal(19,4) NOT NULL,Rate decimal(19,4) NOT NULL,Amount decimal(19,2) NOT NULL,CONSTRAINT FK_BillingInvoiceLines_Invoices FOREIGN KEY(InvoiceNumber) REFERENCES dbo.BillingInvoices(InvoiceNumber) ON DELETE CASCADE);
      IF COL_LENGTH('dbo.BillingPayments','ReversedAt') IS NULL ALTER TABLE dbo.BillingPayments ADD ReversedAt datetime2 NULL;
      IF COL_LENGTH('dbo.BillingPayments','ReversalReason') IS NULL ALTER TABLE dbo.BillingPayments ADD ReversalReason nvarchar(500) NULL;
      IF COL_LENGTH('dbo.BillingPayments','IdempotencyKey') IS NULL ALTER TABLE dbo.BillingPayments ADD IdempotencyKey nvarchar(100) NULL;
      IF OBJECT_ID('dbo.BillingAuditLog','U') IS NULL CREATE TABLE dbo.BillingAuditLog (Id bigint IDENTITY(1,1) PRIMARY KEY,EntityType nvarchar(50) NOT NULL,EntityId nvarchar(100) NOT NULL,Action nvarchar(50) NOT NULL,ActorId nvarchar(100) NOT NULL,ActorEmail nvarchar(320) NOT NULL,BeforeJson nvarchar(max) NULL,AfterJson nvarchar(max) NULL,Reason nvarchar(500) NULL,CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
      IF OBJECT_ID('dbo.BillingContracts','U') IS NULL CREATE TABLE dbo.BillingContracts (Id nvarchar(64) NOT NULL PRIMARY KEY,CustomerId nvarchar(64) NOT NULL,Name nvarchar(240) NOT NULL,Status nvarchar(20) NOT NULL DEFAULT 'Draft',StartDate date NOT NULL,RenewalDate date NULL,PaymentTerms nvarchar(40) NOT NULL,Notes nvarchar(1000) NOT NULL DEFAULT '',CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT FK_BillingContracts_Customers FOREIGN KEY(CustomerId) REFERENCES dbo.BillingCustomers(Id) ON DELETE CASCADE);
      IF OBJECT_ID('dbo.BillingContractItems','U') IS NULL CREATE TABLE dbo.BillingContractItems (Id nvarchar(64) NOT NULL PRIMARY KEY,ContractId nvarchar(64) NOT NULL,ServiceName nvarchar(240) NOT NULL,Description nvarchar(500) NOT NULL DEFAULT '',BillingType nvarchar(30) NOT NULL,Quantity decimal(19,4) NOT NULL,UnitRate decimal(19,4) NOT NULL,Discount decimal(19,2) NOT NULL DEFAULT 0,Taxable bit NOT NULL DEFAULT 0,BillingStart date NOT NULL,BillingEnd date NULL,NextBillingDate date NULL,LastInvoicedAt datetime2 NULL,Status nvarchar(20) NOT NULL DEFAULT 'Active',CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT FK_BillingContractItems_Contracts FOREIGN KEY(ContractId) REFERENCES dbo.BillingContracts(Id) ON DELETE CASCADE);
      IF COL_LENGTH('dbo.BillingContracts','RenewalDate') IS NULL AND COL_LENGTH('dbo.BillingContracts','EndDate') IS NOT NULL EXEC sp_rename 'dbo.BillingContracts.EndDate','RenewalDate','COLUMN';
      IF COL_LENGTH('dbo.BillingCustomers','ContractStart') IS NOT NULL ALTER TABLE dbo.BillingCustomers DROP COLUMN ContractStart;
      IF COL_LENGTH('dbo.BillingCustomers','RenewalDate') IS NOT NULL ALTER TABLE dbo.BillingCustomers DROP COLUMN RenewalDate;
      IF COL_LENGTH('dbo.BillingCustomers','PaymentTerms') IS NOT NULL
      BEGIN
        DECLARE @customerTermsDefault sysname;
        SELECT @customerTermsDefault=dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id=dc.object_id
        WHERE dc.parent_object_id=OBJECT_ID('dbo.BillingCustomers') AND c.name='PaymentTerms';
        IF @customerTermsDefault IS NOT NULL
        BEGIN
          DECLARE @dropCustomerTermsDefault nvarchar(1000)=N'ALTER TABLE dbo.BillingCustomers DROP CONSTRAINT ' + QUOTENAME(@customerTermsDefault);
          EXEC sp_executesql @dropCustomerTermsDefault;
        END;
        ALTER TABLE dbo.BillingCustomers DROP COLUMN PaymentTerms;
      END;
      IF COL_LENGTH('dbo.BillingContracts','Currency') IS NOT NULL ALTER TABLE dbo.BillingContracts DROP COLUMN Currency;
      `);
      // Keep this in a separate batch: SQL Server compiles index column references
      // before an ALTER TABLE earlier in the same batch has executed.
      await pool.request().query(`IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_BillingPayments_IdempotencyKey' AND object_id=OBJECT_ID('dbo.BillingPayments')) CREATE UNIQUE INDEX UX_BillingPayments_IdempotencyKey ON dbo.BillingPayments(IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;`);
    }
    if (process.env.PROVISION_BILLING_USER === "1") {
      const targetName = process.env.PROVISION_BILLING_USER_NAME || "nivora-billing-prod-id";
      const targetObjectId = process.env.PROVISION_BILLING_USER_OBJECT_ID;
      if (!targetObjectId || !/^[0-9a-f-]{36}$/i.test(targetObjectId) || !/^[a-zA-Z0-9-]{1,128}$/.test(targetName)) throw new Error("Valid billing user name and object ID are required");
      const quotedTargetName = `[${targetName}]`;
      await pool.request().input("targetName", sql.NVarChar(128), targetName).input("targetClientId",sql.UniqueIdentifier,targetObjectId).query(`
      DECLARE @expectedSid varbinary(16) = CONVERT(varbinary(16), @targetClientId);
      IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @targetName AND sid <> @expectedSid)
        DROP USER ${quotedTargetName};
      IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @targetName)
      BEGIN
        DECLARE @sid nvarchar(max) = CONVERT(varchar(max), @expectedSid, 1);
        EXEC (N'CREATE USER ${quotedTargetName} WITH SID = ' + @sid + N', TYPE = E');
      END
      ALTER ROLE db_datareader ADD MEMBER ${quotedTargetName};
      ALTER ROLE db_datawriter ADD MEMBER ${quotedTargetName};
    `);
    }
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export function customerFromRow(row: Record<string, unknown>) {
  const date = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : "";
  return { id: row.Id, legalName: row.LegalName, contactName: row.ContactName, email: row.Email, address: row.Address, taxId: row.TaxId, currency: row.Currency, tenant: row.Tenant, contractCount:Number(row.ContractCount || 0), activeContractCount:Number(row.ActiveContractCount || 0), nextRenewalDate:date(row.NextContractRenewal), status: row.Status };
}
