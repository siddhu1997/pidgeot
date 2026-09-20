import crypto from "node:crypto";

export function createRandomToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function createPkceCodeVerifier() {
  return createRandomToken(48);
}

export function createPkceCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export function normalizeGoogleIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

export function deriveAccountKey(identifier, sessionSecret) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(normalizeGoogleIdentifier(identifier))
    .digest("hex");
}

export function areEqualOpaqueValues(left, right) {
  const normalizedLeft = String(left || "");
  const normalizedRight = String(right || "");

  if (!normalizedLeft || normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(normalizedLeft), Buffer.from(normalizedRight));
}