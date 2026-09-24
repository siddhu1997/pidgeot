import { createSmtpProvider } from "@/lib/dev-mail/providers/smtp";

export function createMailgunProvider(config, extras = {}) {
  return createSmtpProvider({
    host: config.mailgunHost,
    id: "mailgun",
    label: "Mailgun",
    password: config.mailgunPassword,
    port: config.mailgunPort,
    secure: config.mailgunSecure,
    user: config.mailgunUser,
    ...extras,
  });
}
