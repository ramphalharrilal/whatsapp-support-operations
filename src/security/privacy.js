import { createHash } from "node:crypto";

const REDACTIONS = [
  {
    label: "card number",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_CARD_NUMBER]"
  },
  {
    label: "verification code",
    pattern: /\b\d{6}\b/g,
    replacement: "[REDACTED_VERIFICATION_CODE]"
  },
  {
    label: "password",
    pattern: /\b(password|passcode|pin)\s*(?:is|:|=)\s*\S+/gi,
    replacement: "$1: [REDACTED]"
  },
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]"
  }
];

export function protectIncomingText(value) {
  const original = String(value ?? "").trim();
  const findings = [];
  let text = original;

  for (const rule of REDACTIONS) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      findings.push(rule.label);
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, rule.replacement);
    }
  }

  return {
    text,
    containsSensitiveData: findings.length > 0,
    findings
  };
}

export function pseudonymizeAddress(value) {
  if (!value) {
    throw new TypeError("Channel address is required");
  }
  return `wa_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}
