import Link from "next/link";

import { AuthStatusToast } from "@/components/auth-status-toast";
import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { getPublicAppConfig } from "@/lib/config";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";

const statusLanes = [
  {
    label: "Scan model",
    value: "Bounded passes",
    detail: "Incremental mailbox discovery without loading the full inbox.",
  },
  {
    label: "Retention",
    value: "24-hour TTL",
    detail: "Ephemeral snapshots only. No database, no Redis, no background worker.",
  },
  {
    label: "Controls",
    value: "Explicit only",
    detail: "Users choose unsubscribe and trash actions; nothing runs autonomously.",
  },
];

const phaseItems = [
  "Phase 0 scaffold complete",
  "JavaScript + App Router + Tailwind baseline",
  "Privacy, security, and source pages wired",
  "Phase 1 OAuth foundation live with narrow identity scopes",
];

const previewGroups = [
  {
    name: "Quarterly product updates",
    attention: "High attention",
    metrics: "183 messages  ·  121 unread  ·  160 in Trash",
    domains: ["confluent.io", "confluent.cloud"],
  },
  {
    name: "Event promos",
    attention: "Medium attention",
    metrics: "84 messages  ·  51 unread  ·  12 in Trash",
    domains: ["conference.example"],
  },
  {
    name: "Low-signal alerts",
    attention: "Needs review",
    metrics: "12 messages  ·  2 unread  ·  0 in Trash",
    domains: ["ops.example"],
  },
];

export default async function Home() {
  const config = getPublicAppConfig();
  const serverConfig = getServerAppConfig();
  const authConfigured = isAuthConfigured(serverConfig);
  const session = await getCurrentAuthSession();
  const gmailAuthState = session?.gmail?.state || "IDENTITY_ONLY";

  return (
    <main className="machine-shell flex-1 px-5 py-6 sm:px-8 lg:px-10">
      <AuthStatusToast />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="grid gap-4 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur md:grid-cols-[1.5fr_1fr] md:p-7">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-cyan-100">
              Phase 0 preview
            </div>
            <div className="space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-slate-400">
                Privacy-first Gmail cleanup
              </p>
              <h1 className="max-w-3xl text-4xl leading-none font-semibold tracking-[-0.05em] text-white sm:text-6xl">
                Pidgeot is the cleanup machine shell, not the Gmail engine yet.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                This phase establishes the product surface, baseline routes, environment plumbing,
                and test harness for a mailbox cleaner that stays deterministic, explicit, and
                temporary by design.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c95d]"
                href={config.githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                Inspect source
              </a>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/30 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                href="/privacy"
              >
                Privacy posture
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/30 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                href="/security"
              >
                Security notes
              </Link>
            </div>
          </div>

          <section className="grid gap-3 rounded-[24px] border border-white/10 bg-[rgba(16,23,38,0.9)] p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
                  Build state
                </p>
                <h2 className="text-xl font-semibold text-white">System primer</h2>
              </div>
              <div className="status-light" aria-hidden="true" />
            </div>
            {phaseItems.map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-sm text-slate-200">{item}</p>
              </div>
            ))}
            {session ? (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                Signed in as {session.email}. Active session expires at {new Date(session.expiresAt).toLocaleString()}.
              </div>
            ) : authConfigured ? (
              <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100">
                Google sign-in is configured. Gmail mailbox access remains deferred until later phases.
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-amber-300/30 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
                Add the Google OAuth environment variables to enable sign-in. Gmail scanning and queue processing remain disabled for now.
              </div>
            )}
          </section>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.82)] p-5 md:p-6">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
                  Machine lanes
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                  Operational constraints surfaced up front
                </h2>
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                {config.appBaseUrl}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {statusLanes.map((lane) => (
                <article key={lane.label} className="lane-panel">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    {lane.label}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-white">{lane.value}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{lane.detail}</p>
                </article>
              ))}
            </div>
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(244,201,93,0.1),rgba(244,201,93,0.02))] p-4">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#f4c95d]">
                Delivery note
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
                Phase 0 intentionally avoids fake inbox access. The counters and sender groups below
                are a marked product preview so the interaction model can be shaped before any Gmail
                credentials, scopes, or cleanup operations are introduced.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[rgba(10,16,29,0.82)] p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
                    Auth stage
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Google OAuth, without Gmail scopes yet</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    The current implementation authenticates the Google account with identity-only scopes and can upgrade to a Gmail-capable in-memory session when the user explicitly grants `gmail.modify` offline access.
                  </p>
                </div>

                {session ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {gmailAuthState === "GMAIL_READY" ? (
                      <div className="inline-flex items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-100">
                        Gmail access ready
                      </div>
                    ) : (
                      <a
                        className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5"
                        href="/api/auth/google/gmail/start"
                      >
                        {gmailAuthState === "REAUTH_REQUIRED" || gmailAuthState === "CONSENT_REQUIRED"
                          ? "Reconnect Gmail access"
                          : "Enable Gmail access"}
                      </a>
                    )}
                    <form action="/api/auth/logout" method="post">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/30 hover:bg-white/6"
                        type="submit"
                      >
                        End session
                      </button>
                    </form>
                  </div>
                ) : (
                  <a
                    className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5"
                    href="/api/auth/google/start"
                  >
                    Continue with Google
                  </a>
                )}
              </div>
            </div>
          </div>

          <aside className="grid gap-4 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.82)] p-5 md:p-6">
            <div className="border-b border-white/10 pb-4">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
                Preview queue
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                Sender-group interface stub
              </h2>
            </div>
            {previewGroups.map((group, index) => (
              <article
                key={group.name}
                className="group-card motion-safe:animate-[card-rise_480ms_ease-out]"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{group.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{group.attention}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    Mock state
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{group.metrics}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.domains.map((domain) => (
                    <span key={domain} className="domain-chip">
                      {domain}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}