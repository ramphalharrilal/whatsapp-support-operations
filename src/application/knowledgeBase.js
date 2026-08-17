const ARTICLES = [
  {
    intent: "GREETING",
    patterns: [/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i],
    response:
      "Hello! I can help with business hours, order questions, returns, or technical support. You can also type ‘agent’ at any time."
  },
  {
    intent: "BUSINESS_HOURS",
    patterns: [/\b(hours?|open|opening|close|closing)\b/i],
    response:
      "Our demo support hours are Monday through Friday, 8:00 AM to 5:00 PM. For a real deployment, this answer comes from the approved business knowledge base."
  },
  {
    intent: "ORDER_STATUS",
    patterns: [/\b(order|delivery|shipment|shipping|tracking|package)\b/i],
    response:
      "I can help route an order question. Send only the short order reference—never send a password, verification code, or full card number."
  },
  {
    intent: "RETURNS",
    patterns: [/\b(return|refund|exchange|cancel)\b/i],
    response:
      "Returns and refunds depend on the item and purchase date. I can connect you with an agent who can review the approved policy with you. Type ‘agent’ to continue."
  },
  {
    intent: "TECHNICAL_SUPPORT",
    patterns: [/\b(error|login|sign in|website|app|technical|not working|cannot access|can't access)\b/i],
    response:
      "I can help narrow this down. Tell me which service is affected and the exact error message, but do not send passwords or verification codes."
  }
];

export function findKnowledgeAnswer(text) {
  const article = ARTICLES.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(text))
  );
  if (!article) {
    return null;
  }
  return {
    intent: article.intent,
    response: article.response,
    confidence: 0.92
  };
}
