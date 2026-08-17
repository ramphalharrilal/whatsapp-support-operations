# Operations Runbook

## Start and Verify

### Demo mode

```bash
DEMO_MODE=true node src/server.js
```

Verify:

```bash
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/dashboard
```

### Webhook mode

Use the organization's approved secret injection method:

```bash
DEMO_MODE=false node src/server.js
```

The service must not be placed on the public internet until TLS termination, request controls, logging, monitoring, secret management, and Meta webhook configuration are approved.

## Health Indicators

| Indicator | Healthy state | Investigate when |
| --- | --- | --- |
| `/api/health` | HTTP 200 and expected mode | Unavailable, wrong mode, or repeated restart |
| Webhook POST | HTTP 200 for valid signed text event | 401 spike, 5xx response, or processing count unexpectedly zero |
| Ticket queue | Age and volume within staffing plan | P2 waiting, oldest ticket breaches target, or assignment stalls |
| Bot containment | Stable with reviewed outcomes | Sudden increase may indicate customers are being dropped |
| Unknown fallback | Low and sampled for knowledge improvement | Repeated phrases indicate a knowledge gap |

## Webhook Verification Failure

1. Confirm the expected environment and configured application secret.
2. Verify the proxy forwards the raw body unchanged.
3. Confirm the signature header is present.
4. Compare timestamps and deployment version.
5. Do not log or paste the application secret or full production payload.
6. Escalate a sudden widespread signature failure as a channel incident.

## Queue Handling

- Accept P2 security or sensitive-data tickets before routine P3 tickets unless another approved priority rule applies.
- Read the redacted conversation and ticket reason before replying.
- Do not ask the customer to repeat removed secrets.
- Use an approved identity-verification process outside the chat when account changes are required.
- Resolve only after the user's goal or the security handoff is verified.

## Recovery

The public demo uses in-memory state, so restarting clears active records and reseeds fictional examples. That behavior is appropriate only for demonstrations.

A production design must document:

- database backup and point-in-time recovery;
- outbound queue replay and idempotency;
- webhook retry and duplicate-message handling;
- recovery-time and recovery-point objectives;
- degraded mode when Meta or a connected system is unavailable.

## Knowledge Improvement

Review repeated unknown requests weekly. Add an approved answer only when:

1. The request is common and safe for automation.
2. The content owner approves the wording.
3. The answer includes an escalation route.
4. Test coverage proves the intended match and prevents a risky false match.
5. The change is versioned and reviewed.
