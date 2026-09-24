import {
  DEV_LAB_CATEGORY_PROFILES,
  DEV_LAB_LIMITS,
  DEV_LAB_SENDER_CATALOG,
  DEV_LAB_SUBJECTS,
  DEV_LAB_UNSUBSCRIBE_PATH,
  DEV_LAB_UNSUBSCRIBE_PROFILES,
} from "@/lib/dev-lab/constants";
import { createDevMailMessage, createRfcMessageId } from "@/lib/dev-mail/message";
import { createSeededRandom, pickItem } from "@/lib/dev-lab/prng";

const BASE_DATE_MS = Date.UTC(2026, 8, 1, 14, 30, 0);

const UNSUBSCRIBE_PROFILE_ALIASES = {
  [DEV_LAB_UNSUBSCRIBE_PROFILES.MAILTO]: DEV_LAB_UNSUBSCRIBE_PROFILES.MAILTO_MANUAL,
  [DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058]: DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK,
};

const CANONICAL_UNSUBSCRIBE_PROFILES = new Set([
  DEV_LAB_UNSUBSCRIBE_PROFILES.HTTPS_MANUAL,
  DEV_LAB_UNSUBSCRIBE_PROFILES.MAILTO_MANUAL,
  DEV_LAB_UNSUBSCRIBE_PROFILES.NONE,
  DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK,
]);

