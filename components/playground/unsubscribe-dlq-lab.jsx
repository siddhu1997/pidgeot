"use client";

import { useCallback, useEffect, useState } from "react";

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function formatTimestamp(value) {
  if (!Number.isFinite(value)) {
    return "Unknown time";
  }

  return new Date(value).toLocaleString();
}

function formatClassification(value) {
  if (value === "FAILED_RETRYABLE") {
    return "Retryable";
  }

  if (value === "FAILED_PERMANENT") {
    return "Permanent";
  }

  if (value === "UNSAFE_TARGET") {
    return "Unsafe";
  }

  if (value === "MANUAL_ACTION_REQUIRED") {
    return "Needs interaction";
  }

  return value || "Unknown";
}

function formatCategory(value) {
  return String(value || "UNKNOWN").replaceAll("_", " ");
}

function formatTarget(target) {
  if (!target?.host) {
    return "Target unavailable";
  }

  const scheme = target.scheme ? `${target.scheme}://` : "";
  const port = target.port ? `:${target.port}` : "";
  return `${scheme}${target.host}${port}${target.path || ""}`;
}

function DiagnosticRow({ label, value }) {
  if (value == null || value === "") {
    return null;
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-200">{value}</dd>
    </div>
  );
}

export function UnsubscribeDlqLab() {
  const [entries, setEntries] = useState([]);
  const [requestState, setRequestState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [clearState, setClearState] = useState("idle");

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/dev-lab/unsubscribe-dlq");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || "The unsubscribe DLQ could not be loaded.");
    }

    setEntries(Array.isArray(payload?.dlq?.entries) ? payload.dlq.entries : []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        await loadEntries();
        if (!cancelled) {
          setErrorMessage(null);
          setRequestState("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || "The unsubscribe DLQ could not be loaded.");
          setRequestState("idle");
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadEntries]);

  function toggleExpanded(id) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async function handleClear() {
    setClearState("clearing");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/dev-lab/unsubscribe-dlq", { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message || "The unsubscribe DLQ could not be cleared.");
      }

      setEntries([]);
      setExpandedIds(new Set());
    } catch (error) {
      setErrorMessage(error.message || "The unsubscribe DLQ could not be cleared.");
    } finally {
      setClearState("idle");
    }
  }

  return (
    <main className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1100px] gap-4">
        <section className="rounded-[28px] border border-rose-300/18 bg-[rgba(23,12,12,0.84)] px-5 py-5 md:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-rose-200/80">Development only</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Unsubscribe DLQ</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Failed automatic unsubscribe attempts stay here for local diagnosis. This is not a retry queue and is never written in production.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-300">
              {entries.length === 1 ? "1 captured failure" : `${entries.length} captured failures`}
            </p>
            <button
              className={classNames(
                "rounded-2xl border border-white/12 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8 disabled:opacity-60",
                clearState !== "idle" ? "is-waiting" : null,
              )}
              disabled={clearState !== "idle" || entries.length === 0}
              onClick={handleClear}
              type="button"
            >
              {clearState === "clearing" ? "Clearing..." : "Clear DLQ"}
            </button>
          </div>
        </section>

        {errorMessage ? (
          <p className="rounded-2xl border border-rose-300/24 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</p>
        ) : null}

        {requestState === "loading" && entries.length === 0 ? (
          <p className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] px-5 py-8 text-sm text-slate-400">
            Loading captured failures...
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] px-5 py-8 text-sm text-slate-400">
            No automatic unsubscribe failures have been captured yet.
          </p>
        ) : (
          <div className="grid gap-3">
            {entries.map((entry) => {
              const expanded = expandedIds.has(entry.id);

              return (
                <article
                  key={entry.id}
                  className="rounded-[24px] border border-white/10 bg-[rgba(7,11,19,0.84)] px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-white">{entry.senderLabel || entry.senderGroupId || "Unknown sender"}</p>
                      <p className="mt-1 text-sm text-slate-400">{formatTimestamp(entry.timestamp)}</p>
                    </div>
                    <button
                      className="rounded-2xl border border-white/12 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
                      onClick={() => toggleExpanded(entry.id)}
                      type="button"
                    >
                      {expanded ? "Hide details" : "Inspect"}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-slate-200">{entry.mechanismType || "Unknown mechanism"}</span>
                    <span className="rounded-full border border-rose-300/24 bg-rose-300/10 px-2.5 py-1 text-rose-100">{formatCategory(entry.failureCategory)}</span>
                    {entry.httpStatus ? (
                      <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-slate-200">{`HTTP ${entry.httpStatus}`}</span>
                    ) : null}
                    <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-slate-200">{formatClassification(entry.classification)}</span>
                    <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-slate-200">{`Attempt ${entry.attemptNumber}`}</span>
                  </div>
                  {expanded ? (
                    <dl className="mt-4 grid gap-3 rounded-[20px] border border-white/8 bg-black/20 px-3 py-3">
                      <DiagnosticRow label="Sender group" value={entry.senderGroupId} />
                      <DiagnosticRow label="Operation" value={entry.operationId} />
                      <DiagnosticRow label="Scan" value={entry.scanId} />
                      <DiagnosticRow label="Session" value={entry.sessionId} />
                      <DiagnosticRow label="Target" value={formatTarget(entry.target)} />
                      <DiagnosticRow label="Method" value={entry.request?.method} />
                      <DiagnosticRow label="Content type" value={entry.request?.contentType} />
                      <DiagnosticRow label="Transport" value={entry.transportCode} />
                      <DiagnosticRow label="Redirect host" value={entry.redirect?.locationHost} />
                      <DiagnosticRow label="Duration" value={Number.isFinite(entry.durationMs) ? `${entry.durationMs}ms` : null} />
                      <DiagnosticRow label="Response type" value={entry.response?.contentType} />
                      <DiagnosticRow label="Body excerpt" value={entry.response?.bodyExcerpt} />
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
