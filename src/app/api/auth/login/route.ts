import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { logAudit } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }
  const user = await login(String(username), String(password));
  if (!user) {
    logAudit(String(username), "login_failed");
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
  logAudit(user.username, "login_success");
  return NextResponse.json({ ok: true, role: user.role });
}