function createDevLabError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function asInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRatio(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canonicalizeUnsubscribeProfile(value) {
  const raw = value == null ? DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK : value;
  return UNSUBSCRIBE_PROFILE_ALIASES[raw] || raw;
}

export function normalizeGenerationRequest(input = {}, limits = DEV_LAB_LIMITS) {
  const senderCount = asInteger(input.senderCount, limits.DEFAULT_SENDER_COUNT);
  const messagesPerSender = asInteger(input.messagesPerSender, limits.DEFAULT_MESSAGES_PER_SENDER);
  const seed = asInteger(input.seed, limits.DEFAULT_SEED);
  const unreadRatio = asRatio(input.unreadRatio, limits.DEFAULT_UNREAD_RATIO);
  const totalMessages = senderCount * messagesPerSender;
  const maxTotalMessages = limits.MAX_TOTAL_MESSAGES;

  if (
    senderCount < limits.MIN_SENDER_COUNT
    || messagesPerSender < limits.MIN_MESSAGES_PER_SENDER
    || seed < limits.MIN_SEED
    || unreadRatio < 0
    || unreadRatio > 1
  ) {
    throw createDevLabError(
      "invalid_generation_request",
      "The generation request used values the Development Lab cannot accept.",
    );
  }

  if (
    senderCount > limits.MAX_SENDER_COUNT
    || messagesPerSender > limits.MAX_MESSAGES_PER_SENDER
    || seed > limits.MAX_SEED
    || totalMessages > maxTotalMessages
  ) {
    throw createDevLabError(
      "generation_limit_exceeded",
      `Requested ${totalMessages} messages from ${senderCount} senders. The development generator allows at most ${limits.MAX_SENDER_COUNT} senders, ${limits.MAX_MESSAGES_PER_SENDER} messages per sender, and ${maxTotalMessages} messages total.`,
    );
  }

  const unsubscribeProfile = canonicalizeUnsubscribeProfile(input.unsubscribeProfile);
  const categoryProfile = input.categoryProfile == null
    ? DEV_LAB_CATEGORY_PROFILES.PROMOTIONAL
    : input.categoryProfile;

  if (
    !CANONICAL_UNSUBSCRIBE_PROFILES.has(unsubscribeProfile)
    || !Object.values(DEV_LAB_CATEGORY_PROFILES).includes(categoryProfile)
  ) {
    throw createDevLabError(
      "invalid_generation_request",
      "Choose a supported unsubscribe profile and category profile.",
    );
  }

  return {
    categoryProfile,
    messagesPerSender,
    seed,
    senderCount,
    unreadRatio,
    unsubscribeProfile,
  };
}

function resolveCatalogEntry(index, categoryProfile) {
  if (categoryProfile === DEV_LAB_CATEGORY_PROFILES.MIXED) {
    return DEV_LAB_SENDER_CATALOG[index % DEV_LAB_SENDER_CATALOG.length];
  }

  const matching = DEV_LAB_SENDER_CATALOG.filter((entry) => entry.category === categoryProfile);
  const pool = matching.length > 0 ? matching : DEV_LAB_SENDER_CATALOG;
  return pool[index % pool.length];
}

function buildSender(entry, index, fromDomain) {
  const primaryAddress = `${entry.localPart}@${fromDomain}`;
  const companionAddress = `${entry.localPart}.hello@${fromDomain}`;

  return {
    category: entry.category,
    companionAddress,
    displayName: entry.displayName,
    domain: fromDomain,
    listId: `${entry.slug}.${fromDomain}`,
    primaryAddress,
    slug: entry.slug,
    senderIndex: index,
  };
}

function assertPublicUnsubscribeBaseUrl(unsubscribeBaseUrl) {
  let parsed;

  try {
    parsed = new URL(unsubscribeBaseUrl);
  } catch {
    throw createDevLabError(
      "invalid_generation_request",
      "DEV_MAIL_UNSUBSCRIBE_BASE_URL is not a valid public HTTPS origin.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || host === "localhost"
    || host.endsWith(".localhost")
    || host === "127.0.0.1"
    || host === "::1"
  ) {
    throw createDevLabError(
      "invalid_generation_request",
      "The generator will not create localhost unsubscribe URLs. Use a public HTTPS development origin.",
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

function buildUnsubscribeFields({ fromDomain, profile, token, unsubscribeBaseUrl }) {
  if (profile === DEV_LAB_UNSUBSCRIBE_PROFILES.NONE) {
    return {
      listUnsubscribe: null,
      listUnsubscribePost: null,
    };
  }

  if (profile === DEV_LAB_UNSUBSCRIBE_PROFILES.MAILTO_MANUAL) {
    return {
      listUnsubscribe: `<mailto:leave+${token}@${fromDomain}?subject=unsubscribe>`,
      listUnsubscribePost: null,
    };
  }

  const target = new URL(DEV_LAB_UNSUBSCRIBE_PATH, `${unsubscribeBaseUrl}/`);
  target.searchParams.set("token", token);

  return {
    listUnsubscribe: `<${target.toString()}>`,
    listUnsubscribePost: profile === DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK
      ? "List-Unsubscribe=One-Click"
      : null,
  };
}

function buildBody({ displayName, subject, category }) {
  const promotional = category === "PROMOTIONAL";
  const transactional = category === "TRANSACTIONAL";
  const text = [
    `Hello,`,
    ``,
    `${displayName} here with ${subject.toLowerCase()}.`,
    ``,
    transactional
      ? "This note is about an account or order you already have with us."
      : promotional
        ? "If you still want the occasional note from this list, you can stay as you are."
        : "This is a recurring letter for people who already asked to hear from us.",
    ``,
    `Thanks for reading,`,
    displayName,
  ].join("\n");

  const html = [
    `<div style="font-family:Georgia,serif;line-height:1.6;color:#1b2430">`,
    `<p>Hello,</p>`,
    `<p>${displayName} here with ${subject.toLowerCase()}.</p>`,
    `<p>${
      transactional
        ? "This note is about an account or order you already have with us."
        : promotional
          ? "If you still want the occasional note from this list, you can stay as you are."
          : "This is a recurring letter for people who already asked to hear from us."
    }</p>`,
    `<p>Thanks for reading,<br>${displayName}</p>`,
    `</div>`,
  ].join("");

  return { html, text };
}

export function createDevLabDataset({
  categoryProfile,
  fromDomain,
  messagesPerSender,
  recipient,
  seed,
  senderCount,
  unreadRatio,
  unsubscribeBaseUrl,
  unsubscribeProfile,
}) {
  const publicUnsubscribeBaseUrl = assertPublicUnsubscribeBaseUrl(unsubscribeBaseUrl);
  const random = createSeededRandom(seed);
  const senders = Array.from({ length: senderCount }, (_, index) => (
    buildSender(resolveCatalogEntry(index, categoryProfile), index, fromDomain)
  ));
  const messages = [];

  senders.forEach((sender, senderIndex) => {
    for (let messageIndex = 0; messageIndex < messagesPerSender; messageIndex += 1) {
      const subjects = DEV_LAB_SUBJECTS[sender.category] || DEV_LAB_SUBJECTS.PROMOTIONAL;
      const subject = pickItem(subjects, random);
      const useCompanion = messageIndex > 0 && messageIndex % 3 === 0;
      const address = useCompanion ? sender.companionAddress : sender.primaryAddress;
      const token = `dl_${seed}_${sender.slug}_${unsubscribeProfile}`.toLowerCase();
      const intendedUnread = random() < unreadRatio;
      const date = new Date(BASE_DATE_MS - ((senderIndex * messagesPerSender + messageIndex) * 36 * 60 * 60 * 1000));
      const { html, text } = buildBody({
        category: sender.category,
        displayName: sender.displayName,
        subject,
      });
      const id = `devmail_${seed}_${senderIndex}_${messageIndex}`;
      const unsubscribeFields = buildUnsubscribeFields({
        fromDomain,
        profile: unsubscribeProfile,
        token,
        unsubscribeBaseUrl: publicUnsubscribeBaseUrl,
      });

      messages.push(createDevMailMessage({
        date: date.toUTCString(),
        fromAddress: address,
        fromName: sender.displayName,
        html,
        id,
        listId: `<${sender.listId}>`,
        messageId: createRfcMessageId(id, fromDomain),
        precedence: sender.category === "NOTIFICATION" || sender.category === "TRANSACTIONAL" ? "list" : "bulk",
        replyTo: sender.primaryAddress,
        subject,
        text,
        toAddress: recipient,
        ...unsubscribeFields,
      }));
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        intendedUnread,
        sender,
        token,
        unsubscribeProfile,
      };
    }
  });

  return {
    messages,
    seed,
    senders,
    summary: {
      categoryProfile,
      intendedUnreadCount: messages.filter((message) => message.intendedUnread).length,
      messageCount: messages.length,
      rfc8058Count: unsubscribeProfile === DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK
        ? senders.length
        : 0,
      senderCount: senders.length,
      unsubscribeProfile,
    },
  };
}
