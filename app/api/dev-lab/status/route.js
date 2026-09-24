import { NextResponse } from "next/server";

import { getDevLabConfig, getDevLabPublicStatus } from "@/lib/dev-lab/config";
import { getDevLabGenerationProgress } from "@/lib/dev-lab/generation-progress";
import { getDevLabUnsubscribeHitCount, getRecentDevLabUnsubscribeHits } from "@/lib/dev-lab/unsubscribe-store";

export const runtime = "nodejs";

export async function GET() {
  const config = getDevLabConfig();

  if (config.isProduction) {
    return NextResponse.json({
      error: {
        code: "development_only",
        message: "The Development Lab is available only in development mode.",
      },
    }, { status: 404 });
  }

  return NextResponse.json({
    lab: {
      ...getDevLabPublicStatus(config),
      sendProgress: getDevLabGenerationProgress(),
      unsubscribeHits: getDevLabUnsubscribeHitCount(),
      recentUnsubscribeHits: getRecentDevLabUnsubscribeHits(5),
    },
  });
}
