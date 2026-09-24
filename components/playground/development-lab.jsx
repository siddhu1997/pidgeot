"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DEV_LAB_CATEGORY_PROFILES,
  DEV_LAB_LIMITS,
  DEV_LAB_UNSUBSCRIBE_PROFILES,
} from "@/lib/dev-lab/constants";

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function getGenerateButtonLabel(requestState, sendProgress) {
  if (requestState !== "generating") {
    return "Generate promotional mail";
  }

  if (!sendProgress || sendProgress.phase === "starting") {
    return "Starting…";
  }

  return `Sending ${sendProgress.processedCount} / ${sendProgress.requestedCount}`;
}

function getSendProgressLabel(sendProgress) {
  if (!sendProgress || sendProgress.phase === "starting") {
    return "Queued — starting send";
  }

  if (sendProgress.phase === "failed") {
    return `Failed ${sendProgress.sentCount} / ${sendProgress.requestedCount}`;
  }

  if (sendProgress.phase === "completed") {
    return `Sent ${sendProgress.sentCount} / ${sendProgress.requestedCount}`;
  }

  return `Sending ${sendProgress.processedCount} / ${sendProgress.requestedCount}`;
}

function getSendProgressPercent(sendProgress) {
  if (!sendProgress?.requestedCount) {
    return 0;
  }

  return Math.min(100, Math.round((sendProgress.processedCount / sendProgress.requestedCount) * 100));
}

