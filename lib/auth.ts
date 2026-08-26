export type BillingRole = "Billing.Admin" | "Billing.Operator" | "Billing.Reader";

type Principal = { userId:string; name:string; email:string; roles:string[] };

export function principalFromRequest(request: Request): Principal | null {
  const encoded=request.headers.get("x-ms-client-principal");
  if (!encoded) return null;
  try {
    const data=JSON.parse(Buffer.from(encoded,"base64").toString("utf8"));
    const claims=(data.claims || []) as {typ:string;val:string}[];
    const values=(...types:string[])=>claims.filter((claim)=>types.includes(claim.typ)).map((claim)=>claim.val);
    const first=(...types:string[])=>values(...types)[0] || "";
    return {
      userId:first("http://schemas.microsoft.com/identity/claims/objectidentifier","oid") || String(data.user_id || ""),
      name:first("name","http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") || "Billing user",
      email:first("preferred_username","email","http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") || String(data.user_name || ""),
      roles:values("roles","http://schemas.microsoft.com/ws/2008/06/identity/claims/role"),
    };
  } catch { return null; }
}

export function authorize(request: Request, allowed: BillingRole[]) {
  const principal=principalFromRequest(request);
  if (!principal) return {principal:null,response:Response.json({error:"Authentication required"},{status:401})};
  if (process.env.ENFORCE_BILLING_ROLES === "1" && !principal.roles.some((role)=>allowed.includes(role as BillingRole))) return {principal,response:Response.json({error:"Insufficient permissions"},{status:403})};
  return {principal,response:null};
}
