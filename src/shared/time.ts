export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function ageMs(isoTime: string, referenceMs = nowMs()): number {
  const parsed = Date.parse(isoTime);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(referenceMs - parsed, 0);
}