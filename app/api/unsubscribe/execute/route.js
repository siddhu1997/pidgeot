import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createUnsubscribeExecutionService } from "@/lib/unsubscribe/execution-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_unsubscribe_request",
          message: "The unsubscribe execution request was invalid.",
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
          code: "invalid_unsubscribe_request",
          message: "The unsubscribe execution request was invalid.",
        },
      }, { status: 400 });
    }

    const session = await getRequiredCurrentAuthSession();
    const unsubscribeExecution = await createUnsubscribeExecutionService().executeSenderGroup({
      senderGroupId: body.senderGroupId,
      session,
    });

    return NextResponse.json({
      unsubscribeExecution,
    });
  } catch (error) {
    const status = error.code === "session_not_found"
      ? 401
      : error.code === "unsubscribe_sender_group_not_found"
        ? 404
        : 409;

    return NextResponse.json({
      error: {
        code: error.code || "unsubscribe_execution_failed",
        message: error.message || "The unsubscribe request could not be executed.",
      },
    }, { status });
  }
}