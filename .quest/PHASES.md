# Phases: nonce-and-fee-fixes

## Phase 1: Fix nonce tracking (PR #331 / issue #326)

**Goal:** Improve PR #331's nonce tracking to be locally authoritative with stale timeout, possible_missing_nonces awareness, and reset on wallet lock/unlock.

**Branch:** `fix/nonce-tracking` (PR #331)

**Dependencies:** None

**Status:** `pending`

---

## Phase 2: Fix fee estimation (issue #332)

**Goal:** Ensure fee clamping is applied on ALL write paths, lower contract_call ceiling to 50k uSTX, and add fee override parameter to service-level callContract calls.

**Branch:** `fix/fee-estimation` (new, from main after Phase 1 merges)

**Dependencies:** Phase 1 merged (nonce changes in builder.ts must be stable before modifying fee handling in the same file)

**Status:** `pending`
