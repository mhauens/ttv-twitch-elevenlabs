# Quickstart: Mix It Up And Streamer.bot Intake Support

## Goal

Validate that Mix It Up and Streamer.bot can both submit alerts through the existing intake endpoint without changing queue, recovery, or admission behavior.

## Prerequisites

- Windows 10/11 machine
- Node.js 22 LTS
- Service configured from `.env.example`
- Local service started with a reachable `POST /api/v1/alerts` endpoint
- Mix It Up available for Web Request action setup
- Streamer.bot available with the documented Script-/Program-Execution flow

## 1. Install and start the service

```powershell
pnpm install
pnpm build
pnpm dev
```

Expected result:

- Startup validation succeeds
- `GET /api/v1/health` reports ready
- `GET /api/v1/queue` shows no unexpected backlog

## 2. Validate Mix It Up submission

Configure a Mix It Up Web Request action with:

- Method: `POST`
- URL: `http://127.0.0.1:3000/api/v1/alerts`
- Header: `Content-Type: application/json`
- Body:

```json
{
  "source": "mixitup",
  "alertType": "follow",
  "payload": {
    "userName": "$username",
    "message": "Willkommen im Stream"
  }
}
```

Expected result:

- The response uses the same admission envelope as existing supported sources.
- Mix It Up automation can inspect `data.outcome` and `data.jobId`.
- Queue and health behavior remain unchanged from existing sources.

## 3. Validate Streamer.bot scripted POST submission

Use the documented Script-/Program-Execution path with a Node.js script similar to:

```javascript
const response = await fetch('http://127.0.0.1:3000/api/v1/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'streamerbot',
    alertType: 'raid',
    payload: {
      userName: 'raid-leader',
      message: 'Raid erfolgreich uebernommen'
    }
  })
});

const body = await response.json();
console.log(response.status, body.data?.outcome, body.data?.jobId);
```

Expected result:

- The HTTP status reflects the documented admission outcome.
- Streamer.bot automation can inspect HTTP status plus `data.outcome` and `data.jobId`.
- No alternative Streamer.bot transport path is required or documented for official support.

## 4. Validate unchanged compatibility for existing callers

Submit an existing local request using `source: "local"`.

Expected result:

- The request still validates and receives the same response envelope.
- Queue ordering, backpressure, duplicate handling, and recovery semantics remain unchanged.

## 5. Validate unsupported source rejection

Submit a request with an unsupported source value, for example `"unsupported"`.

Expected result:

- The service returns the documented validation error response.
- No queue work is created.

## 6. Run automated validation

```powershell
pnpm lint
pnpm test
pnpm build
```

Expected result:

- Contract coverage proves `mixitup` is accepted through the existing intake contract.
- Validation coverage proves unsupported sources still fail.
- Existing queue and recovery tests continue to pass unchanged.
