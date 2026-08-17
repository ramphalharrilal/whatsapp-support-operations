# Security and Privacy Design

## Data-Minimization Position

A support system should collect only what is necessary to complete the approved service interaction. RelayDesk demonstrates reduction before persistence, not only a warning after data has already been stored.

## Controls Implemented

### Webhook authenticity

When `WHATSAPP_APP_SECRET` is configured, the raw request body is checked against `X-Hub-Signature-256` using HMAC-SHA256 and constant-time comparison. Invalid signatures are rejected before JSON processing.

### Address pseudonymization

The adapter hashes the WhatsApp sender address and sends only a truncated pseudonymous key into the support domain. The public implementation does not persist the phone number.

A production outbound gateway would need a tightly controlled mapping or short-lived routing reference. That mapping should be encrypted, access-controlled, audited, and governed by retention policy.

### Pre-storage redaction

The inbound text is scanned for common patterns representing:

- full payment-card numbers;
- six-digit verification codes;
- passwords, passcodes, or PINs supplied as values;
- email addresses.

Detected values are replaced before the conversation repository receives the message. A P2 ticket is created and the customer is told not to send sensitive data.

Pattern matching is a risk-reduction demonstration, not a complete data-loss-prevention product. A production implementation should use validated DLP controls, localization, false-positive monitoring, and human review.

### Audit separation

Audit events include event type, subject ID, actor, timestamp, and minimal decision metadata. They do not include full message bodies. This keeps operational evidence separate from conversation content.

### Browser boundary

The server sends:

- Content Security Policy restricted to the same origin;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- a no-referrer policy;
- camera, microphone, and geolocation restrictions.

The browser code renders API-provided content with `textContent`, not HTML injection.

### Demo isolation

The simulator is available only in demo mode. Production mode rejects that route, does not seed fictional data, and expects verified webhook configuration.

## Controls Required Before Production

- User authentication, role-based authorization, and MFA for agents
- Durable encrypted storage and field-level handling for channel routing data
- Approved secrets manager and rotation
- Rate limiting, abuse detection, request correlation, and idempotency
- Malware-safe attachment handling before supporting non-text messages
- Retention, legal hold, subject request, and deletion workflows
- Monitoring, incident alerts, backup, restore, and disaster recovery
- Meta Business approval, templates, consent, opt-out, and messaging-window compliance
- Privacy and security review for every connected order, identity, or payment system

## Prohibited Repository Content

Never commit:

- access tokens, application secrets, verify tokens, or signing keys;
- real customer messages, phone numbers, order references, or support exports;
- production webhook payloads or unredacted screenshots;
- database backups, audit archives, or delivery logs.

See [SECURITY.md](../SECURITY.md) for responsible reporting guidance.