function Field({ children, hint, label }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClassName = "h-11 rounded-2xl border border-white/12 bg-[rgba(7,11,19,0.92)] px-3 text-sm text-white outline-none";

export function DevelopmentLab({ initialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [senderCount, setSenderCount] = useState(DEV_LAB_LIMITS.DEFAULT_SENDER_COUNT);
  const [messagesPerSender, setMessagesPerSender] = useState(DEV_LAB_LIMITS.DEFAULT_MESSAGES_PER_SENDER);
  const [unreadRatio, setUnreadRatio] = useState(DEV_LAB_LIMITS.DEFAULT_UNREAD_RATIO);
  const [unsubscribeProfile, setUnsubscribeProfile] = useState(DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK);
  const [categoryProfile, setCategoryProfile] = useState(DEV_LAB_CATEGORY_PROFILES.PROMOTIONAL);
  const [seed, setSeed] = useState(DEV_LAB_LIMITS.DEFAULT_SEED);
  const [requestState, setRequestState] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);
  const [generation, setGeneration] = useState(null);
  const [sendProgress, setSendProgress] = useState(null);

  const requestedTotal = senderCount * messagesPerSender;
  const hardLimit = status?.limits?.maxMessagesPerGeneration || DEV_LAB_LIMITS.MAX_TOTAL_MESSAGES;
  const exceedsHardLimit = requestedTotal > hardLimit;
  const sendableTotal = exceedsHardLimit ? hardLimit : requestedTotal;
  const deliveryEnabled = Boolean(status?.mailDeliveryEnabled);
  const brevoReady = Boolean(status?.providers?.brevo?.configured);
  const mailgunReady = Boolean(status?.providers?.mailgun?.configured);

  const scanFacts = useMemo(() => ([
    ["Production scan ceiling", status?.scan?.productionCeiling ?? "—"],
    ["Development scan ceiling", status?.scan?.developmentCeiling ?? "—"],
    ["Development page size", status?.scan?.pageSize ?? "—"],
  ]), [status]);

  async function refreshStatus() {
    const response = await fetch("/api/dev-lab/status");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || "The Development Lab status could not be loaded.");
    }

    setStatus(payload.lab);
  }

  useEffect(() => {
    if (requestState !== "generating") {
      return undefined;
    }

    let cancelled = false;

    async function pollProgress() {
      try {
        const response = await fetch("/api/dev-lab/status");
        const payload = await response.json();

        if (!response.ok || cancelled) {
          return;
        }

        setStatus(payload.lab);
        if (payload.lab?.sendProgress) {
          setSendProgress(payload.lab.sendProgress);
        }
      } catch {
        return;
      }
    }

    pollProgress();
    const timer = window.setInterval(pollProgress, 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [requestState]);

  async function handleGenerate(event) {
    event.preventDefault();
    setRequestState("generating");
    setErrorMessage(null);
    setSendProgress({
      ambiguousCount: 0,
      failedCount: 0,
      phase: "starting",
      processedCount: 0,
      requestedCount: sendableTotal,
      sentCount: 0,
    });

    try {
      const response = await fetch("/api/dev-lab/generate", {
        body: JSON.stringify({
          categoryProfile,
          messagesPerSender,
          seed,
          senderCount,
          unreadRatio,
          unsubscribeProfile,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message || "Generation failed.");
      }

      setGeneration(payload.generation);
      setSendProgress({
        ambiguousCount: payload.generation.ambiguousCount || 0,
        failedCount: payload.generation.failedCount || 0,
        phase: payload.generation.status === "failed" ? "failed" : "completed",
        processedCount: payload.generation.requestedCount || 0,
        requestedCount: payload.generation.requestedCount || 0,
        sentCount: payload.generation.sentCount || 0,
      });
      await refreshStatus();
    } catch (error) {
      setErrorMessage(error.message || "Generation failed.");
      setSendProgress((current) => (
        current
          ? { ...current, phase: "failed" }
          : current
      ));
    } finally {
      setRequestState("idle");
    }
  }

  return (
    <main className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1100px] gap-4">
        <section className="rounded-[28px] border border-amber-300/20 bg-[rgba(23,17,7,0.84)] px-5 py-5 md:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#f4c95d]">Development Lab</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Controlled Gmail test data.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            This surface is development-only. It generates synthetic mail, delivers it through Brevo or Mailgun, and
            leaves production Gmail OAuth, grouping, and execution unchanged.
          </p>
          <p className={classNames(
            "mt-4 rounded-2xl border px-4 py-3 text-sm",
            deliveryEnabled
              ? "border-amber-300/24 bg-amber-300/10 text-[#fbe9b2]"
              : "border-white/10 bg-white/4 text-slate-300",
          )}>
            {deliveryEnabled
              ? `Development mail delivery is enabled. Messages will be sent to the configured test inbox${status?.recipientMasked ? ` (${status.recipientMasked})` : ""}.`
              : "Development mail delivery is disabled or no provider is fully configured. Generation will not send mail."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-200" href="/">
              Open production scan
            </Link>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">A. Scan</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Current scan ceilings</h2>
            <p className="mt-1 text-sm text-slate-400">Read from the server environment. These are not editable here.</p>
            <dl className="mt-4 grid gap-3">
              {scanFacts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">B. Execution</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Future execution modes</h2>
            <p className="mt-1 text-sm text-slate-400">
              This phase does not activate real unsubscribe or delete execution. Both remain simulated.
            </p>
            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              <p>Unsubscribe mode: <span className="font-semibold text-white">{status?.unsubscribeMode || "simulation"}</span></p>
              <p>Delete unread mode: <span className="font-semibold text-white">{status?.deleteUnreadMode || "simulation"}</span></p>
            </div>
          </article>
        </section>

        <form className="grid gap-4" onSubmit={handleGenerate}>
          <section className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">1. Delivery</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Brevo first, Mailgun on transient failure</h2>
            <p className="mt-1 text-sm text-slate-400">
              From addresses stay on {status?.fromDomain || "the authenticated development domain"}. Credentials stay on the server.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
                <dt className="text-slate-400">Brevo</dt>
                <dd className="mt-1 font-semibold text-white">{brevoReady ? "Configured" : "Not configured"}</dd>
              </div>
              <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
                <dt className="text-slate-400">Mailgun</dt>
                <dd className="mt-1 font-semibold text-white">{mailgunReady ? "Configured" : "Not configured"}</dd>
              </div>
            </dl>
            {generation ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Current run</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {generation.sentCount} sent · {generation.failedCount} failed · {generation.ambiguousCount || 0} ambiguous
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Requested {generation.requestedCount} · generated {generation.generatedCount || generation.messageCount}
                  {generation.failoverCount ? ` · ${generation.failoverCount} failovers` : ""}
                  {generation.providersUsed?.length ? ` · ${generation.providersUsed.join(" → ")}` : ""}
                </p>
                <p className="mt-2 text-sm text-slate-400">{generation.message}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">2. Dataset</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Deterministic senders</h2>
            <p className="mt-1 text-sm text-slate-400">
              Hard limits: {DEV_LAB_LIMITS.MAX_SENDER_COUNT} senders, {DEV_LAB_LIMITS.MAX_MESSAGES_PER_SENDER} each,
              {` ${hardLimit}`} total.
            </p>
            <div className="mt-5 grid grid-cols-1 items-start gap-x-4 gap-y-4 md:grid-cols-2">
              <Field label="Unique senders">
                <input
                  className={`${inputClassName} w-full`}
                  max={DEV_LAB_LIMITS.MAX_SENDER_COUNT}
                  min={DEV_LAB_LIMITS.MIN_SENDER_COUNT}
                  onChange={(event) => setSenderCount(Number(event.target.value))}
                  type="number"
                  value={senderCount}
                />
              </Field>
              <Field label="Messages per sender">
                <input
                  className={`${inputClassName} w-full`}
                  max={DEV_LAB_LIMITS.MAX_MESSAGES_PER_SENDER}
                  min={DEV_LAB_LIMITS.MIN_MESSAGES_PER_SENDER}
                  onChange={(event) => setMessagesPerSender(Number(event.target.value))}
                  type="number"
                  value={messagesPerSender}
                />
              </Field>
              <Field label="Unread ratio">
                <input
                  className={`${inputClassName} w-full`}
                  max={1}
                  min={0}
                  onChange={(event) => setUnreadRatio(Number(event.target.value))}
                  step="0.05"
                  type="number"
                  value={unreadRatio}
                />
              </Field>
              <Field label="Deterministic seed">
                <input
                  className={`${inputClassName} w-full`}
                  max={DEV_LAB_LIMITS.MAX_SEED}
                  min={DEV_LAB_LIMITS.MIN_SEED}
                  onChange={(event) => setSeed(Number(event.target.value))}
                  type="number"
                  value={seed}
                />
              </Field>
              <p className="text-xs leading-5 text-slate-500 md:col-span-2">
                Gmail usually delivers new mail as unread. This ratio only describes the generated dataset.
              </p>
              <Field label="Category profile">
                <select
                  className={`${inputClassName} w-full`}
                  onChange={(event) => setCategoryProfile(event.target.value)}
                  value={categoryProfile}
                >
                  <option value={DEV_LAB_CATEGORY_PROFILES.PROMOTIONAL}>Promotional</option>
                  <option value={DEV_LAB_CATEGORY_PROFILES.NEWSLETTER}>Newsletter</option>
                  <option value={DEV_LAB_CATEGORY_PROFILES.TRANSACTIONAL}>Transactional</option>
                  <option value={DEV_LAB_CATEGORY_PROFILES.SOCIAL}>Social</option>
                  <option value={DEV_LAB_CATEGORY_PROFILES.NOTIFICATION}>Notification</option>
                  <option value={DEV_LAB_CATEGORY_PROFILES.MIXED}>Mixed</option>
                </select>
              </Field>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              {senderCount} senders × {messagesPerSender} messages = {requestedTotal} emails to send
            </p>
            {exceedsHardLimit ? (
              <p className="mt-1 text-sm text-[#fbe9b2]">
                Hard limit: {hardLimit}. Only {hardLimit} can actually be generated/sent.
              </p>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">3. Unsubscribe</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Controlled development targets</h2>
            <p className="mt-1 text-sm text-slate-400">
              HTTPS paths use {status?.unsubscribeBaseHost || "the configured public development origin"}. The generator will not emit localhost unsubscribe URLs.
            </p>
            <div className="mt-5">
              <Field label="Unsubscribe mechanism">
                <select
                  className={inputClassName}
                  onChange={(event) => setUnsubscribeProfile(event.target.value)}
                  value={unsubscribeProfile}
                >
                  <option value={DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK}>RFC8058 one-click</option>
                  <option value={DEV_LAB_UNSUBSCRIBE_PROFILES.HTTPS_MANUAL}>HTTPS manual</option>
                  <option value={DEV_LAB_UNSUBSCRIBE_PROFILES.MAILTO_MANUAL}>MAILTO manual</option>
                  <option value={DEV_LAB_UNSUBSCRIBE_PROFILES.NONE}>No unsubscribe path</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">4. Generate & Send</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-2xl bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
                disabled={requestState !== "idle"}
                type="submit"
              >
                {getGenerateButtonLabel(requestState, sendProgress)}
              </button>
              <span className="text-sm text-slate-400">{requestedTotal} messages requested</span>
            </div>
            {sendProgress && requestState === "generating" ? (
              <div className="mt-3 max-w-md">
                <p className="text-sm text-slate-300">{getSendProgressLabel(sendProgress)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#f4c95d]"
                    style={{ width: `${getSendProgressPercent(sendProgress)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="mt-4 rounded-2xl border border-rose-300/24 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</p>
            ) : null}

            {generation ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/4 px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Generated</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Sent {generation.sentCount} / {generation.requestedCount}
                  {generation.failedCount ? ` · ${generation.failedCount} failed` : ""}
                  {generation.ambiguousCount ? ` · ${generation.ambiguousCount} ambiguous` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {generation.senderCount} senders · {generation.messageCount} messages · {generation.intendedUnreadCount} intended unread
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {generation.rfc8058Count > 0 ? `${generation.rfc8058Count} RFC8058 unsubscribe paths · ` : ""}
                  Seed {generation.seed} · {generation.unsubscribeProfile}
                </p>
                {generation.recipientMasked ? (
                  <p className="mt-2 text-sm text-slate-400">Recipient: {generation.recipientMasked}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </form>
      </div>
    </main>
  );
}
