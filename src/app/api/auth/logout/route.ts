import { NextResponse } from "next/server";
import { getSessionUser, logout } from "@/lib/auth";
import { logAudit } from "@/lib/db";

export async function POST() {
  const user = await getSessionUser();
  await logout();
  if (user) logAudit(user.username, "logout");
  return NextResponse.json({ ok: true });
}
