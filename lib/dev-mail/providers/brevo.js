import { createSmtpProvider } from "@/lib/dev-mail/providers/smtp";

export function createBrevoProvider(config, extras = {}) {
  return createSmtpProvider({
    host: config.brevoHost,
    id: "brevo",
    label: "Brevo",
    password: config.brevoPassword,
    port: config.brevoPort,
    secure: config.brevoSecure,
    user: config.brevoUser,
    ...extras,
  });
}
