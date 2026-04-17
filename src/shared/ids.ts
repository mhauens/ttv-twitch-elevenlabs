import { randomUUID } from 'node:crypto';

export function createRequestId(): string {
  return randomUUID();
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function createJobId(): string {
  return randomUUID();
}