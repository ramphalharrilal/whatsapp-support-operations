# Product Case Study: Safe Automation With Human Ownership

## Context

Many small organizations already receive support requests through WhatsApp, but a shared phone or informal chat history makes prioritization, ownership, security response, and reporting difficult. A simple question-and-answer bot does not solve those operational problems.

## Users

| User | Need |
| --- | --- |
| Customer | Fast answers without being trapped in automation |
| Support agent | Clear queue, context, priority, and ownership |
| Support lead | Visibility into demand, handoffs, and bot containment |
| Security reviewer | Evidence that signatures, identity data, and sensitive text are handled deliberately |
| Developer | Replaceable channel, persistence, and outbound adapters |

## Product Decisions

### Deterministic knowledge before generative answers

The public edition uses approved patterns and responses. If confidence is absent, it asks one clarifying question and then creates a ticket. This prioritizes correctness and support ownership over conversational novelty.

### Human request always wins

Typing `agent`, `human`, `representative`, or related language immediately creates a ticket. The system does not force additional bot questions before honoring the request.

### Risk is routed, not merely warned

When sensitive or security-related language appears, the stored text is reduced, the customer receives safe guidance, and a P2 ticket is created. A banner alone would not create accountable follow-up.

### Demo mode is useful without pretending to be production

The repository includes synthetic data, a browser simulator, and an inspectable webhook response. It deliberately excludes live Meta tokens, outbound delivery, agent authentication, and production persistence.

## Operational Scenario

1. Priya sends: “I think I shared a verification code with someone.”
2. The message is classified as a potential security concern.
3. Any detected numeric code would be redacted before storage.
4. A P2 ticket is created and the conversation moves to `WAITING_FOR_AGENT`.
5. Priya is told not to send additional credentials or codes.
6. The queue makes the ticket visible to an agent.
7. When Harry accepts it, the ticket becomes `ASSIGNED` and the conversation becomes `AGENT_ACTIVE`.
8. The reply and final resolution create audit events without copying the full message into audit metadata.

## Measures Exposed

- Total conversations
- Conversations waiting for an agent
- Open tickets
- Conversations contained without a ticket
- Average first-response time in the API model

Production reporting should also separate automated resolution from abandonment, track reopen rate, measure customer effort, and review false-positive escalations.

## Outcome

The project demonstrates that a channel integration can be designed as a support operation: authenticated intake, minimized data, explicit decision rules, prioritized work, human ownership, verifiable state, and measurable outcomes.
