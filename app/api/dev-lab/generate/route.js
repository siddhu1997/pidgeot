import { NextResponse } from "next/server";

import { getRequiredCurrentAuthSession } from "@/lib/auth/current-session";
import { assertDevelopmentLabAvailable } from "@/lib/dev-lab/config";
import { createDevLabService } from "@/lib/dev-lab/service";

export const runtime = "nodejs";

function errorStatus(code) {
  if (code === "development_only") {
    return 404;
  }

  if (code === "session_not_found") {
    return 401;
  }

  if (code === "invalid_generation_request") {
    return 400;
  }

  if (code === "generation_limit_exceeded") {
    return 400;
  }

  if (
    code === "mail_generation_disabled"
    || code === "smtp_not_configured"
    || code === "provider_not_configured"
  ) {
    return 409;
  }

  if (
    code === "provider_authentication_failed"
    || code === "provider_permanent_failure"
    || code === "provider_transient_failure"
    || code === "delivery_ambiguous"
  ) {
    return 502;
  }

  return 500;
}

export async function POST(request) {
  try {
    assertDevelopmentLabAvailable();
    await getRequiredCurrentAuthSession();

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        error: {
          code: "invalid_generation_request",
          message: "The generation request was invalid.",
        },
      }, { status: 400 });
    }

    if (body?.recipient || body?.to || body?.smtpPassword || body?.smtpUser || body?.brevoPassword || body?.mailgunPassword) {
      return NextResponse.json({
        error: {
          code: "invalid_generation_request",
          message: "The generator does not accept a recipient or SMTP credentials from the browser.",
        },
      }, { status: 400 });
    }

    const generation = await createDevLabService().generatePromotionalMail({
      categoryProfile: body?.categoryProfile,
      messagesPerSender: body?.messagesPerSender,
      seed: body?.seed,
      senderCount: body?.senderCount,
      unreadRatio: body?.unreadRatio,
      unsubscribeProfile: body?.unsubscribeProfile,
    });

    return NextResponse.json({ generation });
  } catch (error) {
    const code = error.code || "mail_generation_failed";

    return NextResponse.json({
      error: {
        code,
        message: error.message || "The development mail could not be generated.",
      },
    }, { status: errorStatus(code) });
  }
}
