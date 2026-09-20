import Link from "next/link";

const securityAreas = [
  {
    title: "OAuth and session handling",
    body: "Later phases will validate OAuth state, keep credentials transient in server memory, and avoid browser-accessible token storage.",
  },
  {
    title: "Unsubscribe safety",
    body: "The unsubscribe fallback path will be treated as an SSRF boundary with strict scheme, redirect, timeout, and private-network protections.",
  },
  {
    title: "Logging discipline",
    body: "The project direction forbids logging Gmail addresses, message IDs, OAuth tokens, unsubscribe URLs, or other mailbox content.",
  },
];

export const metadata = {
  title: "Security | Pidgeot",
  description: "Security posture for the Pidgeot Gmail cleanup project.",
};

export default function SecurityPage() {
  return (
    <main className="machine-shell flex-1 px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 md:p-8">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
            Security posture
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">
            The highest-risk surfaces are identified before they are implemented.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            Google sign-in and Gmail connection are already part of the current product surface.
            This page keeps the security model explicit as inbox scanning, unsubscribe work, and
            cleanup flows continue to expand.
          </p>
        </div>

        <div className="grid gap-3">
          {securityAreas.map((area) => (
            <article key={area.title} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <h2 className="text-lg font-semibold text-white">{area.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{area.body}</p>
            </article>
          ))}
        </div>

        <div className="rounded-[22px] border border-dashed border-cyan-300/35 bg-cyan-300/8 p-4 text-sm leading-6 text-cyan-100">
          Full threat-model documentation, deeper CSRF hardening, dependency auditing, and SSRF
          tests will continue to expand alongside the relevant Gmail and unsubscribe features.
        </div>

        <Link
          href="/"
          className="inline-flex w-fit items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white"
        >
          Back to Pidgeot
        </Link>
      </div>
    </main>
  );
}