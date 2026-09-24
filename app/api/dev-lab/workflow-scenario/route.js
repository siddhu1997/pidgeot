import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { assertDevelopmentLabAvailable, getDevLabPublicStatus } from "@/lib/dev-lab/config";
import { buildWorkflowScenarioOutcomes } from "@/lib/dev-lab/workflow-scenario";
import {
  clearWorkflowScenario,
  isWorkflowScenarioId,
  setWorkflowScenario,
} from "@/lib/dev-lab/workflow-scenario-store";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";

function errorStatus(code) {
  if (code === "development_only") {
    return 404;
  }

  if (code === "session_not_found") {
    return 401;
  }

  if (
    code === "invalid_workflow_scenario"
    || code === "invalid_workflow_scenario_request"
    || code === "workflow_scenario_scan_required"
  ) {
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
          code: "invalid_workflow_scenario_request",
          message: "The workflow scenario request was invalid.",
        },
      }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({
        error: {
          code: "invalid_workflow_scenario_request",
          message: "The workflow scenario request was invalid.",
        },
      }, { status: 400 });
    }

    const action = body.action;

    if (action === "clear" || action === "reset") {
      clearWorkflowScenario();

      return NextResponse.json({
        lab: getDevLabPublicStatus(),
      });
    }

    if (action !== "apply" || !isWorkflowScenarioId(body.scenarioId)) {
      return NextResponse.json({
        error: {
          code: "invalid_workflow_scenario_request",
          message: "The workflow scenario request was invalid.",
        },
      }, { status: 400 });
    }

    const session = await getRequiredCurrentAuthSession();
    const scan = createScanService().getScanStatus({ session });
    const senderGroups = Array.isArray(scan?.senderGroups) ? scan.senderGroups : [];

    if (!scan?.scanId || senderGroups.length === 0) {
      const error = new Error("Run a scan first so the scenario can use existing sender groups.");
      error.code = "workflow_scenario_scan_required";
      throw error;
    }

    const scenario = setWorkflowScenario({
      scanId: scan.scanId,
      scenarioId: body.scenarioId,
      senderOutcomes: buildWorkflowScenarioOutcomes(body.scenarioId, senderGroups),
      sessionId: session.id,
    });

    return NextResponse.json({
      lab: getDevLabPublicStatus(),
      scenario,
    });
  } catch (error) {
    const code = error.code || "workflow_scenario_update_failed";

    return NextResponse.json({
      error: {
        code,
        message: error.message || "The workflow scenario could not be updated.",
      },
    }, { status: errorStatus(code) });
  }
}
