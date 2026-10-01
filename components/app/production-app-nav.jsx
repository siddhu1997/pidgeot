import Link from "next/link";

import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { getPublicAppConfig } from "@/lib/config";

function NavLink({ href, children, external = false }) {
  const className = "text-sm text-slate-400 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

  if (external) {
    return (
      <a className={className} href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export async function ProductionAppNav() {
  const session = await getCurrentAuthSession();
  const { githubUrl } = getPublicAppConfig();
  const email = session?.email || null;

  return (
    <nav className="border-b border-white/8 px-5 py-4 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <Link
          className="shrink-0 text-sm font-semibold tracking-[-0.03em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          href="/"
        >
          Pidgeot
        </Link>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <NavLink href="/privacy">Privacy</NavLink>
          <NavLink href="/security">Security</NavLink>
          {githubUrl ? <NavLink external href={githubUrl}>GitHub</NavLink> : null}
          {email ? (
            <form action="/api/auth/logout" method="post">
              <button
                className="text-sm font-semibold text-slate-200 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                type="submit"
              >
                Logout
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
