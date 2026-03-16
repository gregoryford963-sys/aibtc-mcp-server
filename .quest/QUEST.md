# Quest: nonce-and-fee-fixes

## Goal

Fix two transaction reliability bugs that cause dropped transactions and NotEnoughFunds rejections:

1. **Nonce tracking (#326 / PR #331)** -- Back-to-back transactions reuse the same nonce, causing the second tx to be dropped. PR #331 from `tfireubs-ui` is directionally correct but needs improvements: stale timeout, possible_missing_nonces handling, and better Hiro nonce endpoint usage.

2. **Fee estimation (#332)** -- Auto-estimated fees for complex contract calls (e.g., settle-with-refresh) are absurdly high, causing NotEnoughFunds even with 0.88 STX. The `resolveFee()` utility exists but many write paths skip it entirely, relying on `@stacks/transactions` unclamped estimation.

## Linked Repos

| Repo | Role |
|------|------|
| `aibtcdev/aibtc-mcp-server` | Primary -- all changes here |
| `aibtcdev/x402-sponsor-relay` | Reference only -- battle-tested nonce management (nonce-do.ts) and fee clamping (fee.ts, sponsor.ts) |

## Branch Strategy

- Phase 1: Work on `fix/nonce-tracking` branch (PR #331), push improvements
- Phase 2: New branch `fix/fee-estimation` from main (after #331 merges)

## Status

`pending`
