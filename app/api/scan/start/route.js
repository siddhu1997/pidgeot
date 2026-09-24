import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { getServerAppConfig } from "@/lib/config";
import { recoverDevelopmentWorkflowScenario } from "@/lib/dev-lab/workflow-scenario-guard";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getRequiredCurrentAuthSession();

    if (!getServerAppConfig().isProduction) {
      const recoveredWorkflow = recoverDevelopmentWorkflowScenario(session);

      if (recoveredWorkflow) {
        return NextResponse.json({
          recovered: true,
          scan: recoveredWorkflow.scan,
          workflow: recoveredWorkflow,
        });
      }
    }

    const scan = await createScanService().startScan({ session });

    return NextResponse.json({
      scan,
    });
  } catch (error) {
    const status = error.code === "session_not_found" ? 401 : 409;
    return NextResponse.json({
      error: {
        code: error.code || error.category || "scan_start_failed",
        message: error.message || "The scan could not be started.",
      },
    }, { status });
  }
}