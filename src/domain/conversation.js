export const ConversationState = Object.freeze({
  BOT_ACTIVE: "BOT_ACTIVE",
  WAITING_FOR_AGENT: "WAITING_FOR_AGENT",
  AGENT_ACTIVE: "AGENT_ACTIVE",
  RESOLVED: "RESOLVED"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [ConversationState.BOT_ACTIVE]: new Set([
    ConversationState.WAITING_FOR_AGENT,
    ConversationState.RESOLVED
  ]),
  [ConversationState.WAITING_FOR_AGENT]: new Set([
    ConversationState.AGENT_ACTIVE,
    ConversationState.RESOLVED
  ]),
  [ConversationState.AGENT_ACTIVE]: new Set([ConversationState.RESOLVED]),
  [ConversationState.RESOLVED]: new Set([ConversationState.BOT_ACTIVE])
});

export class SupportConversation {
  constructor({ id, customerId, customerName, createdAt }) {
    if (!id || !customerId) {
      throw new TypeError("Conversation id and customer id are required");
    }
    this.id = id;
    this.customerId = customerId;
    this.customerName = customerName?.trim() || "Customer";
    this.channel = "whatsapp";
    this.state = ConversationState.BOT_ACTIVE;
    this.messages = [];
    this.unmatchedCount = 0;
    this.ticketId = null;
    this.assignedAgent = null;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
  }

  addMessage({ id, direction, sender, text, timestamp, sourceMessageId = null }) {
    if (!id || !direction || !sender || !text?.trim() || !timestamp) {
      throw new TypeError("Complete message details are required");
    }
    const message = {
      id,
      direction,
      sender,
      text: text.trim(),
      timestamp,
      sourceMessageId
    };
    this.messages.push(message);
    this.updatedAt = timestamp;
    return message;
  }

  transition(nextState, timestamp) {
    if (nextState === this.state) {
      return;
    }
    if (!ALLOWED_TRANSITIONS[this.state]?.has(nextState)) {
      throw new Error(`Invalid conversation transition: ${this.state} -> ${nextState}`);
    }
    this.state = nextState;
    this.updatedAt = timestamp;
  }

  reopen(timestamp) {
    if (this.state !== ConversationState.RESOLVED) {
      return;
    }
    this.transition(ConversationState.BOT_ACTIVE, timestamp);
    this.ticketId = null;
    this.assignedAgent = null;
    this.unmatchedCount = 0;
  }

  latestMessage() {
    return this.messages.at(-1) ?? null;
  }
}
