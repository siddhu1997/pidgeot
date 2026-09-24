import { getServerAppConfig } from "@/lib/config";
import { getActiveDevelopmentWorkflowScenario } from "@/lib/dev-lab/workflow-scenario";
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

export function buildScenarioActionResults(workflow, selections = []) {
  const groups = new Map((workflow?.scan?.senderGroups || []).map((group) => [group.id, group]));

  return selections.map((selection) => {
    const group = groups.get(selection.senderGroupId);
    const result = {
      senderGroupId: selection.senderGroupId,
    };

    if (selection.actions?.unsubscribe) {
      result.unsubscribeExecution = group?.workflow?.unsubscribeExecution?.execution || null;
    }

    if (selection.actions?.cleanup) {
      result.cleanupExecution = group?.workflow?.cleanupExecution?.execution || null;
    }

    return result;
  });
}
