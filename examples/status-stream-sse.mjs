import process from 'node:process';
import { TextDecoder } from 'node:util';

const statusStreamUrl = process.env.STATUS_STREAM_URL ?? 'http://127.0.0.1:3000/api/v1/status/stream';

const response = await globalThis.fetch(statusStreamUrl, {
  headers: {
    Accept: 'text/event-stream'
  }
});

if (!response.ok || !response.body) {
  throw new Error(`Failed to connect to ${statusStreamUrl}: HTTP ${response.status}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

globalThis.console.log(`Connected to SSE stream: ${statusStreamUrl}`);

while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }

  buffer += decoder.decode(value, { stream: true });

  while (true) {
    const separatorIndex = buffer.search(/\r?\n\r?\n/);
    if (separatorIndex < 0) {
      break;
    }

    const separatorLength = buffer[separatorIndex] === '\r' ? 4 : 2;
    const frame = buffer.slice(0, separatorIndex).trim();
    buffer = buffer.slice(separatorIndex + separatorLength);

    if (frame.length === 0) {
      continue;
    }

    globalThis.console.log(frame);
    globalThis.console.log('');
  }
}
