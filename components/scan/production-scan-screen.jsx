"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";

import { SCAN_STATES } from "@/lib/scanning/constants";

import {
  ACTIVE_SCAN_STATES,
  derivePresentation,
  formatLabel,
  getGroupTitle,
  getUnsubscribeLabel,
} from "@/components/scan/production-scan-model";

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function getAttentionTone(attention) {
  if (attention === "HIGH") {
    return "border-[#f4c95d]/28 bg-[#f4c95d]/12 text-[#fbe9b2]";
  }

  if (attention === "MEDIUM") {
    return "border-cyan-300/24 bg-cyan-300/12 text-cyan-100";
  }

  return "border-white/10 bg-white/6 text-slate-300";
}

function getUnsubscribeTone(unsubscribe) {
  if (unsubscribe?.resolutionStatus === "ONE_CLICK_READY") {
    return "border-[#f4c95d]/24 bg-[#f4c95d]/12 text-[#fbe9b2]";
  }

  if (unsubscribe?.resolutionStatus === "MANUAL_ACTION_REQUIRED") {
    return "border-cyan-300/24 bg-cyan-300/12 text-cyan-100";
  }

  return "border-white/10 bg-white/6 text-slate-400";
}

function CounterBadge({ label, value }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <motion.span
        key={`${label}-${value}`}
        className="ml-2 text-sm font-semibold text-white"
        initial={{ opacity: 0.45, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        {value}
      </motion.span>
    </div>
  );
}

function ScanLens({ mode, reducedMotion }) {
  const active = mode === "scanning";

  return (
    <div className={classNames(
      "relative h-24 w-24 rounded-full border border-white/14 bg-[radial-gradient(circle_at_34%_34%,rgba(255,255,255,0.34),rgba(255,255,255,0.07)_38%,rgba(56,189,248,0.16)_62%,rgba(0,0,0,0)_76%)]",
      mode === "error"
        ? "shadow-[0_0_0_1px_rgba(251,113,133,0.22),0_14px_34px_rgba(0,0,0,0.18)]"
        : mode === "settled"
          ? "shadow-[0_0_0_1px_rgba(74,222,128,0.18),0_14px_34px_rgba(0,0,0,0.18)]"
          : "shadow-[0_14px_34px_rgba(0,0,0,0.18)]",
    )}>
      <div className="absolute inset-[14px] rounded-full border border-white/18" />
      <motion.div
        className="absolute left-[18px] right-[18px] h-px bg-[#f4c95d]/72"
        animate={reducedMotion
          ? { opacity: active ? 0.82 : 0.34, top: 46 }
          : active
            ? { opacity: [0.18, 0.92, 0.18], top: [24, 66, 24] }
            : { opacity: mode === "paused" ? 0.2 : 0.46, top: 46 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.74, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-[24px] rounded-full border border-cyan-300/24"
        animate={reducedMotion
          ? { opacity: 1, scale: 1 }
          : active
            ? { opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }
            : mode === "settled"
              ? { opacity: 1, scale: 1 }
              : { opacity: 0.55, scale: 1 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.42, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <div className="absolute bottom-[-20px] right-1 h-10 w-3 rotate-[-34deg] rounded-full bg-white/12" />
    </div>
  );
}

function SenderGroupCard({ group, reducedMotion, selected, onToggle }) {
  const title = getGroupTitle(group);
  const domainChips = group.senderDomains.slice(0, 2);

  return (
    <motion.button
      layout
      aria-pressed={selected}
      className={classNames(
        "w-full rounded-[26px] border bg-[rgba(8,14,25,0.86)] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.16)] transition-colors",
        selected ? "border-cyan-300/32" : "border-white/10",
      )}
      onClick={onToggle}
      type="button"
      whileTap={reducedMotion ? undefined : { scale: 0.99 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">sender group</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{group.representativeAddress || "Representative address unavailable"}</p>
        </div>
        <span className={classNames(
          "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
          selected ? "border-cyan-300/28 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/6 text-slate-300",
        )}>
          {selected ? "Selected" : "Selectable"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-200">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2">{group.messageCount} messages</span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2">{group.unreadCount} unread</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {group.category && group.category !== "UNKNOWN" ? (
          <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-100">
            {formatLabel(group.category)}
          </span>
        ) : null}
        {group.attention ? (
          <span className={classNames(
            "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
            getAttentionTone(group.attention),
          )}>
            {formatLabel(group.attention)} attention
          </span>
        ) : null}
        <span className={classNames(
          "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
          getUnsubscribeTone(group.unsubscribe),
        )}>
          {getUnsubscribeLabel(group.unsubscribe)}
        </span>
      </div>

      {domainChips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {domainChips.map((domain) => (
            <span key={`${group.id}-${domain}`} className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-300">
              {domain}
            </span>
          ))}
        </div>
      ) : null}
    </motion.button>
  );
}

async function readJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed.");
    error.code = payload?.error?.code || "request_failed";
    throw error;
  }

  return payload;
}

export function ProductionScanScreen({ authConfigured, autoAdvance = true, email, gmailAuthState, initialScan }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [scan, setScan] = useState(initialScan);
  const [errorMessage, setErrorMessage] = useState(null);
  const [requestState, setRequestState] = useState("idle");
  const [selectedIds, setSelectedIds] = useState([]);

  const senderGroups = scan?.senderGroups || [];
  const visibleSelectedIds = selectedIds.filter((id) => senderGroups.some((group) => group.id === id));
  const unreadTotal = senderGroups.reduce((sum, group) => sum + (group.unreadCount || 0), 0);
  const presentation = derivePresentation(scan, gmailAuthState);
  const activeScan = Boolean(scan && ACTIVE_SCAN_STATES.has(scan.state));

  useEffect(() => {
    if (!autoAdvance || !activeScan || requestState !== "idle") {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setRequestState("auto-resume");
        const payload = await readJson("/api/scan/resume", { method: "POST" });
        setScan(payload.scan);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error.message || "The scan could not continue.");
      } finally {
        setRequestState("idle");
      }
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeScan, autoAdvance, requestState]);

  async function refreshStatus() {
    try {
      const payload = await readJson("/api/scan/status");
      setScan(payload.scan);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error.message || "The latest scan status could not be loaded.");
    }
  }

  async function handleScanAction(actionType) {
    if (actionType === "gmail-upgrade") {
      router.push("/api/auth/google/gmail/start");
      return;
    }

    const pathByAction = {
      pause: "/api/scan/pause",
      resume: "/api/scan/resume",
      start: "/api/scan/start",
    };

    const target = pathByAction[actionType];

    if (!target) {
      return;
    }

    try {
      setRequestState(actionType);
      const payload = await readJson(target, { method: "POST" });
      setScan(payload.scan);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error.message || "The scan action could not be completed.");
    } finally {
      setRequestState("idle");
    }
  }

  function toggleSelection(groupId) {
    setSelectedIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  }

  if (!authConfigured) {
    return (
      <section className="rounded-[30px] border border-amber-300/22 bg-[rgba(23,17,7,0.78)] p-6 text-amber-100 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-200/80">Configuration required</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Add Google OAuth configuration before scanning can begin.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-50/85">
          The production scan surface is ready, but the Gmail-authenticated backend session must be configured before Pidgeot can start discovering sender groups.
        </p>
      </section>
    );
  }

  if (!email) {
    return (
      <section className="rounded-[30px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">Start here</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Connect your Google account to begin a real scan.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          Pidgeot scans Gmail metadata server-side, progressively groups messages by sender, and keeps partial discoveries visible while the scan continues.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950" href="/api/auth/google/start">Continue with Google</a>
          <Link className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white" href="/privacy">Privacy posture</Link>
          <Link className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white" href="/security">Security notes</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[32px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-6">
        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr] xl:items-start">
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/70">Phase 6B production scan</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">{presentation.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{presentation.body}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <CounterBadge label="Messages discovered" value={scan?.counters?.messagesNormalized || 0} />
              <CounterBadge label="Sender groups" value={senderGroups.length} />
              <CounterBadge label="Unread found" value={unreadTotal} />
              <CounterBadge label="Scan state" value={scan?.state ? formatLabel(scan.state) : "Not started"} />
            </div>

            <div className="flex flex-wrap gap-3">
              {presentation.actionLabel ? (
                <button
                  className={classNames(
                    "rounded-full px-5 py-3 text-sm font-semibold",
                    presentation.accent === "yellow"
                      ? "bg-[#f4c95d] text-slate-950"
                      : presentation.accent === "emerald"
                        ? "bg-emerald-300 text-slate-950"
                        : "bg-cyan-300 text-slate-950",
                  )}
                  disabled={requestState !== "idle"}
                  onClick={() => handleScanAction(presentation.actionType)}
                  type="button"
                >
                  {requestState === presentation.actionType ? "Working…" : presentation.actionLabel}
                </button>
              ) : null}
              <button
                className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white"
                disabled={requestState !== "idle"}
                onClick={refreshStatus}
                type="button"
              >
                Refresh status
              </button>
              <Link className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white" href="/privacy">Privacy posture</Link>
            </div>

            <AnimatePresence initial={false}>
              {errorMessage ? (
                <motion.div
                  key={errorMessage}
                  className="rounded-[22px] border border-rose-300/24 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                >
                  {errorMessage}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {scan?.state === SCAN_STATES.RESOURCE_LIMIT_REACHED && scan.resourceLimit ? (
              <div className="rounded-[22px] border border-[#f4c95d]/24 bg-[#f4c95d]/10 px-4 py-3 text-sm text-[#fbe9b2]">
                Scan stopped after {scan.resourceLimit.currentMessageCount} retained messages out of the current limit of {scan.resourceLimit.maxRetainedMessages}. Everything already discovered stays available below.
              </div>
            ) : null}

            {scan?.state === SCAN_STATES.PARTIAL_RESULTS_AVAILABLE ? (
              <div className="rounded-[22px] border border-cyan-300/24 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                Pidgeot has found results and is still scanning. Counts and sender groups below will keep updating while discovery continues.
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%),rgba(8,14,25,0.84)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Scan surface</p>
                <p className="mt-2 text-sm text-slate-300">Real mailbox discovery turns into real sender groups as the backend scan progresses.</p>
              </div>
              <ScanLens mode={presentation.visualMode} reducedMotion={reducedMotion} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[...senderGroups.slice(0, 4)].map((group) => (
                <motion.div
                  key={`preview-${group.id}-${group.messageCount}-${group.unreadCount}-${group.category}-${group.attention}`}
                  layout
                  className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4"
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.24 }}
                >
                  <p className="text-sm font-semibold text-white">{getGroupTitle(group)}</p>
                  <p className="mt-1 text-xs text-slate-400">{group.representativeAddress || "Address resolving"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span>{group.messageCount} messages</span>
                    <span>{group.unreadCount} unread</span>
                  </div>
                </motion.div>
              ))}
              {senderGroups.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/16 px-4 py-10 text-center text-sm text-slate-500 sm:col-span-2">
                  {scan ? "Pidgeot has not surfaced sender groups yet." : "Start a scan to begin discovering sender groups."}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/12 bg-[rgba(7,11,19,0.82)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] md:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
              {scan?.state === SCAN_STATES.COMPLETE ? "Ready" : "Discovery results"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              {scan?.state === SCAN_STATES.COMPLETE
                ? "Sender groups are ready for review."
                : "Sender groups appear here as soon as the backend discovers them."}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <CounterBadge label="Selected" value={visibleSelectedIds.length} />
            <CounterBadge label="Mailbox" value={email} />
          </div>
        </div>

        {scan?.state === SCAN_STATES.COMPLETE && senderGroups.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.76)] px-5 py-12 text-center">
            <p className="text-lg font-semibold text-white">Pidgeot completed the scan but did not find sender groups to review yet.</p>
            <p className="mt-2 text-sm text-slate-400">Try another scan later after new mail arrives.</p>
          </div>
        ) : (
          <LayoutGroup>
            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {senderGroups.map((group) => (
                  <motion.div
                    key={`${group.id}-${group.messageCount}-${group.unreadCount}-${group.category}-${group.attention}-${group.unsubscribe?.resolutionStatus}`}
                    layout
                    initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: reducedMotion ? 0 : 0.22 }}
                  >
                    <SenderGroupCard
                      group={group}
                      onToggle={() => toggleSelection(group.id)}
                      reducedMotion={reducedMotion}
                      selected={visibleSelectedIds.includes(group.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </section>
    </div>
  );
}