import { getServerAppConfig } from "@/lib/config";
import { getActiveDevelopmentWorkflowScenario } from "@/lib/dev-lab/workflow-scenario";
import { clearWorkflowScenario } from "@/lib/dev-lab/workflow-scenario-store";
import { createScanService } from "@/lib/scanning/scanner";
import { createWorkflowService } from "@/lib/workflow/service";

export function readActiveDevelopmentWorkflowScenario(session) {
  if (getServerAppConfig().isProduction || !session?.id) {
    return null;
  }

  const scan = createScanService().getScanStatus({ session });

  return getActiveDevelopmentWorkflowScenario({
    scanId: scan?.scanId,
    sessionId: session.id,
  });
}

export function getDevelopmentScenarioWorkflow(session) {
  if (!readActiveDevelopmentWorkflowScenario(session)) {
    return null;
  }

  return createWorkflowService().getWorkflowStatus({ session });
}

export function recoverDevelopmentWorkflowScenario(session) {
  if (getServerAppConfig().isProduction) {
    return null;
  }

  const scenario = readActiveDevelopmentWorkflowScenario(session);

  if (!scenario) {
    return null;
  }

  clearWorkflowScenario();
  return createWorkflowService().getWorkflowStatus({ session });
}
