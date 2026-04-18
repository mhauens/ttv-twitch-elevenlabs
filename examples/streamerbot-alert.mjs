import process from 'node:process';

const alertApiUrl = process.env.ALERT_API_URL ?? 'http://127.0.0.1:3000/api/v1/alerts';

const payload = {
  source: 'streamerbot',
  alertType: 'raid',
  payload: {
    userName: process.env.ALERT_USER_NAME ?? 'raid-leader',
    message: process.env.ALERT_MESSAGE ?? 'Raid erfolgreich uebernommen'
  }
};

const response = await globalThis.fetch(alertApiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

const body = await response.json();

globalThis.console.log('HTTP status:', response.status);
globalThis.console.log('Outcome:', body.data?.outcome ?? '(missing)');
globalThis.console.log('Job ID:', body.data?.jobId ?? '(missing)');
globalThis.console.log(JSON.stringify(body, null, 2));