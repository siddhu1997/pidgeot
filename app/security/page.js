import Link from "next/link";

export const metadata = {
  title: "Security | Pidgeot",
  description: "How Pidgeot handles Google sign-in, Gmail access, and unsubscribe requests.",
};

const securityAreas = [
  {
    title: "OAuth and sessions",
    body: "Google sign-in validates OAuth state and uses PKCE. Session cookies are HttpOnly and SameSite=Lax, and they are marked Secure in production. OAuth tokens stay in server process memory for the active session and are not stored in the browser.",
  },
  {
    title: "Gmail access",
    body: "The browser never calls Gmail. Scan, metadata reads, and user-selected Trash moves run on the server. Execution endpoints accept sender-group choices, not Gmail message IDs supplied by the browser.",
  },
  {
    title: "Unsubscribe requests",
    body: "Automatic unsubscribe runs on the server against the mechanism advertised on the email. Targets are checked before the request is sent. The browser does not supply unsubscribe URLs for execution.",
  },
];

export default function SecurityPage() {
  return (
    <main className="machine-shell flex-1 px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 md:p-8">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
            Security
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">
            Pidgeot keeps Gmail work on the server.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            This page summarizes how the current application handles sign-in, Gmail, and
            unsubscribe. It is not a formal audit or a claim of zero risk.
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
