import { ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { try { await ensureSchema(); return Response.json({ status:"ok", database:"connected" }); } catch (error) { console.error(error); return Response.json({ status:"degraded", database:"unavailable" },{status:503}); } }
