import { ConversationState, SupportConversation } from "../domain/conversation.js";
import { SupportTicket, TicketStatus } from "../domain/ticket.js";
import { protectIncomingText } from "../security/privacy.js";
import { findKnowledgeAnswer } from "./knowledgeBase.js";

const HUMAN_REQUEST = /\b(agent|human|person|representative|someone|staff|manager)\b/i;
const SECURITY_INDICATOR = /\b(hacked|fraud|scam|stolen|unauthorized|verification code|password)\b/i;

export class SupportEngine {
  constructor({ conversations, tickets, auditLog, idFactory, now }) {
    this.conversations = conversations;
    this.tickets = tickets;
    this.auditLog = auditLog;
    this.idFactory = idFactory;
    this.now = now;
  }

  receiveMessage({ customerId, customerName, text, sourceMessageId = null }) {
    if (!customerId || !text?.trim()) {
      throw new TypeError("Customer id and message text are required");
    }

    const timestamp = this.now();
    let conversation = this.conversations.findByCustomerId(customerId);
    if (!conversation) {
      conversation = new SupportConversation({
        id: this.idFactory("conv"),
        customerId,
        customerName,
        createdAt: timestamp
      });
    } else {
      conversation.reopen(timestamp);
    }

    const protectedMessage = protectIncomingText(text);
    conversation.addMessage({
      id: this.idFactory("msg"),
      direction: "inbound",
      sender: "customer",
      text: protectedMessage.text,
      timestamp,
      sourceMessageId
    });
    this.#audit("MESSAGE_RECEIVED", conversation.id, "customer", {
      sourceMessageId: sourceMessageId ?? "demo",
      sensitiveDataRedacted: protectedMessage.containsSensitiveData,
      findingTypes: protectedMessage.findings
    });

    let outcome;
    if (protectedMessage.containsSensitiveData || SECURITY_INDICATOR.test(text)) {
      outcome = this.#escalate(
        conversation,
        "P2",
        "Potential security or sensitive-data concern",
        "For your security, I removed sensitive details from the conversation and alerted a human agent. Do not send passwords, verification codes, or full payment-card numbers."
      );
    } else if (conversation.state === ConversationState.AGENT_ACTIVE) {
      outcome = this.#reply(
        conversation,
        `Thanks—your message was added to the active case for ${conversation.assignedAgent}.`
      );
    } else if (conversation.state === ConversationState.WAITING_FOR_AGENT) {
      outcome = this.#reply(
        conversation,
        "Your update was added to the queue. A human agent will respond in this conversation."
      );
    } else if (HUMAN_REQUEST.test(text)) {
      outcome = this.#escalate(
        conversation,
        "P3",
        "Customer requested a human agent",
        "Absolutely—I created a support ticket and placed this conversation in the human-support queue."
      );
    } else {
      const knowledgeAnswer = findKnowledgeAnswer(text);
      if (knowledgeAnswer) {
        conversation.unmatchedCount = 0;
        outcome = this.#reply(conversation, knowledgeAnswer.response, {
          intent: knowledgeAnswer.intent,
          confidence: knowledgeAnswer.confidence
        });
      } else {
        conversation.unmatchedCount += 1;
        outcome = conversation.unmatchedCount >= 2
          ? this.#escalate(
              conversation,
              "P3",
              "Repeated request not matched to approved knowledge",
              "I do not want to guess. I created a ticket so a human agent can review your request."
            )
          : this.#reply(
              conversation,
              "I’m not certain I understood. Please describe whether this is about an order, return, business hours, or technical support. You can also type ‘agent’."
            );
      }
    }

    this.conversations.save(conversation);
    return this.#result(conversation, outcome);
  }

  assignTicket(ticketId, agentName) {
    const ticket = this.#requireTicket(ticketId);
    const conversation = this.#requireConversation(ticket.conversationId);
    const timestamp = this.now();
    ticket.assign(agentName, timestamp);
    conversation.assignedAgent = agentName.trim();
    if (conversation.state === ConversationState.WAITING_FOR_AGENT) {
      conversation.transition(ConversationState.AGENT_ACTIVE, timestamp);
    }
    conversation.addMessage({
      id: this.idFactory("msg"),
      direction: "outbound",
      sender: "system",
      text: `${agentName.trim()} joined the conversation.`,
      timestamp
    });
    this.tickets.save(ticket);
    this.conversations.save(conversation);
    this.#audit("TICKET_ASSIGNED", ticket.id, agentName.trim(), {
      conversationId: conversation.id
    });
    return { ticket, conversation };
  }

  agentReply(conversationId, agentName, text) {
    const conversation = this.#requireConversation(conversationId);
    if (!agentName?.trim() || !text?.trim()) {
      throw new TypeError("Agent name and reply text are required");
    }
    if (conversation.state !== ConversationState.AGENT_ACTIVE) {
      throw new Error("An agent must accept the ticket before replying");
    }
    const protectedMessage = protectIncomingText(text);
    const message = conversation.addMessage({
      id: this.idFactory("msg"),
      direction: "outbound",
      sender: agentName.trim(),
      text: protectedMessage.text,
      timestamp: this.now()
    });
    this.conversations.save(conversation);
    this.#audit("AGENT_REPLY_SENT", conversation.id, agentName.trim(), {
      sensitiveDataRedacted: protectedMessage.containsSensitiveData
    });
    return { conversation, message };
  }

  resolveConversation(conversationId, agentName = "system") {
    const conversation = this.#requireConversation(conversationId);
    const timestamp = this.now();
    if (conversation.state !== ConversationState.RESOLVED) {
      conversation.transition(ConversationState.RESOLVED, timestamp);
    }
    const ticket = conversation.ticketId ? this.tickets.findById(conversation.ticketId) : null;
    if (ticket) {
      ticket.resolve(agentName, timestamp);
      this.tickets.save(ticket);
    }
    conversation.addMessage({
      id: this.idFactory("msg"),
      direction: "outbound",
      sender: "system",
      text: "This support conversation is marked resolved. Reply again if you still need help.",
      timestamp
    });
    this.conversations.save(conversation);
    this.#audit("CONVERSATION_RESOLVED", conversation.id, agentName, {
      ticketId: ticket?.id ?? null
    });
    return { conversation, ticket };
  }

  getConversation(id) {
    return this.#requireConversation(id);
  }

  getDashboard() {
    const conversations = this.conversations
      .list()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const tickets = this.tickets
      .list()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const openTickets = tickets.filter((ticket) => ticket.status !== TicketStatus.RESOLVED);
    const firstResponseTimes = conversations
      .map((conversation) => {
        const inbound = conversation.messages.find((message) => message.direction === "inbound");
        const outbound = conversation.messages.find((message) => message.direction === "outbound");
        return inbound && outbound
          ? new Date(outbound.timestamp).getTime() - new Date(inbound.timestamp).getTime()
          : null;
      })
      .filter((value) => value !== null && value >= 0);
    const averageResponseMs = firstResponseTimes.length
      ? Math.round(firstResponseTimes.reduce((sum, value) => sum + value, 0) / firstResponseTimes.length)
      : 0;

    return {
      metrics: {
        totalConversations: conversations.length,
        waitingForAgent: conversations.filter(
          (conversation) => conversation.state === ConversationState.WAITING_FOR_AGENT
        ).length,
        openTickets: openTickets.length,
        botContained: conversations.filter(
          (conversation) => !conversation.ticketId && conversation.messages.length > 0
        ).length,
        averageFirstResponseMs: averageResponseMs
      },
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        customerName: conversation.customerName,
        state: conversation.state,
        assignedAgent: conversation.assignedAgent,
        ticketId: conversation.ticketId,
        latestMessage: conversation.latestMessage()?.text ?? "",
        messageCount: conversation.messages.length,
        updatedAt: conversation.updatedAt
      })),
      tickets,
      auditEvents: this.auditLog.list().slice(-20).reverse()
    };
  }

  #reply(conversation, text, metadata = {}) {
    const message = conversation.addMessage({
      id: this.idFactory("msg"),
      direction: "outbound",
      sender: "assistant",
      text,
      timestamp: this.now()
    });
    this.#audit("AUTOMATED_REPLY_SENT", conversation.id, "assistant", metadata);
    return { message, ticket: null, intent: metadata.intent ?? null };
  }

  #escalate(conversation, priority, reason, replyText) {
    const timestamp = this.now();
    let ticket = this.tickets.findOpenByConversationId(conversation.id);
    if (!ticket) {
      ticket = new SupportTicket({
        id: this.idFactory("ticket"),
        conversationId: conversation.id,
        priority,
        reason,
        createdAt: timestamp
      });
      this.tickets.save(ticket);
      conversation.ticketId = ticket.id;
      if (conversation.state === ConversationState.BOT_ACTIVE) {
        conversation.transition(ConversationState.WAITING_FOR_AGENT, timestamp);
      }
      this.#audit("TICKET_CREATED", ticket.id, "system", {
        conversationId: conversation.id,
        priority,
        reason
      });
    }
    const reply = this.#reply(conversation, replyText, { escalation: true, priority });
    return { ...reply, ticket };
  }

  #result(conversation, outcome) {
    return {
      conversation,
      outboundMessage: outcome.message,
      ticket: outcome.ticket,
      intent: outcome.intent ?? null
    };
  }

  #audit(type, subjectId, actor, metadata) {
    this.auditLog.record({
      id: this.idFactory("audit"),
      type,
      subjectId,
      actor,
      timestamp: this.now(),
      metadata
    });
  }

  #requireConversation(id) {
    const conversation = this.conversations.findById(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }
    return conversation;
  }

  #requireTicket(id) {
    const ticket = this.tickets.findById(id);
    if (!ticket) {
      throw new Error(`Ticket not found: ${id}`);
    }
    return ticket;
  }
}
