export class InMemoryConversationRepository {
  #byId = new Map();
  #idByCustomer = new Map();

  save(conversation) {
    this.#byId.set(conversation.id, conversation);
    this.#idByCustomer.set(conversation.customerId, conversation.id);
    return conversation;
  }

  findById(id) {
    return this.#byId.get(id) ?? null;
  }

  findByCustomerId(customerId) {
    const id = this.#idByCustomer.get(customerId);
    return id ? this.findById(id) : null;
  }

  list() {
    return [...this.#byId.values()];
  }
}

export class InMemoryTicketRepository {
  #byId = new Map();

  save(ticket) {
    this.#byId.set(ticket.id, ticket);
    return ticket;
  }

  findById(id) {
    return this.#byId.get(id) ?? null;
  }

  findOpenByConversationId(conversationId) {
    return (
      this.list().find(
        (ticket) => ticket.conversationId === conversationId && ticket.status !== "RESOLVED"
      ) ?? null
    );
  }

  list() {
    return [...this.#byId.values()];
  }
}

export class InMemoryAuditLog {
  #events = [];

  record({ id, type, subjectId, actor, timestamp, metadata = {} }) {
    const event = { id, type, subjectId, actor, timestamp, metadata };
    this.#events.push(event);
    return event;
  }

  list() {
    return [...this.#events];
  }
}
