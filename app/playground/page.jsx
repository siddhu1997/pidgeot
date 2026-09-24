import Link from "next/link";

import { DevelopmentLab } from "@/components/playground/development-lab";
import { PlaygroundLab } from "@/components/playground/playground-lab";
import { getServerAppConfig } from "@/lib/config";
import { getDevLabPublicStatus } from "@/lib/dev-lab/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Development Lab | Pidgeot",
  description: "Development-only laboratory for controlled Gmail test data and visual Pidgeot experiments.",
};

export default function PlaygroundPage() {
  const app = getServerAppConfig();

  if (app.isProduction) {
    return (
      <main className="px-4 py-16">
        <section className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-[rgba(7,11,19,0.84)] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Development Lab</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">This surface is not available in production.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The Development Lab and mail generator exist only while the application is running in development mode.
          </p>
          <Link className="mt-5 inline-flex rounded-full border border-white/12 px-4 py-2 text-sm text-white" href="/">
            Back to Pidgeot
          </Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <DevelopmentLab initialStatus={getDevLabPublicStatus()} />
      <PlaygroundLab />
    </>
  );
}
