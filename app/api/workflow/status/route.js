import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createWorkflowService } from "@/lib/workflow/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredCurrentAuthSession();

    return NextResponse.json({
      workflow: createWorkflowService().getWorkflowStatus({ session }),
    });
  } catch (error) {
    return NextResponse.json({
      error: {
        code: error.code || "session_not_found",
        message: error.message || "The current session could not be resolved.",
      },
    }, { status: 401 });
  }
}