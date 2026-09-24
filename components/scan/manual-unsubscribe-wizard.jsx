"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { getGroupTitle } from "@/components/scan/production-scan-model";

const HANDLED_AUTO_ADVANCE_SECONDS = 5;
const CAPTURED_MAIL_PREVIEW_LIMIT = 3;

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatManualUnsubscribeMethod(operation) {
  if (operation?.type === "MAILTO") {
    return "Preaddressed unsubscribe email";
  }

  if (operation?.type === "HTTPS_LINK") {
    return "Manual unsubscribe page";
  }

  if (operation?.type === "HTTP_LINK") {
    return "Manual unsubscribe link";
  }

  return operation?.type || "Manual action required";
}

function getManualUnsubscribeReason(operation) {
  if (operation?.type === "MAILTO") {
    return "Pidgeot found a mailto unsubscribe address, which still needs a manual email step.";
  }

  if (operation?.type === "HTTPS_LINK") {
    return "Pidgeot found an unsubscribe page, but it is not a one-click request that Pidgeot can submit automatically.";
  }

  if (operation?.type === "HTTP_LINK") {
    return "Pidgeot found a web unsubscribe link that is not an automatic one-click HTTPS request, so it stays manual.";
  }

  return "Pidgeot found an unsubscribe option, but it still requires a manual action.";
}

function getManualUnsubscribeOperations(group) {
  if (Array.isArray(group?.workflow?.manualUnsubscribeOperations) && group.workflow.manualUnsubscribeOperations.length > 0) {
    return group.workflow.manualUnsubscribeOperations;
  }

  return Array.isArray(group?.manualUnsubscribeOperations) ? group.manualUnsubscribeOperations : [];
}

function getCapturedMessages(group) {
  return Array.isArray(group?.capturedMessages) ? group.capturedMessages : [];
}

function formatMessageDate(message) {
  if (message?.date) {
    return message.date;
  }

  if (Number.isFinite(message?.internalDate)) {
    return new Date(message.internalDate).toLocaleString();
  }

  return null;
}

