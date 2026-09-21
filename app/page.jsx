import { AuthStatusToast } from "@/components/auth-status-toast";
import { PidgeotEntryScreen } from "@/components/entry/pidgeot-entry-screen";
import { ProductionScanScreen } from "@/components/scan/production-scan-screen";
import { getCurrentAuthSession } from "@/lib/auth/current-session";
import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";
import { createScanService } from "@/lib/scanning/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const serverConfig = getServerAppConfig();
  const authConfigured = isAuthConfigured(serverConfig);
  const session = await getCurrentAuthSession();
  const gmailAuthState = session?.gmail?.state || GMAIL_SESSION_STATES.IDENTITY_ONLY;
  const initialScan = session ? createScanService().getScanStatus({ session }) : null;
  const showProductionScan = Boolean(initialScan) || gmailAuthState === GMAIL_SESSION_STATES.GMAIL_READY;

  return (
    <main className="machine-shell flex-1 px-5 py-6 sm:px-8 lg:px-10">
      <AuthStatusToast />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {showProductionScan ? (
          <ProductionScanScreen
            authConfigured={authConfigured}
            email={session?.email || null}
            gmailAuthState={gmailAuthState}
            initialScan={initialScan}
          />
        ) : (
          <PidgeotEntryScreen
            authConfigured={authConfigured}
            email={session?.email || null}
            gmailAuthState={gmailAuthState}
          />
        )}
      </div>
    </main>
  );
}