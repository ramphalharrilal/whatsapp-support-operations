export const TicketStatus = Object.freeze({
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  RESOLVED: "RESOLVED"
});

export class SupportTicket {
  constructor({ id, conversationId, priority, reason, createdAt }) {
    if (!id || !conversationId || !priority || !reason) {
      throw new TypeError("Complete ticket details are required");
    }
    this.id = id;
    this.conversationId = conversationId;
    this.priority = priority;
    this.reason = reason;
    this.status = TicketStatus.OPEN;
    this.assignedAgent = null;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
    this.resolvedAt = null;
    this.history = [
      { action: "CREATED", actor: "system", timestamp: createdAt, note: reason }
    ];
  }

  assign(agentName, timestamp) {
    if (!agentName?.trim()) {
      throw new TypeError("Agent name is required");
    }
    if (this.status === TicketStatus.RESOLVED) {
      throw new Error("Resolved tickets cannot be assigned");
    }
    this.status = TicketStatus.ASSIGNED;
    this.assignedAgent = agentName.trim();
    this.updatedAt = timestamp;
    this.history.push({
      action: "ASSIGNED",
      actor: agentName.trim(),
      timestamp,
      note: "Ticket accepted by agent"
    });
  }

  resolve(agentName, timestamp, note = "Customer request resolved") {
    if (this.status === TicketStatus.RESOLVED) {
      return;
    }
    this.status = TicketStatus.RESOLVED;
    this.resolvedAt = timestamp;
    this.updatedAt = timestamp;
    this.history.push({
      action: "RESOLVED",
      actor: agentName?.trim() || "system",
      timestamp,
      note
    });
  }
}
