import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createCleanupExecutionService } from "@/lib/cleanup/execution-service";
import { getServerAppConfig } from "@/lib/config";
import { recoverDevelopmentWorkflowScenario } from "@/lib/dev-lab/workflow-scenario-guard";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";

function sanitizeCleanupExecution(cleanupExecution) {
  if (!cleanupExecution) {
    return null;
  }

  return {
    senderGroupId: cleanupExecution.senderGroupId,
    status: cleanupExecution.status,
    summary: cleanupExecution.summary,
  };
}

export async function POST(request) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_cleanup_request",
          message: "The cleanup execution request was invalid.",
        },
      }, { status: 400 });
    }

    const bodyKeys = Object.keys(body || {});

    if (
      !body ||
      typeof body.senderGroupId !== "string" ||
      !body.senderGroupId ||
      bodyKeys.length !== 1
    ) {
      return NextResponse.json({
        error: {
          code: "invalid_cleanup_request",
          message: "The cleanup execution request was invalid.",
        },
      }, { status: 400 });
    }

    const session = await getRequiredCurrentAuthSession();

    if (!getServerAppConfig().isProduction) {
      const recoveredWorkflow = recoverDevelopmentWorkflowScenario(session);

      if (recoveredWorkflow) {
        return NextResponse.json({
          cleanupExecution: null,
          recovered: true,
          scan: recoveredWorkflow.scan,
          workflow: recoveredWorkflow,
        });
      }
    }

    const cleanupExecution = await createCleanupExecutionService().executeSenderGroupCleanup({
      senderGroupId: body.senderGroupId,
      session,
    });

    return NextResponse.json({
      cleanupExecution: sanitizeCleanupExecution(cleanupExecution),
      scan: createScanService().getScanStatus({ session }),
    });
  } catch (error) {
    const status = error.code === "session_not_found"
      ? 401
      : error.code === "cleanup_sender_group_not_found"
        ? 404
        : 409;

    return NextResponse.json({
      error: {
        code: error.code || "cleanup_execution_failed",
        message: error.message || "The cleanup request could not be executed.",
      },
    }, { status });
  }
}