import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.headers.get("x-ms-client-principal")) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return Response.json({ error:"Authentication required" },{status:401});
  const login = request.nextUrl.clone();
  login.pathname = "/.auth/login/aad";
  login.search = "";
  login.searchParams.set("post_login_redirect_uri",`${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher:["/((?!_next/static|_next/image|favicon.svg|api/health).*)"] };
