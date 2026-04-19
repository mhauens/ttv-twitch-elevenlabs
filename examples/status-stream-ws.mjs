import process from 'node:process';

const statusSocketUrl = process.env.STATUS_SOCKET_URL ?? 'ws://127.0.0.1:3000/api/v1/status/ws';
const socket = new globalThis.WebSocket(statusSocketUrl);

socket.addEventListener('open', () => {
  globalThis.console.log(`Connected to WebSocket stream: ${statusSocketUrl}`);
});

socket.addEventListener('message', (event) => {
  globalThis.console.log(event.data);
});

socket.addEventListener('close', (event) => {
  globalThis.console.log(`Socket closed: ${event.code} ${event.reason || '(no reason)'}`);
});

socket.addEventListener('error', () => {
  globalThis.console.error('WebSocket stream error.');
});
