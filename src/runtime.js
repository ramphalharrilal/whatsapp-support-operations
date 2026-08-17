import { SupportEngine } from "./application/supportEngine.js";
import {
  InMemoryAuditLog,
  InMemoryConversationRepository,
  InMemoryTicketRepository
} from "./infrastructure/repositories.js";
import { createId } from "./lib/id.js";

export function createRuntime({ seedDemo = false, now = () => new Date().toISOString() } = {}) {
  const conversations = new InMemoryConversationRepository();
  const tickets = new InMemoryTicketRepository();
  const auditLog = new InMemoryAuditLog();
  const engine = new SupportEngine({
    conversations,
    tickets,
    auditLog,
    idFactory: createId,
    now
  });

  if (seedDemo) {
    seedDemoData(engine);
  }

  return { engine, conversations, tickets, auditLog };
}

function seedDemoData(engine) {
  engine.receiveMessage({
    customerId: "demo_customer_asha",
    customerName: "Asha",
    text: "Hi, what time do you close today?"
  });

  const handoff = engine.receiveMessage({
    customerId: "demo_customer_miguel",
    customerName: "Miguel",
    text: "I need to speak with a human about my return"
  });
  engine.assignTicket(handoff.ticket.id, "Harry");
  engine.agentReply(
    handoff.conversation.id,
    "Harry",
    "I’m reviewing the return request now. What is the short order reference?"
  );

  engine.receiveMessage({
    customerId: "demo_customer_priya",
    customerName: "Priya",
    text: "I think I shared a verification code with someone"
  });

  engine.receiveMessage({
    customerId: "demo_customer_jordan",
    customerName: "Jordan",
    text: "Something changed and I am confused"
  });
  engine.receiveMessage({
    customerId: "demo_customer_jordan",
    customerName: "Jordan",
    text: "That did not answer my question"
  });
}
