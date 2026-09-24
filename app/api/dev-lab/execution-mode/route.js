import { NextResponse } from "next/server";

import { assertDevelopmentLabAvailable, getDevLabPublicStatus } from "@/lib/dev-lab/config";
import { setWorkflowExecutionModeOverride } from "@/lib/workflow/execution-mode-store";

export const runtime = "nodejs";

function errorStatus(code) {
  if (code === "development_only") {
    return 404;
  }

  if (code === "invalid_execution_mode" || code === "invalid_execution_mode_request") {
    return 400;
  }

  return 500;
}

export async function POST(request) {
  try {
    assertDevelopmentLabAvailable();

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_execution_mode_request",
          message: "The execution mode request was invalid.",
        },
      }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({
        error: {
          code: "invalid_execution_mode_request",
          message: "The execution mode request was invalid.",
        },
      }, { status: 400 });
    }

    const bodyKeys = Object.keys(body);

    if (bodyKeys.length !== 1 || bodyKeys[0] !== "mode") {
      return NextResponse.json({
        error: {
          code: "invalid_execution_mode_request",
          message: "The execution mode request was invalid.",
        },
      }, { status: 400 });
    }

    setWorkflowExecutionModeOverride(body.mode);

    return NextResponse.json({
      lab: getDevLabPublicStatus(),
    });
  } catch (error) {
    const code = error.code || "execution_mode_update_failed";

    return NextResponse.json({
      error: {
        code,
        message: error.message || "The workflow execution mode could not be updated.",
      },
    }, { status: errorStatus(code) });
  }
}
