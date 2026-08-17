const elements = {
  conversations: document.querySelector("#metric-conversations"),
  waiting: document.querySelector("#metric-waiting"),
  tickets: document.querySelector("#metric-tickets"),
  contained: document.querySelector("#metric-contained"),
  queueCount: document.querySelector("#queue-count"),
  ticketList: document.querySelector("#ticket-list"),
  conversationTable: document.querySelector("#conversation-table"),
  refreshButton: document.querySelector("#refresh-button"),
  simulatorForm: document.querySelector("#simulator-form"),
  simulatorName: document.querySelector("#simulator-name"),
  simulatorInput: document.querySelector("#simulator-input"),
  simulatorMessages: document.querySelector("#simulator-messages"),
  dialog: document.querySelector("#conversation-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogState: document.querySelector("#dialog-state"),
  dialogMessages: document.querySelector("#dialog-messages"),
  dialogClose: document.querySelector("#dialog-close"),
  agentReplyForm: document.querySelector("#agent-reply-form"),
  agentName: document.querySelector("#agent-name"),
  agentMessage: document.querySelector("#agent-message"),
  resolveButton: document.querySelector("#resolve-button"),
  toast: document.querySelector("#toast")
};

let selectedConversationId = null;
let toastTimeout = null;

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

async function loadDashboard() {
  try {
    const dashboard = await request("/api/dashboard");
    renderMetrics(dashboard.metrics);
    renderTickets(dashboard.tickets);
    renderConversations(dashboard.conversations);
  } catch (error) {
    showToast(error.message);
  }
}

function renderMetrics(metrics) {
  elements.conversations.textContent = metrics.totalConversations;
  elements.waiting.textContent = metrics.waitingForAgent;
  elements.tickets.textContent = metrics.openTickets;
  elements.contained.textContent = metrics.botContained;
}

function renderTickets(tickets) {
  const openTickets = tickets.filter((ticket) => ticket.status !== "RESOLVED");
  elements.queueCount.textContent = `${openTickets.length} open`;
  elements.ticketList.replaceChildren();

  if (!openTickets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "The queue is clear.";
    elements.ticketList.append(empty);
    return;
  }

  for (const ticket of openTickets.slice(0, 6)) {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const priority = document.createElement("span");
    priority.className = `priority-chip ${ticket.priority.toLowerCase()}`;
    priority.textContent = ticket.priority;

    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = ticket.reason;
    const meta = document.createElement("span");
    meta.textContent = ticket.assignedAgent
      ? `Assigned to ${ticket.assignedAgent}`
      : `Created ${formatTime(ticket.createdAt)}`;
    details.append(title, meta);

    const action = document.createElement("button");
    action.className = "assign-button";
    action.type = "button";
    action.textContent = ticket.status === "ASSIGNED" ? "Assigned" : "Accept";
    action.disabled = ticket.status === "ASSIGNED";
    action.addEventListener("click", async () => {
      try {
        await request(`/api/tickets/${encodeURIComponent(ticket.id)}/assign`, {
          method: "POST",
          body: JSON.stringify({ agentName: "Harry" })
        });
        showToast("Ticket assigned to Harry");
        await loadDashboard();
      } catch (error) {
        showToast(error.message);
      }
    });

    card.append(priority, details, action);
    elements.ticketList.append(card);
  }
}

function renderConversations(conversations) {
  elements.conversationTable.replaceChildren();
  for (const conversation of conversations) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.addEventListener("click", () => openConversation(conversation.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        openConversation(conversation.id);
      }
    });

    const customer = document.createElement("td");
    customer.className = "customer-name";
    customer.textContent = conversation.customerName;

    const message = document.createElement("td");
    const preview = document.createElement("span");
    preview.className = "message-preview";
    preview.textContent = conversation.latestMessage;
    message.append(preview);

    const state = document.createElement("td");
    const badge = stateBadge(conversation.state);
    state.append(badge);

    const updated = document.createElement("td");
    updated.textContent = formatTime(conversation.updatedAt);
    row.append(customer, message, state, updated);
    elements.conversationTable.append(row);
  }
}

async function openConversation(id) {
  try {
    const conversation = await request(`/api/conversations/${encodeURIComponent(id)}`);
    selectedConversationId = id;
    elements.dialogTitle.textContent = conversation.customerName;
    elements.dialogState.textContent = labelState(conversation.state);
    elements.dialogState.className = `status-badge state-${conversation.state.toLowerCase()}`;
    renderMessageList(elements.dialogMessages, conversation.messages);
    const agentCanReply = conversation.state === "AGENT_ACTIVE";
    elements.agentMessage.disabled = !agentCanReply;
    elements.agentReplyForm.querySelector("button[type='submit']").disabled = !agentCanReply;
    elements.resolveButton.disabled = conversation.state === "RESOLVED";
    elements.dialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

function renderMessageList(container, messages) {
  container.replaceChildren();
  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${message.direction}`;
    const sender = document.createElement("strong");
    sender.textContent = `${message.sender} · ${formatTime(message.timestamp)}`;
    sender.style.display = "block";
    sender.style.marginBottom = "4px";
    sender.style.fontSize = "0.62rem";
    const text = document.createElement("span");
    text.textContent = message.text;
    bubble.append(sender, text);
    container.append(bubble);
  }
  container.scrollTop = container.scrollHeight;
}

function appendSimulatorMessage(direction, text) {
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${direction}`;
  bubble.textContent = text;
  elements.simulatorMessages.append(bubble);
  elements.simulatorMessages.scrollTop = elements.simulatorMessages.scrollHeight;
}

elements.simulatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.simulatorInput.value.trim();
  if (!text) {
    return;
  }
  appendSimulatorMessage("outbound", text);
  elements.simulatorInput.value = "";
  try {
    const result = await request("/api/simulate/inbound", {
      method: "POST",
      body: JSON.stringify({
        customerId: "browser_demo_customer",
        customerName: elements.simulatorName.value.trim() || "Demo Customer",
        text
      })
    });
    appendSimulatorMessage("inbound", result.outboundMessage.text);
    await loadDashboard();
  } catch (error) {
    appendSimulatorMessage("inbound", `Demo error: ${error.message}`);
  }
});

elements.agentReplyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.agentMessage.value.trim();
  if (!selectedConversationId || !text) {
    return;
  }
  try {
    await request(
      `/api/conversations/${encodeURIComponent(selectedConversationId)}/agent-message`,
      {
        method: "POST",
        body: JSON.stringify({ agentName: elements.agentName.value, text })
      }
    );
    elements.agentMessage.value = "";
    await openConversation(selectedConversationId);
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
});

elements.resolveButton.addEventListener("click", async () => {
  if (!selectedConversationId) {
    return;
  }
  try {
    await request(`/api/conversations/${encodeURIComponent(selectedConversationId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ agentName: elements.agentName.value })
    });
    elements.dialog.close();
    showToast("Conversation resolved");
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
});

elements.dialogClose.addEventListener("click", () => elements.dialog.close());
elements.refreshButton.addEventListener("click", loadDashboard);

function stateBadge(state) {
  const badge = document.createElement("span");
  badge.className = `status-badge state-${state.toLowerCase()}`;
  badge.textContent = labelState(state);
  return badge;
}

function labelState(state) {
  return state
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

loadDashboard();
