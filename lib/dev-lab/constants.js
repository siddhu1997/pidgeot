export const DEV_LAB_UNSUBSCRIBE_PROFILES = {
  HTTPS_MANUAL: "HTTPS_MANUAL",
  MAILTO: "MAILTO",
  MAILTO_MANUAL: "MAILTO_MANUAL",
  NONE: "NONE",
  RFC8058: "RFC8058",
  RFC8058_ONE_CLICK: "RFC8058_ONE_CLICK",
};

export const DEV_LAB_CATEGORY_PROFILES = {
  MIXED: "MIXED",
  NEWSLETTER: "NEWSLETTER",
  NOTIFICATION: "NOTIFICATION",
  PROMOTIONAL: "PROMOTIONAL",
  SOCIAL: "SOCIAL",
  TRANSACTIONAL: "TRANSACTIONAL",
};

export const DEV_LAB_LIMITS = {
  DEFAULT_MESSAGES_PER_SENDER: 2,
  DEFAULT_SEED: 17,
  DEFAULT_SENDER_COUNT: 2,
  DEFAULT_UNREAD_RATIO: 0.8,
  MAX_MESSAGES_PER_SENDER: 10,
  MAX_SEED: 999_999,
  MAX_SEND_ATTEMPTS: 2,
  MAX_SEND_CONCURRENCY: 3,
  MAX_SENDER_COUNT: 10,
  MAX_TOTAL_MESSAGES: 50,
  MIN_MESSAGES_PER_SENDER: 1,
  MIN_SEED: 1,
  MIN_SENDER_COUNT: 1,
};

export const DEV_LAB_SENDER_CATALOG = [
  { category: "PROMOTIONAL", displayName: "Pixel Offers", localPart: "pixel", slug: "pixel-offers" },
  { category: "PROMOTIONAL", displayName: "Mint Marketing", localPart: "mint", slug: "mint-marketing" },
  { category: "PROMOTIONAL", displayName: "North Deals", localPart: "north", slug: "north-deals" },
  { category: "PROMOTIONAL", displayName: "Tandem Coupons", localPart: "tandem", slug: "tandem-coupons" },
  { category: "NEWSLETTER", displayName: "Harbor Weekly", localPart: "harbor", slug: "harbor-weekly" },
  { category: "NEWSLETTER", displayName: "Olive Digest", localPart: "olive", slug: "olive-digest" },
  { category: "TRANSACTIONAL", displayName: "Ledger Receipts", localPart: "receipts", slug: "ledger-receipts" },
  { category: "SOCIAL", displayName: "Kite Community", localPart: "community", slug: "kite-community" },
  { category: "NOTIFICATION", displayName: "Signal Alerts", localPart: "alerts", slug: "signal-alerts" },
  { category: "UPDATES", displayName: "Ribbon Updates", localPart: "updates", slug: "ribbon-updates" },
];

export const DEV_LAB_SUBJECTS = {
  NEWSLETTER: [
    "This week's notes from the desk",
    "A quieter briefing for Thursday",
    "What we noticed in the last seven days",
    "The Friday rundown",
    "A short letter before the weekend",
  ],
  NOTIFICATION: [
    "A change landed in your workspace",
    "Activity you asked to hear about",
    "A reminder you can ignore if you already saw it",
    "Something needs a glance",
    "Status update from the last cycle",
  ],
  PROMOTIONAL: [
    "A few things we think you'll like",
    "This week's picks, nothing urgent",
    "New arrivals while they last",
    "A modest sale for people already on the list",
    "Worth a look if you have a minute",
  ],
  SOCIAL: [
    "Someone mentioned you in a thread",
    "A community note you might care about",
    "New replies in a space you follow",
    "An invitation sitting in the list",
    "Quiet activity from people you know",
  ],
  TRANSACTIONAL: [
    "Your receipt for order 1842",
    "Payment confirmation for this account",
    "Invoice for the last billing cycle",
    "Order update, no marketing attached",
    "A statement for your records",
  ],
  UPDATES: [
    "A product note from the last release",
    "What changed since you last looked",
    "A short changelog for this week",
    "Service update, no action needed",
    "A status letter from the team",
  ],
};

export const DEFAULT_DEV_MAIL_FROM_DOMAIN = "pidgeot-dev.siddharths.co.in";
export const DEFAULT_DEV_MAIL_UNSUBSCRIBE_BASE_URL = "https://timmy-sclerenchymatous-unfanatically.ngrok-free.dev";
export const DEV_LAB_UNSUBSCRIBE_PATH = "/api/dev-lab/unsubscribe";
export const DEV_LAB_UNSUBSCRIBE_TOKEN_PATTERN = /^dl_[a-z0-9_-]{1,80}$/;