function HandledAutoAdvanceNotice({ reducedMotion, secondsRemaining }) {
  const remaining = Number.isFinite(secondsRemaining)
    ? secondsRemaining
    : HANDLED_AUTO_ADVANCE_SECONDS;
  const remainingRatio = remaining / HANDLED_AUTO_ADVANCE_SECONDS;

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-sm font-medium text-cyan-100">Already handled</p>
      <p aria-live="polite" className="mt-1 text-xs leading-5 text-slate-400">
        {`Moving to the next sender in ${remaining}s`}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-cyan-300/70"
          animate={{ width: `${Math.max(0, remainingRatio) * 100}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.35, ease: "linear" }}
        />
      </div>
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-7 w-48 animate-pulse rounded-full bg-white/8" />
      <div className="h-4 w-64 animate-pulse rounded-full bg-white/6" />
      <div className="h-20 rounded-[22px] bg-white/5">
        <div className="h-full w-2/3 animate-pulse rounded-[22px] bg-white/6" />
      </div>
      <div className="h-28 rounded-[22px] bg-white/5" />
    </div>
  );
}

function getCapturedMailPreviewSummary(capturedCount) {
  if (capturedCount <= CAPTURED_MAIL_PREVIEW_LIMIT) {
    return null;
  }

  return `${formatCount(CAPTURED_MAIL_PREVIEW_LIMIT)} messages shown · ${formatCount(capturedCount - CAPTURED_MAIL_PREVIEW_LIMIT)} more in this group`;
}

function getCapturedMailGroupSummary({ groupMessageCount, unreadCount }) {
  if (!Number.isFinite(groupMessageCount)) {
    return null;
  }

  return `${formatCount(groupMessageCount)} messages in this group${
    Number.isFinite(unreadCount) ? ` · ${formatCount(unreadCount)} unread` : ""
  }`;
}

function SenderMessageList({ messages }) {
  const previewMessages = messages.slice(0, CAPTURED_MAIL_PREVIEW_LIMIT);

  if (previewMessages.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {`${formatCount(0)} captured messages are available for this sender in the current scan.`}
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      {previewMessages.map((message) => {
        const subject = message.subject || "Subject unavailable";

        return (
          <div key={message.id} className="min-w-0 overflow-hidden rounded-[18px] border border-white/8 bg-[rgba(7,11,19,0.72)] px-3 py-2.5">
            <p className="min-w-0 truncate text-sm font-medium text-white" title={subject}>
              {subject}
            </p>
            <p className="mt-1 min-w-0 truncate text-xs text-slate-400">
              {[
                formatMessageDate(message),
                message.unread ? "Unread" : null,
                message.source === "TRASH" ? "Trash" : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function ManualUnsubscribeWizard({
  groups,
  mode = "wizard",
  onClose,
  onMarkHandled,
  previouslyHandledIds,
  reducedMotion,
}) {
  const isWizard = mode === "wizard";
  const closeButtonRef = useRef(null);
  const sequence = useMemo(() => groups.filter(Boolean), [groups]);
  const [index, setIndex] = useState(0);
  const [handledIds, setHandledIds] = useState(() => new Set());
  const [skippedIds, setSkippedIds] = useState(() => new Set());
  const [reviewingAgainIds, setReviewingAgainIds] = useState(() => new Set());
  const [reviewFinished, setReviewFinished] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [autoAdvanceSecondsRemaining, setAutoAdvanceSecondsRemaining] = useState(null);
  const transitionTimerRef = useRef(null);
  const autoAdvanceTimerRef = useRef(null);
  const autoAdvanceTokenRef = useRef(0);
  const indexRef = useRef(0);
  const totalCountRef = useRef(0);

  const currentGroup = sequence[index] || null;
  const totalCount = sequence.length;
  const handledCount = handledIds.size;
  const skippedCount = [...skippedIds].filter((id) => !previouslyHandledIds.has(id)).length;
  const alreadyHandledCount = [...skippedIds].filter((id) => previouslyHandledIds.has(id) && !handledIds.has(id)).length;
  const resolvedCount = handledCount + skippedIds.size;
  const complete = reviewFinished || (totalCount > 0 && resolvedCount >= totalCount);
  const currentId = currentGroup?.id;
  const currentHandled = Boolean(currentId && handledIds.has(currentId));
  const currentSkipped = Boolean(currentId && skippedIds.has(currentId));
  const currentPreviouslyHandled = Boolean(currentId && previouslyHandledIds.has(currentId));
  const showingPreviouslyHandledPrompt = currentPreviouslyHandled && !reviewingAgainIds.has(currentId) && !currentHandled;
  const shouldAutoAdvance = Boolean(isWizard && !complete && currentId && currentHandled);
  const countdownSeconds = shouldAutoAdvance
    ? (autoAdvanceSecondsRemaining ?? HANDLED_AUTO_ADVANCE_SECONDS)
    : null;
  const operations = currentGroup ? getManualUnsubscribeOperations(currentGroup) : [];
  const capturedMessages = currentGroup ? getCapturedMessages(currentGroup) : [];
  const capturedMailPreviewSummary = getCapturedMailPreviewSummary(capturedMessages.length);
  const capturedMailGroupSummary = currentGroup
    ? getCapturedMailGroupSummary({
      groupMessageCount: currentGroup.messageCount,
      unreadCount: currentGroup.unreadCount,
    })
    : null;

  const cancelAutoAdvance = useCallback(() => {
    autoAdvanceTokenRef.current += 1;

    if (autoAdvanceTimerRef.current) {
      window.clearInterval(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    setAutoAdvanceSecondsRemaining(null);
  }, []);

  function handleClose() {
    cancelAutoAdvance();
    onClose();
  }

  const goToIndex = useCallback((nextIndex) => {
    cancelAutoAdvance();

    const currentIndex = indexRef.current;
    const total = totalCountRef.current;

    if (nextIndex < 0 || nextIndex >= total || nextIndex === currentIndex) {
      return;
    }

    setIndex(nextIndex);

    if (reducedMotion) {
      setTransitioning(false);
      return;
    }

    setTransitioning(true);

    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }

    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioning(false);
    }, 160);
  }, [cancelAutoAdvance, reducedMotion]);

  function advanceFromCurrent() {
    const currentIndex = indexRef.current;
    const total = totalCountRef.current;

    if (currentIndex < total - 1) {
      goToIndex(currentIndex + 1);
      return;
    }

    cancelAutoAdvance();
    setReviewFinished(true);
  }

  function markCurrentHandled() {
    if (!currentId || currentHandled) {
      return;
    }

    setHandledIds((current) => new Set(current).add(currentId));
    setSkippedIds((current) => {
      const next = new Set(current);
      next.delete(currentId);
      return next;
    });
    onMarkHandled?.(currentGroup);

    if (isWizard) {
      advanceFromCurrent();
    }
  }

  useEffect(() => {
    indexRef.current = index;
    totalCountRef.current = totalCount;
  }, [index, totalCount]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAutoAdvance();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cancelAutoAdvance, onClose]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
      if (autoAdvanceTimerRef.current) {
        window.clearInterval(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoAdvance) {
      return undefined;
    }

    const token = autoAdvanceTokenRef.current + 1;
    autoAdvanceTokenRef.current = token;
    let remaining = HANDLED_AUTO_ADVANCE_SECONDS;

    const intervalId = window.setInterval(() => {
      if (autoAdvanceTokenRef.current !== token) {
        window.clearInterval(intervalId);
        return;
      }

      remaining -= 1;

      if (remaining <= 0) {
        window.clearInterval(intervalId);
        if (autoAdvanceTimerRef.current === intervalId) {
          autoAdvanceTimerRef.current = null;
        }

        const currentIndex = indexRef.current;
        const total = totalCountRef.current;

        if (currentIndex < total - 1) {
          goToIndex(currentIndex + 1);
        } else {
          cancelAutoAdvance();
          setReviewFinished(true);
        }
        return;
      }

      setAutoAdvanceSecondsRemaining(remaining);
    }, 1000);

    autoAdvanceTimerRef.current = intervalId;

    return () => {
      window.clearInterval(intervalId);
      if (autoAdvanceTimerRef.current === intervalId) {
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [cancelAutoAdvance, currentId, goToIndex, shouldAutoAdvance]);

  function skipCurrent() {
    if (!currentId || currentHandled) {
      return;
    }

    setSkippedIds((current) => new Set(current).add(currentId));

    if (index < totalCount - 1) {
      goToIndex(index + 1);
    }
  }

  function reviewCurrentAgain() {
    if (!currentId) {
      return;
    }

    setReviewingAgainIds((current) => new Set(current).add(currentId));
  }

  return (
    <AnimatePresence>
      <motion.div
        key="manual-unsubscribe-backdrop"
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[rgba(2,6,12,0.72)] backdrop-blur-[2px]"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0 }}
        onClick={handleClose}
      />
      <motion.section
        key="manual-unsubscribe-dialog"
        aria-labelledby="manual-unsubscribe-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,calc(100vw-2rem))] min-w-0 -translate-x-1/2 -translate-y-1/2 flex-col overflow-x-hidden rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.98)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        transition={{ duration: reducedMotion ? 0 : 0.2 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Manual unsubscribe</p>
            <h3 id="manual-unsubscribe-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              {complete ? "Manual unsubscribe cleanup complete" : "Clear these senders"}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isWizard && !complete ? (
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-400">
                {`${index + 1} / ${totalCount}`}
              </p>
            ) : null}
            <button
              className="rounded-2xl border border-white/12 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
              onClick={handleClose}
              ref={closeButtonRef}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        {isWizard ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>{complete ? "Finished this review" : `${formatCount(handledCount)} marked as handled`}</span>
              <span>{`${formatCount(handledCount)} / ${formatCount(totalCount)}`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full bg-cyan-300/80"
                animate={{ width: `${totalCount > 0 ? (handledCount / totalCount) * 100 : 0}%` }}
                transition={{ duration: reducedMotion ? 0 : 0.22 }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
          {complete ? (
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="text-lg font-semibold text-white">These senders have been reviewed.</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {[
                  handledCount > 0 ? `${formatCount(handledCount)} handled` : null,
                  skippedCount > 0 ? `${formatCount(skippedCount)} skipped` : null,
                  alreadyHandledCount > 0 ? `${formatCount(alreadyHandledCount)} already handled` : null,
                ].filter(Boolean).join(" · ") || "Nothing was marked in this review."}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Pidgeot hasn&apos;t verified whether any external unsubscribe request took effect.
              </p>
            </div>
          ) : transitioning ? (
            <WizardSkeleton />
          ) : currentGroup ? (
            <div className="min-w-0 space-y-4">
              <div className="min-w-0">
                <p className="min-w-0 truncate text-lg font-semibold text-white">{getGroupTitle(currentGroup)}</p>
                <p className="mt-1 min-w-0 truncate text-sm text-slate-400">{currentGroup.representativeAddress || "Representative address unavailable"}</p>
              </div>

              {showingPreviouslyHandledPrompt ? (
                <div className="rounded-[24px] border border-[#f4c95d]/20 bg-[#f4c95d]/8 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#fbe9b2]">Previously handled</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    This sender was already handled in Pidgeot. You&apos;re seeing it again because it was discovered in a new scan.
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Pidgeot hasn&apos;t verified whether the external unsubscribe request took effect.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-2xl border border-white/12 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
                      onClick={reviewCurrentAgain}
                      type="button"
                    >
                      Review again
                    </button>
                    <button
                      className="rounded-2xl border border-cyan-300/24 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors duration-200 hover:border-cyan-300/36 hover:bg-cyan-300/16"
                      onClick={skipCurrent}
                      type="button"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {currentPreviouslyHandled ? (
                    <p className="text-xs leading-5 text-slate-400">
                      This sender was already handled in Pidgeot. It appears again because it was found in a new scan. Pidgeot hasn&apos;t verified whether the external unsubscribe request took effect.
                    </p>
                  ) : null}

                  <p className="text-sm leading-6 text-slate-300">Automatic unsubscribe is unavailable for this sender.</p>

                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Captured mail</p>
                    <div className="mt-2 min-w-0">
                      <SenderMessageList messages={capturedMessages} />
                    </div>
                    {capturedMailPreviewSummary ? (
                      <p className="mt-2 text-xs text-slate-500">{capturedMailPreviewSummary}</p>
                    ) : null}
                    {capturedMailGroupSummary ? (
                      <p className="mt-2 text-xs text-slate-500">{capturedMailGroupSummary}</p>
                    ) : null}
                  </div>

                  <div className="grid min-w-0 gap-3">
                    {operations.length > 0 ? operations.map((operation) => (
                      <div key={operation.id} className="min-w-0 overflow-hidden rounded-[20px] border border-white/10 bg-white/5 p-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Unsubscribe method</p>
                        <p className="mt-1 font-medium text-white">{formatManualUnsubscribeMethod(operation)}</p>
                        {operation.mailto?.recipient ? (
                          <p className="mt-2 min-w-0 truncate text-sm text-slate-300">{operation.mailto.recipient}</p>
                        ) : null}
                        {operation.host ? (
                          <p className="mt-2 min-w-0 break-all text-sm text-slate-300">{`${operation.host}${operation.path || ""}`}</p>
                        ) : null}
                        <p className="mt-2 text-xs leading-5 text-slate-400">{getManualUnsubscribeReason(operation)}</p>
                        {operation.type === "HTTPS_LINK" && operation.target ? (
                          <a
                            className="mt-3 inline-flex rounded-2xl border border-cyan-300/24 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors duration-200 hover:border-cyan-300/36 hover:bg-cyan-300/16"
                            href={operation.target}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open unsubscribe page
                          </a>
                        ) : null}
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400">No safe unsubscribe details are available for this sender in the current scan.</p>
                    )}
                  </div>

                  {currentHandled && isWizard ? (
                    <HandledAutoAdvanceNotice
                      reducedMotion={reducedMotion}
                      secondsRemaining={countdownSeconds}
                    />
                  ) : currentHandled ? (
                    <p className="text-sm text-cyan-100">Marked as handled. Pidgeot has not verified the external request.</p>
                  ) : currentSkipped ? (
                    <p className="text-sm text-slate-400">Skipped for this review.</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        {!complete ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {isWizard ? (
              <button
                className={classNames(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors duration-200",
                  index === 0
                    ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
                    : "border-white/12 text-white hover:border-white/24 hover:bg-white/8",
                )}
                disabled={index === 0}
                onClick={() => goToIndex(index - 1)}
                type="button"
              >
                ← Previous
              </button>
            ) : null}
            {!showingPreviouslyHandledPrompt && !currentHandled ? (
              <button
                className="rounded-2xl border border-[#f4c95d]/40 bg-[#f4c95d] px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:border-[#f7d77d] hover:bg-[#f7d77d]"
                onClick={markCurrentHandled}
                type="button"
              >
                Mark as handled
              </button>
            ) : null}
            {isWizard ? (
              <button
                className={classNames(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors duration-200",
                  index >= totalCount - 1
                    ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
                    : "border-white/12 text-white hover:border-white/24 hover:bg-white/8",
                )}
                disabled={index >= totalCount - 1}
                onClick={() => goToIndex(index + 1)}
                type="button"
              >
                Next →
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 flex justify-center">
            <button
              className="rounded-2xl border border-[#f4c95d]/40 bg-[#f4c95d] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:border-[#f7d77d] hover:bg-[#f7d77d]"
              onClick={handleClose}
              type="button"
            >
              Back to senders
            </button>
          </div>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
