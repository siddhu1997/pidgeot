import nodemailer from "nodemailer";

import { classifyProviderError, sanitizeProviderFailure } from "@/lib/dev-mail/errors";
import { toNodemailerMessage } from "@/lib/dev-mail/message";

export function isSmtpProviderConfigured({ host, password, user }) {
  return Boolean(host && user && password);
}

export function createSmtpProvider({
  id,
  label,
  host,
  port,
  user,
  password,
  secure = false,
  createTransport = nodemailer.createTransport,
}) {
  return {
    id,
    label,
    configured: isSmtpProviderConfigured({ host, password, user }),
    async send(message) {
      try {
        const transport = createTransport({
          auth: {
            pass: password,
            user,
          },
          host,
          port,
          secure,
        });
        const payload = toNodemailerMessage(message);

        await transport.sendMail({
          ...payload,
          envelope: {
            from: user,
            to: message.toAddress,
          },
        });

        return {
          provider: id,
          status: "sent",
        };
      } catch (error) {
        throw sanitizeProviderFailure({
          classification: classifyProviderError(error),
          provider: id,
        });
      }
    },
  };
}
