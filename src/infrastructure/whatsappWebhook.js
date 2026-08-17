import { createHmac, timingSafeEqual } from "node:crypto";
import { pseudonymizeAddress } from "../security/privacy.js";

export function verifyWebhookSignature({ rawBody, signature, appSecret }) {
  if (!appSecret || !signature?.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function verifyWebhookSubscription(searchParams, expectedToken) {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return challenge;
  }
  return null;
}

export function extractInboundTextMessages(payload) {
  const messages = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const names = new Map(
        (value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name])
      );
      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.text?.body || !message.from) {
          continue;
        }
        messages.push({
          customerId: pseudonymizeAddress(message.from),
          customerName: names.get(message.from) || "WhatsApp customer",
          text: message.text.body,
          sourceMessageId: message.id,
          receivedAt: message.timestamp ?? null
        });
      }
    }
  }
  return messages;
}
