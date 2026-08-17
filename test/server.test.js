import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createHttpServer } from "../src/server.js";
import { createRuntime } from "../src/runtime.js";

async function withServer(callback, options = {}) {
  const { engine } = createRuntime({ seedDemo: false });
  const server = createHttpServer({ engine, demoMode: true, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback({ baseUrl, engine });
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("serves the dashboard with security headers", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /RelayDesk/);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });
});

test("processes a simulator message and updates dashboard metrics", async () => {
  await withServer(async ({ baseUrl }) => {
    const inbound = await fetch(`${baseUrl}/api/simulate/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: "integration_customer",
        customerName: "Integration Test",
        text: "agent"
      })
    });
    const result = await inbound.json();
    assert.equal(inbound.status, 201);
    assert.equal(result.ticket.priority, "P3");

    const dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
    assert.equal(dashboard.metrics.totalConversations, 1);
    assert.equal(dashboard.metrics.openTickets, 1);
  });
});

test("rejects an invalid webhook signature when a secret is configured", async () => {
  await withServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/webhooks/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "sha256=invalid"
        },
        body: JSON.stringify({ entry: [] })
      });
      assert.equal(response.status, 401);
    },
    { appSecret: "configured-secret" }
  );
});

test("accepts a signed WhatsApp text payload and pseudonymizes the sender", async () => {
  await withServer(
    async ({ baseUrl, engine }) => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [{ wa_id: "15550000000", profile: { name: "Webhook User" } }],
                  messages: [
                    {
                      from: "15550000000",
                      id: "wamid.integration",
                      type: "text",
                      text: { body: "What are your hours?" }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${createHmac("sha256", "configured-secret")
        .update(rawBody)
        .digest("hex")}`;
      const response = await fetch(`${baseUrl}/webhooks/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature
        },
        body: rawBody
      });
      const result = await response.json();

      assert.equal(response.status, 200);
      assert.equal(result.processed, 1);
      const conversation = engine.getDashboard().conversations[0];
      assert.equal(conversation.customerName, "Webhook User");
      assert.doesNotMatch(conversation.id, /15550000000/);
    },
    { appSecret: "configured-secret" }
  );
});
