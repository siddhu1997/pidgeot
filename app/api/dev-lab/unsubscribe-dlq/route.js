import { NextResponse } from "next/server";

import { getDevLabConfig } from "@/lib/dev-lab/config";
import {
  clearUnsubscribeDlq,
  getUnsubscribeDlqCount,
  listUnsubscribeDlqEntries,
} from "@/lib/dev-lab/unsubscribe-dlq-store";

export const runtime = "nodejs";

function unavailable() {
  return NextResponse.json({
    error: {
      code: "development_only",
      message: "The unsubscribe DLQ is available only in development mode.",
    },
  }, { status: 404 });
}

export async function GET() {
  const config = getDevLabConfig();

  if (config.isProduction) {
    return unavailable();
  }

  const entries = await listUnsubscribeDlqEntries();

  return NextResponse.json({
    dlq: {
      count: entries.length,
      entries,
    },
  });
}

export async function DELETE() {
  const config = getDevLabConfig();

  if (config.isProduction) {
    return unavailable();
  }

  await clearUnsubscribeDlq();

  return NextResponse.json({
    dlq: {
      count: await getUnsubscribeDlqCount(),
      entries: [],
    },
  });
}
