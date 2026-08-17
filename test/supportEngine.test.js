import test from "node:test";
import assert from "node:assert/strict";
import { SupportEngine } from "../src/application/supportEngine.js";
import { ConversationState } from "../src/domain/conversation.js";
import {
  InMemoryAuditLog,
  InMemoryConversationRepository,
  InMemoryTicketRepository
} from "../src/infrastructure/repositories.js";

function createHarness() {
  let sequence = 0;
  let seconds = 0;
  const conversations = new InMemoryConversationRepository();
  const tickets = new InMemoryTicketRepository();
  const auditLog = new InMemoryAuditLog();
  const engine = new SupportEngine({
    conversations,
    tickets,
    auditLog,
    idFactory: (prefix) => `${prefix}_${++sequence}`,
    now: () => `2026-08-17T12:00:${String(seconds++).padStart(2, "0")}.000Z`
  });
  return { engine, conversations, tickets, auditLog };
}

test("answers an approved knowledge-base question without creating a ticket", () => {
  const { engine, tickets } = createHarness();

  const result = engine.receiveMessage({
    customerId: "customer_1",
    customerName: "Asha",
    text: "What time do you close?"
  });

  assert.equal(result.intent, "BUSINESS_HOURS");
  assert.match(result.outboundMessage.text, /Monday through Friday/i);
  assert.equal(result.conversation.state, ConversationState.BOT_ACTIVE);
  assert.equal(tickets.list().length, 0);
});

test("honors a human-agent request and creates a prioritized ticket", () => {
  const { engine } = createHarness();

  const result = engine.receiveMessage({
    customerId: "customer_2",
    customerName: "Miguel",
    text: "I need a human representative"
  });

  assert.equal(result.ticket.priority, "P3");
  assert.equal(result.ticket.reason, "Customer requested a human agent");
  assert.equal(result.conversation.state, ConversationState.WAITING_FOR_AGENT);
  assert.equal(result.conversation.ticketId, result.ticket.id);
});

test("escalates after two unmatched requests instead of inventing an answer", () => {
  const { engine } = createHarness();

  const first = engine.receiveMessage({
    customerId: "customer_3",
    customerName: "Jordan",
    text: "Something changed and I am confused"
  });
  const second = engine.receiveMessage({
    customerId: "customer_3",
    customerName: "Jordan",
    text: "That did not help"
  });

  assert.equal(first.ticket, null);
  assert.equal(second.ticket.priority, "P3");
  assert.match(second.outboundMessage.text, /do not want to guess/i);
});

test("redacts sensitive data before storage and escalates the conversation", () => {
  const { engine, auditLog } = createHarness();

  const result = engine.receiveMessage({
    customerId: "customer_4",
    customerName: "Priya",
    text: "My password is Hunter2 and the verification code is 123456"
  });

  const storedInbound = result.conversation.messages[0].text;
  assert.doesNotMatch(storedInbound, /Hunter2|123456/);
  assert.match(storedInbound, /REDACTED/);
  assert.equal(result.ticket.priority, "P2");
  assert.equal(result.conversation.state, ConversationState.WAITING_FOR_AGENT);
  const receiptEvent = auditLog.list().find((event) => event.type === "MESSAGE_RECEIVED");
  assert.equal(receiptEvent.metadata.sensitiveDataRedacted, true);
});

test("supports assignment, agent reply, and resolution with audit history", () => {
  const { engine, auditLog } = createHarness();
  const handoff = engine.receiveMessage({
    customerId: "customer_5",
    customerName: "Taylor",
    text: "agent please"
  });

  const assigned = engine.assignTicket(handoff.ticket.id, "Harry");
  assert.equal(assigned.ticket.status, "ASSIGNED");
  assert.equal(assigned.conversation.state, ConversationState.AGENT_ACTIVE);

  const reply = engine.agentReply(
    handoff.conversation.id,
    "Harry",
    "I am reviewing this with you now."
  );
  assert.equal(reply.message.sender, "Harry");

  const resolved = engine.resolveConversation(handoff.conversation.id, "Harry");
  assert.equal(resolved.ticket.status, "RESOLVED");
  assert.equal(resolved.conversation.state, ConversationState.RESOLVED);
  assert.ok(auditLog.list().some((event) => event.type === "CONVERSATION_RESOLVED"));
});

test("dashboard exposes operational metrics without message bodies in audit events", () => {
  const { engine } = createHarness();
  engine.receiveMessage({
    customerId: "customer_6",
    customerName: "Ravi",
    text: "Hello"
  });
  engine.receiveMessage({
    customerId: "customer_7",
    customerName: "Leah",
    text: "agent"
  });

  const dashboard = engine.getDashboard();
  assert.deepEqual(
    {
      totalConversations: dashboard.metrics.totalConversations,
      waitingForAgent: dashboard.metrics.waitingForAgent,
      openTickets: dashboard.metrics.openTickets,
      botContained: dashboard.metrics.botContained
    },
    {
      totalConversations: 2,
      waitingForAgent: 1,
      openTickets: 1,
      botContained: 1
    }
  );
  assert.ok(dashboard.auditEvents.every((event) => !("text" in event.metadata)));
});
