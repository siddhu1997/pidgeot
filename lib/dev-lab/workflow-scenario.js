import { getServerAppConfig } from "@/lib/config";
import { SCAN_PAUSE_REASONS, SCAN_STATES } from "@/lib/scanning/constants";
import {
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";
import {
  WORKFLOW_BLOCKING_REASONS,
  WORKFLOW_EXECUTION_STATES,
} from "@/lib/workflow/constants";
import {
  getWorkflowScenario,
  WORKFLOW_SCENARIO_IDS,
} from "@/lib/dev-lab/workflow-scenario-store";

export function buildWorkflowScenarioOutcomes(scenarioId, senderGroups = []) {
  const senderIds = [...senderGroups]
    .map((group) => group?.id)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (scenarioId === WORKFLOW_SCENARIO_IDS.PARTIAL_SUCCESS) {
    return Object.fromEntries(senderIds.map((id, index) => [
      id,
      index === 1 ? WORKFLOW_SCENARIO_IDS.FAILED_RETRYABLE : WORKFLOW_SCENARIO_IDS.COMPLETED,
    ]));
  }

  return Object.fromEntries(senderIds.map((id) => [id, scenarioId]));
}

function createExecutionShell({ blockingReason = null, execution, state }) {
  return {
    blockingReason,
    execution,
    phase: null,
    queuePosition: null,
    queueSize: null,
    requestedAt: Date.now(),
    simulated: true,
    state,
  };
}

function createUnsubscribeExecution({ operationResults, status, summary }) {
  return {
    operationResults,
    senderGroupId: null,
    status,
    summary,
  };
}

function buildOutcomeOverlay(outcome, group) {
  const operationId = `scenario_${group.id}`;

  if (outcome === WORKFLOW_SCENARIO_IDS.COMPLETED) {
    return {
      manualUnsubscribeOperations: [],
      unsubscribeAutomaticOperationCount: 0,
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS,
          }],
          status: "ALL_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 1,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.COMPLETED,
      }),
      unsubscribeHandledLocally: true,
      unsubscribeOperationsAvailable: false,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.ALREADY_COMPLETED) {
    return {
      manualUnsubscribeOperations: [],
      unsubscribeAutomaticOperationCount: 0,
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED,
          }],
          status: "ALL_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 1,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.COMPLETED,
      }),
      unsubscribeHandledLocally: true,
      unsubscribeOperationsAvailable: false,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.FAILED_RETRYABLE) {
    return {
      unsubscribeAutomaticOperationCount: Math.max(group?.workflow?.unsubscribeAutomaticOperationCount || 1, 1),
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.FAILED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: true,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.FAILED_PERMANENT) {
    return {
      unsubscribeAutomaticOperationCount: 0,
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.FAILED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: false,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.PAUSED) {
    return {
      unsubscribeAutomaticOperationCount: Math.max(group?.workflow?.unsubscribeAutomaticOperationCount || 1, 1),
      unsubscribeExecution: createExecutionShell({
        blockingReason: WORKFLOW_BLOCKING_REASONS.PAUSED,
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.PAUSED,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.PAUSED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: true,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.LEASE_EXPIRED) {
    return {
      unsubscribeAutomaticOperationCount: Math.max(group?.workflow?.unsubscribeAutomaticOperationCount || 1, 1),
      unsubscribeExecution: createExecutionShell({
        blockingReason: WORKFLOW_BLOCKING_REASONS.LEASE_EXPIRED,
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.PAUSED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: true,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.REAUTH_REQUIRED) {
    return {
      cleanupExecution: createExecutionShell({
        execution: null,
        state: WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED,
      }),
      unsubscribeAutomaticOperationCount: Math.max(group?.workflow?.unsubscribeAutomaticOperationCount || 1, 1),
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 0,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: true,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.USAGE_LIMIT_REACHED) {
    return {
      unsubscribeAutomaticOperationCount: Math.max(group?.workflow?.unsubscribeAutomaticOperationCount || 1, 1),
      unsubscribeExecution: createExecutionShell({
        blockingReason: WORKFLOW_BLOCKING_REASONS.USAGE_LIMIT_REACHED,
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.USAGE_LIMIT_REACHED,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.FAILED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: true,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.MANUAL_ACTION_REQUIRED) {
    return {
      manualUnsubscribeOperations: [{
        host: "example.com",
        id: `scenario_manual_${group.id}`,
        path: "/unsubscribe",
        status: UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED,
        target: "https://example.com/unsubscribe",
        type: UNSUBSCRIBE_OPERATION_TYPES.HTTPS_LINK,
      }],
      unsubscribe: {
        ...(group.unsubscribe || {}),
        resolutionStatus: "MANUAL_ACTION_REQUIRED",
      },
      unsubscribeAutomaticOperationCount: 0,
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.HTTPS_LINK,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED,
          }],
          status: "MANUAL_ACTION_REQUIRED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 1,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: false,
    };
  }

  if (outcome === WORKFLOW_SCENARIO_IDS.UNSAFE_TARGET) {
    return {
      manualUnsubscribeOperations: [],
      unsubscribe: {
        ...(group.unsubscribe || {}),
        mechanisms: [],
        resolutionStatus: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      },
      unsubscribeAutomaticOperationCount: 0,
      unsubscribeExecution: createExecutionShell({
        execution: createUnsubscribeExecution({
          operationResults: [{
            completedAt: Date.now(),
            operationId,
            operationType: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
            retryAfterMs: null,
            status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET,
          }],
          status: "NONE_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            manualCount: 0,
            successfulCount: 0,
            totalOperationCount: 1,
          },
        }),
        state: WORKFLOW_EXECUTION_STATES.FAILED,
      }),
      unsubscribeHandledLocally: false,
      unsubscribeOperationsAvailable: false,
    };
  }

  return null;
}

function overlayScanPresentation(scan, scenarioId) {
  if (!scan) {
    return scan;
  }

  if (scenarioId === WORKFLOW_SCENARIO_IDS.LEASE_EXPIRED) {
    return {
      ...scan,
      pauseReason: SCAN_PAUSE_REASONS.LEASE_EXPIRED,
      state: SCAN_STATES.PAUSED,
    };
  }

  if (scenarioId === WORKFLOW_SCENARIO_IDS.PAUSED) {
    return {
      ...scan,
      pauseReason: SCAN_PAUSE_REASONS.USER_REQUESTED,
      state: SCAN_STATES.PAUSED,
    };
  }

  return scan;
}

export function getActiveDevelopmentWorkflowScenario({ scanId, sessionId } = {}) {
  if (getServerAppConfig().isProduction) {
    return null;
  }

  const scenario = getWorkflowScenario();

  if (!scenario || !sessionId || scenario.sessionId !== sessionId) {
    return null;
  }

  if (scanId && scenario.scanId !== scanId) {
    return null;
  }

  return scenario;
}

export function applyDevelopmentWorkflowScenario(workflow, { sessionId } = {}) {
  if (getServerAppConfig().isProduction) {
    return workflow;
  }

  const scenario = getWorkflowScenario();

  if (!scenario || !workflow?.scan || scenario.sessionId !== sessionId || scenario.scanId !== workflow.scan.scanId) {
    return workflow;
  }

  const senderGroups = (workflow.scan.senderGroups || []).map((group) => {
    const outcome = scenario.senderOutcomes?.[group.id];
    const overlay = outcome ? buildOutcomeOverlay(outcome, group) : null;

    if (!overlay) {
      return group;
    }

    const { cleanupExecution, unsubscribe, ...workflowOverlay } = overlay;
    const nextGroup = {
      ...group,
      unsubscribe: unsubscribe || group.unsubscribe,
      workflow: {
        ...(group.workflow || {}),
        ...workflowOverlay,
        cleanupExecution: cleanupExecution || group.workflow?.cleanupExecution,
      },
    };

    if (Object.hasOwn(overlay, "manualUnsubscribeOperations")) {
      nextGroup.manualUnsubscribeOperations = overlay.manualUnsubscribeOperations;
    }

    return nextGroup;
  });

  return {
    ...workflow,
    developmentWorkflowScenario: {
      scanId: scenario.scanId,
      scenarioId: scenario.scenarioId,
    },
    scan: overlayScanPresentation({
      ...workflow.scan,
      senderGroups,
    }, scenario.scenarioId),
  };
}
