import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getRequiredCurrentAuthSession();
    const scan = await createScanService().pauseScan({ session });

    return NextResponse.json({
      scan,
    });
  } catch (error) {
    return NextResponse.json({
      error: {
        code: error.code || "session_not_found",
        message: error.message || "The scan could not be paused.",
      },
    }, { status: 401 });
  }
}