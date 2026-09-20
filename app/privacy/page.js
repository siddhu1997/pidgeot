import Link from "next/link";

import { getPublicAppConfig } from "@/lib/config";

const privacyRules = [
  "No Gmail credentials, message bodies, or subjects are stored in the current implementation.",
  "No database, Redis, analytics provider, or third-party tracking is present.",
  "No external AI or LLM integration is used or planned for classification in v1.",
  "Later phases will retain only ephemeral cleanup snapshots with a 24-hour TTL.",
];

export const metadata = {
  title: "Privacy | Pidgeot",
  description: "Privacy posture for the Pidgeot Gmail cleanup project.",
};

export default function PrivacyPage() {
  const config = getPublicAppConfig();

  return (
    <main className="machine-shell flex-1 px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 md:p-8">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
            Privacy posture
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">
            Pidgeot is being built to minimize retained Gmail data.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            This route describes the current privacy posture for the sign-in and inbox-connection
            flow. Pidgeot starts with Google sign-in, asks for Gmail access as a separate step,
            and keeps the privacy boundary explicit before inbox cleanup begins.
          </p>
        </div>

        <div className="grid gap-3">
          {privacyRules.map((rule) => (
            <article key={rule} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <p className="text-sm leading-6 text-slate-200">{rule}</p>
            </article>
          ))}
        </div>

        <div className="rounded-[22px] border border-dashed border-[#f4c95d]/40 bg-[#f4c95d]/8 p-4 text-sm leading-6 text-[#fbe9b2]">
          The repository now includes a fuller privacy draft in `PRIVACY.md`, while snapshot
          retention, Gmail scope justification, and restoration behavior will continue to expand as
          inbox cleanup surfaces are added.
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Pidgeot
          </Link>
          <a
            href={config.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950"
          >
            View source repository
          </a>
        </div>
      </div>
    </main>
  );
}