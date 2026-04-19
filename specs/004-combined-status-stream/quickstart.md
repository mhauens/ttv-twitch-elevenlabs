# Quickstart: Combined Status Stream

## Goal

Validate that the local service exposes the combined realtime status stream over SSE first, continues to keep the existing queue and health pull endpoints unchanged, and can later expose the same combined payload over WebSocket.

## Prerequisites

- Windows 10 or Windows 11 machine
- Node.js 22 LTS
- Existing local alert-service configuration that already starts successfully
- A terminal that can keep an SSE connection open, such as `curl.exe -N`

## 1. Install and start the service

```powershell
pnpm install
pnpm build
pnpm dev
```

Expected result:

- The service starts on the configured host and port.
- `GET /api/v1/queue` and `GET /api/v1/health` continue to respond with their existing JSON envelopes.
- No new `.env` values are required for the realtime status stream.

## 2. Verify the existing pull snapshots remain unchanged

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/queue
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/api/v1/health
```

Expected result:

- The queue response remains `{ status: 'ok', data: QueueSnapshot }`.
- The health response remains `{ status: 'ok' | 'unavailable', data: HealthSnapshot }`.

## 3. Subscribe to the SSE status stream

```powershell
curl.exe -N -H "Accept: text/event-stream" http://127.0.0.1:3000/api/v1/status/stream
```

Expected result:

- The connection stays open.
- The first event is emitted immediately.
- The event uses `event: snapshot`, an `id:` matching `streamSequence`, and a JSON `data:` line containing `queue` and `health`.

## 4. Trigger a status change

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/v1/alerts -ContentType 'application/json' -Body (@{
  source = 'local'
  alertType = 'follow'
  payload = @{ userName = 'tester'; message = 'status stream smoke test' }
} | ConvertTo-Json -Depth 5)
```

Expected result:

- The existing alert API accepts the request through the unchanged JSON envelope.
- The SSE terminal receives a later `snapshot` event showing changed queue state such as a new `activeJob` or changed queue depth.
- After the alert finishes, another `snapshot` event reflects the returned idle state.

## 5. Verify idle keepalive behavior

Keep the SSE connection open without sending more alerts.

Expected result:

- The server does not resend identical snapshot payloads when the semantic state is unchanged.
- A refresh that changes only `queue.lastUpdatedAt` does not by itself trigger a new snapshot event.
- A keepalive comment line such as `: keepalive` appears at least every 15 seconds while idle.

## 6. Verify reconnect behavior

Stop the SSE client and connect again with the same `curl.exe -N` command.

Expected result:

- The server sends the current combined snapshot again.
- The server does not replay older status history based on prior `id` values.

## 7. Phase 2 validation for WebSocket

Once `/api/v1/status/ws` is implemented, connect with Node.js 22 using the built-in WebSocket client.

```powershell
node --input-type=module -e "const socket = new WebSocket('ws://127.0.0.1:3000/api/v1/status/ws'); socket.onmessage = (event) => console.log(event.data);"
```

Expected result:

- The first message is the current `CombinedStatusSnapshot` as raw JSON.
- Later messages arrive only when queue or health state changes.
- Client-originated messages are ignored and are not required for setup.

## 8. Automated validation

```powershell
pnpm lint
pnpm test
pnpm build
```

Expected result:

- Unit tests cover change detection, sequence handling, and subscriber cleanup.
- Integration tests cover initial SSE delivery, status-change broadcasts, idle keepalive behavior, and shutdown cleanup.
- Contract tests keep `/api/v1/status/stream` aligned with the SSE OpenAPI description.
- Existing queue, health, admission, recovery, and playback tests remain green.
