import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy policy | Pidgeot",
  description: "How Pidgeot accesses Gmail metadata, handles OAuth tokens, and processes unsubscribe requests.",
};

const sections = [
  {
    title: "Who operates Pidgeot",
    body: [
      "Operator: Siddharth S.",
      "Privacy contact: siddharthajith97@gmail.com.",
    ],
  },
  {
    title: "Information accessed",
    body: [
      "Pidgeot uses Google sign-in to learn the verified account email needed to create your session.",
      "After you separately connect Gmail, Pidgeot reads Gmail message metadata only. The headers used for analysis are From, To, Subject, Date, List-Unsubscribe, List-Unsubscribe-Post, List-ID, Precedence, Reply-To, and Sender.",
      "Pidgeot does not fetch message bodies, snippets, or attachments.",
    ],
  },
  {
    title: "Google permissions",
    body: [
      "Sign-in requests the OpenID scopes openid and email.",
      "Gmail access is a second, explicit step. That step requests https://www.googleapis.com/auth/gmail.modify so Pidgeot can scan your Gmail metadata and move unread messages you select to Gmail Trash.",
      "Moving mail to Trash is not permanent deletion. Gmail keeps trashed messages according to Gmail’s own Trash rules.",
    ],
  },
  {
    title: "Why this data is used",
    body: [
      "Metadata is used to group recurring senders, show you what Pidgeot found, and let you choose keep, unsubscribe, or Trash cleanup.",
      "Pidgeot does not decide on your behalf. Classification uses local rules on the server. It does not send mailbox data to an external AI or LLM service.",
    ],
  },
  {
    title: "Unsubscribe processing",
    body: [
      "If you ask Pidgeot to unsubscribe, it may submit a request using the unsubscribe mechanism advertised on the email, such as a standard one-click HTTPS request.",
      "Those one-click requests are sent from Pidgeot’s server. The destination is the unsubscribe address from the email, not an address supplied by your browser.",
      "The destination receives the request that mechanism requires. Pidgeot does not send Gmail message bodies to unsubscribe endpoints.",
      "If only a manual or mailto instruction is available, you remain in control of that step.",
      "A submitted unsubscribe request does not guarantee that a sender will stop sending mail.",
    ],
  },
  {
    title: "Token handling",
    body: [
      "OAuth tokens for an active session are held in server process memory so Pidgeot can talk to Google on your behalf during that session.",
      "Tokens are not persisted to a database, the filesystem, browser localStorage, or analytics systems.",
      "Pidgeot does not see or store your Google password.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Pidgeot does not keep a persistent Gmail message database.",
      "Session, scan, and cleanup state live in the memory of the running application process. That state is discarded when the process restarts.",
      "Pidgeot does not currently restore cleanup progress across devices or restarts.",
    ],
  },
  {
    title: "Third parties",
    body: [
      "Google receives OAuth and Gmail API requests when you sign in, connect Gmail, scan, or move selected unread mail to Trash.",
      "If you run an automatic unsubscribe, the unsubscribe destination from the email receives that unsubscribe request.",
      "Pidgeot does not send Gmail data to advertising, analytics, error-reporting, or external AI providers.",
    ],
  },
  {
    title: "Your control",
    body: [
      "Signing out of Pidgeot ends the Pidgeot session and clears that process-local session. It does not revoke Google’s OAuth grant.",
      "You can revoke Pidgeot’s Google access from your Google Account permissions. After that, Pidgeot cannot use Gmail until you connect it again.",
    ],
  },
  {
    title: "Security practices that affect privacy",
    body: [
      "Google sign-in uses OAuth state validation and PKCE.",
      "Gmail reads and Trash moves happen on the server. The browser does not supply Gmail message IDs or unsubscribe URLs to execution endpoints.",
      "Pidgeot does not persist Gmail message content.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="machine-shell flex-1 px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 md:p-8">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
            Privacy policy
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">
            How Pidgeot uses your Gmail data.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            This policy describes the current Pidgeot application. You sign in with Google, connect
            Gmail only if you choose to, and stay in control of unsubscribe and Trash actions.
          </p>
        </div>

        <div className="grid gap-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-slate-200">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-200">
          <p>
            Questions about this policy:{" "}
            <a className="text-[#f4c95d] underline-offset-4 hover:underline" href="mailto:siddharthajith97@gmail.com">
              siddharthajith97@gmail.com
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Pidgeot
          </Link>
        </div>
      </div>
    </main>
  );
}
