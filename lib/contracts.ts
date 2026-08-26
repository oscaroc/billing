export const billingTypes = ["One-time", "Monthly", "Annual", "Usage-based", "Milestone"] as const;
export const contractStatuses = ["Draft", "Active", "Paused", "Completed", "Cancelled"] as const;

export type ContractItemInput = {
  id?: string; serviceName: string; description?: string; billingType: typeof billingTypes[number];
  quantity: number; unitRate: number; discount?: number; taxable?: boolean; billingStart: string;
  billingEnd?: string; nextBillingDate?: string; status?: "Active" | "Paused" | "Completed";
};

export type ContractInput = {
  id?: string; name: string; status: typeof contractStatuses[number]; startDate: string; renewalDate?: string;
  terms: string; notes?: string; items: ContractItemInput[];
};

export function validateContract(value: unknown): ContractInput {
  const body = value as Partial<ContractInput>;
  if (!body || !String(body.name || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate || ""))) throw new Error("Contract name and start date are required");
  if (!contractStatuses.includes(body.status as ContractInput["status"])) throw new Error("Invalid contract status");
  if (!String(body.terms || "").trim()) throw new Error("Payment terms are required");
  if (!Array.isArray(body.items) || !body.items.length) throw new Error("Add at least one contract item");
  const items = body.items.map((item) => {
    const quantity = Number(item.quantity), unitRate = Number(item.unitRate), discount = Number(item.discount || 0);
    if (!String(item.serviceName || "").trim() || !billingTypes.includes(item.billingType) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitRate) || unitRate < 0 || !Number.isFinite(discount) || discount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.billingStart || ""))) throw new Error("Each item needs a service, billing type, start date, quantity, and valid rate");
    return { ...item, quantity, unitRate, discount, description:String(item.description || ""), taxable:Boolean(item.taxable), nextBillingDate:item.nextBillingDate || item.billingStart, status:item.status || "Active" };
  });
  return { id:body.id, name:String(body.name).trim(), status:body.status!, startDate:body.startDate!, renewalDate:body.renewalDate || "", terms:String(body.terms), notes:String(body.notes || ""), items };
}
