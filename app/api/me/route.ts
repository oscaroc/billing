import { principalFromRequest } from "@/lib/auth";

export const dynamic="force-dynamic";
export async function GET(request:Request){const principal=principalFromRequest(request);if(!principal)return Response.json({error:"Authentication required"},{status:401});return Response.json({...principal,initials:principal.name.split(" ").map((part)=>part[0]).join("").slice(0,2).toUpperCase()||"BU",authenticated:true});}
