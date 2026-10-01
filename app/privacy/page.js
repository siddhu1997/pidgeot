import Link from "next/link";

import { ProductionAppNav } from "@/components/app/production-app-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy policy | Pidgeot",
  description: "How Pidgeot accesses Gmail metadata, shares data, retains sessions, and does not use AI/ML.",
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
      "After you separately connect Gmail, Pidgeot reads Gmail message metadata through the Gmail API. The headers used for analysis are From, To, Subject, Date, List-Unsubscribe, List-Unsubscribe-Post, List-ID, Precedence, Reply-To, and Sender.",
      "Pidgeot does not fetch message bodies, snippets, or attachments.",
    ],
  },
  {
    title: "Google permissions",
    body: [
      "Sign-in requests the OpenID scopes openid and email.",
      "Gmail access is a second, explicit step. That step requests https://www.googleapis.com/auth/gmail.modify so Pidgeot can scan your Gmail metadata and move unread messages you select to Gmail Trash.",
      "Moving mail to Gmail Trash is not permanent deletion. Trashed messages remain in Gmail and are governed by Gmail’s own retention and deletion rules. Pidgeot cannot erase Gmail messages from Google’s systems.",
    ],
  },
  {
    title: "Why this data is used",
    body: [
      "Metadata is used to group recurring senders, show you what Pidgeot found, and let you choose keep, unsubscribe, or Trash cleanup.",
      "Pidgeot does not decide on your behalf.",
    ],
  },
  {
    title: "How Google user data is shared, transferred, or disclosed",
    body: [
      "Google receives the OAuth and Gmail API requests needed to authenticate you and provide Gmail functionality: sign-in, connecting Gmail, listing and reading the message metadata required for scanning, grouping, and classification, and moving unread messages you select to Gmail Trash.",
      "When you explicitly run an automatic unsubscribe, Pidgeot sends that unsubscribe request from its server to the unsubscribe endpoint advertised on the email, typically a standard one-click HTTPS request. That unsubscribe endpoint is an external recipient of that specific request. Pidgeot does not send your general mailbox contents, attachments, message bodies, or unrelated Gmail data to unsubscribe endpoints.",
      "If only a manual or mailto instruction is available, you remain in control of that step. A submitted unsubscribe request does not guarantee that a sender will stop sending mail.",
      "Pidgeot does not sell Google user data.",
      "Pidgeot does not share Google user data with advertising, analytics, data-broker, error-reporting, or AI/ML providers.",
    ],
  },
  {
    title: "Retention and deletion",
    body: [
      "Pidgeot does not maintain a persistent database of Gmail data and does not retain Gmail message content in persistent storage.",
      "OAuth tokens are held only in server memory for the active Pidgeot session. They are not stored in a database, the filesystem, cookies, or browser storage. Pidgeot does not see or store your Google password. The browser cookie identifies the Pidgeot session; it does not contain OAuth tokens.",
      "Pidgeot sessions expire after 24 hours.",
      "Scan results, sender groups, workflow state, cleanup progress, and related working data are process-local. They exist only in the memory of the running application process and are not persisted or restored across application restarts. Restarting the application process discards that process-local state.",
      "Logging out or otherwise ending the Pidgeot session destroys that Pidgeot session and its associated process-local state, including the scan, workflow state, and processing session for that account. Logout ends the Pidgeot session; it does not revoke Google’s OAuth grant and it does not delete Gmail messages.",
      "Messages moved to Gmail Trash remain governed by Google’s own Gmail retention and deletion rules. Pidgeot does not claim to delete or erase Gmail messages from Google’s systems.",
    ],
  },
  {
    title: "AI and machine learning",
    body: [
      "Pidgeot does not use AI or ML models to process Google user data.",
      "Pidgeot does not integrate with third-party AI or ML services for Google user data.",
      "Sender grouping and classification use deterministic application logic on Pidgeot’s server.",
      "Pidgeot does not send Gmail data to OpenAI, Anthropic, Gemini, or any other AI/ML provider for inference, training, or model improvement.",
      "Pidgeot does not use Google user data to train or improve generalized or personalized AI/ML models.",
    ],
  },
  {
    title: "Your control",
    body: [
      "Logging out of Pidgeot ends the Pidgeot session and clears that process-local session. It does not revoke Google’s OAuth grant.",
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
    <>
      <ProductionAppNav />
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
    </>
  );
}
