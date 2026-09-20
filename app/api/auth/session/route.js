import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { buildAuthenticatedSessionResponse } from "@/lib/auth/session-presentation";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAuthSession();

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json(buildAuthenticatedSessionResponse(session));
}