import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getRequiredCurrentAuthSession();
    const scan = await createScanService().resumeScan({ session });

    return NextResponse.json({
      scan,
    });
  } catch (error) {
    const status = error.code === "session_not_found" ? 401 : 409;
    return NextResponse.json({
      error: {
        code: error.code || error.category || "scan_resume_failed",
        message: error.message || "The scan could not be resumed.",
      },
    }, { status });
  }
}