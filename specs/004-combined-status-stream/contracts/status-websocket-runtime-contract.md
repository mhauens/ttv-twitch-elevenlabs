# Runtime Contract: Combined Status WebSocket

## Endpoint

- Route: `/api/v1/status/ws`
- Transport: WebSocket over the existing application HTTP server
- Scope: Phase 2 of the combined status stream feature

## Connection Behavior

- The server accepts a WebSocket connection on the existing local service host and port.
- Immediately after the connection is established, the server sends exactly one JSON message containing the current `CombinedStatusSnapshot`.
- After the initial message, the server sends additional JSON messages only when the semantic queue or health state changes.
- The server ignores client-originated messages. Clients are not required to send a subscription command or any other setup payload.
- If a client reconnects, the server sends the current `CombinedStatusSnapshot` again and does not replay historical snapshots.

## Payload Shape

Each message is the raw JSON serialization of the shared combined status payload.

```json
{
  "streamSequence": 1,
  "emittedAt": "2026-04-19T12:00:00.000Z",
  "queue": {
    "activeJob": {
      "jobId": "job-123",
      "alertType": "follow",
      "state": "active",
      "activatedAt": "2026-04-19T12:00:00.000Z",
      "correlationId": "req-123"
    },
    "inMemoryDepth": 0,
    "deferredDepth": 0,
    "oldestPendingAgeMs": 0,
    "recentFailures": [],
    "recentRejections": [],
    "lastUpdatedAt": "2026-04-19T12:00:00.000Z"
  },
  "health": {
    "ready": true,
    "queuePersistenceReady": true,
    "playerReady": true,
    "configurationValid": true
  }
}
```

## Keepalive And Liveness

- The server sends ping traffic at least every 30 seconds while the connection is idle.
- Dead clients are detected through the normal ping and pong lifecycle and removed from the subscriber registry.
- Keepalive traffic is transport-level only and does not increment `streamSequence`.

## Failure Behavior

- Temporary failures while refreshing the underlying combined snapshot do not terminate otherwise healthy WebSocket connections.
- If the next refresh succeeds, the server resumes change-only delivery with the latest current snapshot.
- On application shutdown, the server closes open WebSocket connections in a controlled manner before queue resources are disposed.

## Compatibility Rules

- The WebSocket payload is semantically identical to the JSON payload carried in the SSE `data:` line.
- The WebSocket transport does not change the canonical `GET /api/v1/queue` or `GET /api/v1/health` pull contracts.
- No replay buffer, authentication expansion, or client-command protocol is introduced in this feature.