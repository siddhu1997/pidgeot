import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createScanService } from "@/lib/scanning/scanner";
import { getManualSenderIdentity, rememberManualHandled } from "@/lib/workflow/manual-unsubscribe-memory";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_manual_handled_request",
          message: "The manual handled request was invalid.",
        },
      }, { status: 400 });
    }

    const bodyKeys = Object.keys(body || {});

    if (
      !body
      || typeof body.senderGroupId !== "string"
      || !body.senderGroupId
      || bodyKeys.length !== 1
    ) {
      return NextResponse.json({
        error: {
          code: "invalid_manual_handled_request",
          message: "The manual handled request was invalid.",
        },
      }, { status: 400 });
    }

    const session = await getRequiredCurrentAuthSession();
    const scan = createScanService().getScanStatus({ session });
    const group = Array.isArray(scan?.senderGroups)
      ? scan.senderGroups.find((entry) => entry.id === body.senderGroupId)
      : null;

    if (!group) {
      return NextResponse.json({
        error: {
          code: "workflow_sender_group_not_found",
          message: "The sender group was not found in the current session scan.",
        },
      }, { status: 404 });
    }

    rememberManualHandled({
      accountKey: session.accountKey,
      identity: getManualSenderIdentity(group),
      scanId: scan.scanId || null,
    });

    return NextResponse.json({
      recorded: true,
    });
  } catch (error) {
    const status = error.code === "session_not_found" ? 401 : 409;

    return NextResponse.json({
      error: {
        code: error.code || "manual_handled_failed",
        message: error.message || "The sender could not be remembered as handled.",
      },
    }, { status });
  }
}
