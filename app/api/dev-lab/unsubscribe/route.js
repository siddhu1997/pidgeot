import { NextResponse } from "next/server";

import { getDevLabConfig } from "@/lib/dev-lab/config";
import { DEV_LAB_UNSUBSCRIBE_TOKEN_PATTERN } from "@/lib/dev-lab/constants";
import { recordDevLabUnsubscribeHit } from "@/lib/dev-lab/unsubscribe-store";

export const runtime = "nodejs";

function readToken(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get("token") || "").trim().toLowerCase();
}

function unavailable() {
  return NextResponse.json({
    error: {
      code: "development_only",
      message: "The development unsubscribe target is available only in development mode.",
    },
  }, { status: 404 });
}

function invalidToken() {
  return NextResponse.json({
    error: {
      code: "invalid_unsubscribe_token",
      message: "The development unsubscribe token was missing or malformed.",
    },
  }, { status: 400 });
}

function recordHit(request) {
  const token = readToken(request);

  if (!DEV_LAB_UNSUBSCRIBE_TOKEN_PATTERN.test(token)) {
    return null;
  }

  return recordDevLabUnsubscribeHit({
    method: request.method,
    token,
  });
}

export async function GET(request) {
  if (getDevLabConfig().isProduction) {
    return unavailable();
  }

  const hitCount = recordHit(request);

  if (hitCount == null) {
    return invalidToken();
  }

  return new NextResponse(
    `Development unsubscribe target recorded this request. Hits in this process: ${hitCount}.`,
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      status: 200,
    },
  );
}

export async function POST(request) {
  if (getDevLabConfig().isProduction) {
    return unavailable();
  }

  const hitCount = recordHit(request);

  if (hitCount == null) {
    return invalidToken();
  }

  return NextResponse.json({
    recorded: true,
    hitCount,
  });
}
