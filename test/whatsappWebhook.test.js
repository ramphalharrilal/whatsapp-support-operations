import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  extractInboundTextMessages,
  verifyWebhookSignature,
  verifyWebhookSubscription
} from "../src/infrastructure/whatsappWebhook.js";

test("verifies a webhook body with the configured application secret", () => {
  const appSecret = "test-only-secret";
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

  assert.equal(verifyWebhookSignature({ rawBody, signature, appSecret }), true);
  assert.equal(
    verifyWebhookSignature({ rawBody, signature: "sha256=invalid", appSecret }),
    false
  );
});

test("validates the subscription token and returns the challenge", () => {
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "expected-token",
    "hub.challenge": "challenge-value"
  });

  assert.equal(verifyWebhookSubscription(params, "expected-token"), "challenge-value");
  assert.equal(verifyWebhookSubscription(params, "wrong-token"), null);
});

test("extracts text messages and pseudonymizes the channel address", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "15551234567", profile: { name: "Demo User" } }],
              messages: [
                {
                  from: "15551234567",
                  id: "wamid.demo",
                  timestamp: "1786948800",
                  type: "text",
                  text: { body: "I need an agent" }
                },
                { from: "15551234567", id: "wamid.image", type: "image" }
              ]
            }
          }
        ]
      }
    ]
  };

  const messages = extractInboundTextMessages(payload);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].customerName, "Demo User");
  assert.equal(messages[0].text, "I need an agent");
  assert.notEqual(messages[0].customerId, "15551234567");
  assert.match(messages[0].customerId, /^wa_[a-f0-9]{16}$/);
});
