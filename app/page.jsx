import { AuthStatusToast } from "@/components/auth-status-toast";
import { PidgeotEntryScreen } from "@/components/entry/pidgeot-entry-screen";
import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";

export default async function Home() {
  const serverConfig = getServerAppConfig();
  const authConfigured = isAuthConfigured(serverConfig);
  const session = await getCurrentAuthSession();
  const gmailAuthState = session?.gmail?.state || GMAIL_SESSION_STATES.IDENTITY_ONLY;

  return (
    <main className="machine-shell flex-1 px-5 py-6 sm:px-8 lg:px-10">
      <AuthStatusToast />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <PidgeotEntryScreen
          authConfigured={authConfigured}
          email={session?.email || null}
          gmailAuthState={gmailAuthState}
        />
      </div>
    </main>
  );
}