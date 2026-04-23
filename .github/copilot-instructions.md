# ttv-twitch-elevenlabs Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-19

## Active Technologies
- No new storage; existing SQLite overflow/recovery metadata and local filesystem audio artifacts remain unchanged (002-mixitup-streamerbot-intake)
- TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, Node.js `child_process` for PowerShell invocation (003-add-windows-tts)
- Local filesystem for generated audio artifacts and SQLite for existing queue persistence metadata (003-add-windows-tts)
- TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, existing Node.js HTTP server primitives, and `ws` for the Phase 2 WebSocket transport (004-combined-status-stream)
- No new persistence; combined status is computed in memory from the existing queue and health snapshot sources while SQLite overflow metadata and local audio artifacts remain unchanged (004-combined-status-stream)

- TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest (001-burst-safe-alert-queue)

## Project Structure

```text
src/
tests/
```

## Commands

pnpm lint; pnpm test; pnpm build

## Code Style

TypeScript 5.x on Node.js 22 LTS: Follow standard conventions

## Recent Changes
- 004-combined-status-stream: Added TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, existing Node.js HTTP server primitives, and `ws` for the Phase 2 WebSocket transport
- 003-add-windows-tts: Added TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest, Node.js `child_process` for PowerShell invocation
- 002-mixitup-streamerbot-intake: Added TypeScript 5.x on Node.js 22 LTS + Express 5, Zod, Pino, better-sqlite3, Vitest, Supertest


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
