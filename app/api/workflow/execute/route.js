import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { createWorkflowService } from "@/lib/workflow/service";

export const runtime = "nodejs";

function isValidSelection(selection) {
  if (!selection || typeof selection !== "object") {
    return false;
  }

  const selectionKeys = Object.keys(selection).sort();

  if (
    selectionKeys.length !== 2 ||
    selectionKeys[0] !== "actions" ||
    selectionKeys[1] !== "senderGroupId" ||
    typeof selection.senderGroupId !== "string" ||
    !selection.senderGroupId ||
    !selection.actions ||
    typeof selection.actions !== "object"
  ) {
    return false;
  }

  const actionKeys = Object.keys(selection.actions).sort();

  if (actionKeys.length === 0 || actionKeys.some((key) => key !== "cleanup" && key !== "unsubscribe")) {
    return false;
  }

  if (actionKeys.some((key) => typeof selection.actions[key] !== "boolean")) {
    return false;
  }

  return Boolean(selection.actions.cleanup || selection.actions.unsubscribe);
}

function validateRequestBody(body) {
  if (!body || typeof body !== "object") {
    return false;
  }

  const bodyKeys = Object.keys(body);

  if (bodyKeys.length !== 1 || bodyKeys[0] !== "selections" || !Array.isArray(body.selections) || body.selections.length === 0) {
    return false;
  }

  const senderGroupIds = new Set();

  for (const selection of body.selections) {
    if (!isValidSelection(selection) || senderGroupIds.has(selection.senderGroupId)) {
      return false;
    }

    senderGroupIds.add(selection.senderGroupId);
  }

  return true;
}

export async function POST(request) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_workflow_request",
          message: "The workflow execution request was invalid.",
        },
      }, { status: 400 });
    }

    if (!validateRequestBody(body)) {
      return NextResponse.json({
        error: {
          code: "invalid_workflow_request",
          message: "The workflow execution request was invalid.",
        },
      }, { status: 400 });
    }

    const session = await getRequiredCurrentAuthSession();
    const result = await createWorkflowService().executeSelections({
      selections: body.selections,
      session,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = error.code === "session_not_found"
      ? 401
      : error.code === "workflow_sender_group_not_found" || error.code === "unsubscribe_sender_group_not_found" || error.code === "cleanup_sender_group_not_found"
        ? 404
        : 409;

    return NextResponse.json({
      error: {
        code: error.code || "workflow_execution_failed",
        message: error.message || "The workflow request could not be executed.",
      },
    }, { status });
  }
}