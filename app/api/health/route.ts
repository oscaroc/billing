import { ensureSchema, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// ensureSchema() memoizes, so it stops touching the database after the first
// success. Health has to open a real connection or it reports "connected"
// while every query is failing.
export async function GET() { try { await ensureSchema(); await (await getPool()).request().query("SELECT 1"); return Response.json({ status:"ok", database:"connected" }); } catch (error) { console.error(error); return Response.json({ status:"degraded", database:"unavailable" },{status:503}); } }
