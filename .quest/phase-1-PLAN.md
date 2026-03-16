# Phase 1: Fix nonce tracking (PR #331 / issue #326)

<plan>
  <goal>Improve the pending nonce tracking in builder.ts to be locally authoritative with stale timeout, possible_missing_nonces handling, and proper reset on wallet lifecycle events. Push fixes to PR #331.</goal>

  <context>
    PR #331 from tfireubs-ui adds a pendingNonces Map in builder.ts with getNextNonce/advancePendingNonce/resetPendingNonce functions, and calls resetPendingNonce from wallet-manager.ts on unlock/lock. The PR is directionally correct but has gaps:

    1. No stale timeout -- a stuck pending nonce blocks all subsequent transactions forever
    2. Uses only possible_next_nonce from Hiro but ignores detected_missing_nonces and detected_mempool_nonces
    3. No timestamp tracking to know when a nonce was assigned
    4. The relay reference (nonce-do.ts) uses a 10-minute STALE_THRESHOLD_MS constant

    Current main branch builder.ts (line 82-181) has no nonce tracking at all -- transactions use @stacks/transactions auto-nonce which causes collisions on rapid calls.

    The Hiro /extended/v1/address/{addr}/nonces endpoint returns:
    - possible_next_nonce: highest mempool nonce + 1
    - detected_missing_nonces: gaps in the nonce sequence
    - detected_mempool_nonces: nonces currently in mempool
    - last_executed_tx_nonce: last confirmed nonce

    The hiro-api.ts service already has getNonceInfo() (line 428) returning the full NonceInfo type (line 276).

    Wallet manager (wallet-manager.ts) needs resetPendingNonce calls on unlock() and lock().
  </context>

  <task id="1">
    <name>Fetch and review PR #331 branch locally</name>
    <files>src/transactions/builder.ts, src/services/wallet-manager.ts</files>
    <action>
      1. Fetch the contributor's branch:
         git fetch origin pull/331/head:fix/nonce-tracking
         git checkout fix/nonce-tracking

      2. Review the diff against main. The PR adds:
         - pendingNonces Map in builder.ts
         - getNextNonce(), advancePendingNonce(), resetPendingNonce() functions
         - Nonce injection into transferStx, callContract, deployContract
         - advancePendingNonce calls after successful broadcast
         - resetPendingNonce import and calls in wallet-manager.ts unlock() and lock()

      3. Verify the build compiles: npm run build

      If the branch cannot be fetched from the fork, create our own branch:
         git checkout -b fix/nonce-tracking main
         Then manually apply the PR changes from the diff.
    </action>
    <verify>
      git log --oneline -3  # Should show the PR commits
      npm run build  # Should compile without errors
    </verify>
    <done>PR #331 branch is checked out locally and builds successfully.</done>
  </task>

  <task id="2">
    <name>Improve nonce tracking with stale timeout and missing nonce awareness</name>
    <files>src/transactions/builder.ts, src/services/wallet-manager.ts</files>
    <action>
      Rewrite the nonce tracking section in builder.ts to improve on PR #331:

      1. Replace the simple `Map<string, bigint>` with a richer structure that tracks timestamps:

         ```typescript
         interface PendingNonceState {
           nextNonce: bigint;
           assignedAt: number; // Date.now() when last assigned
         }
         const pendingNonces = new Map<string, PendingNonceState>();
         const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes, matches relay
         ```

      2. Update getNextNonce() to:
         a. Check if pending state exists and is stale (assignedAt older than STALE_THRESHOLD_MS). If stale, delete the entry and re-fetch from network. Log a warning when stale reset occurs.
         b. Fetch NonceInfo from Hiro via hiroApi.getNonceInfo(address) (already exists in hiro-api.ts line 428)
         c. Use possible_next_nonce as the network baseline
         d. If detected_missing_nonces has entries, log a warning with the gaps (informational -- we still use possible_next_nonce since Hiro accounts for them)
         e. Return max(possible_next_nonce, pendingState.nextNonce) -- same logic as PR #331

      3. Update advancePendingNonce() to also update assignedAt timestamp:
         ```typescript
         function advancePendingNonce(address: string, nonce: bigint): void {
           const next = nonce + 1n;
           const current = pendingNonces.get(address);
           if (!current || next > current.nextNonce) {
             pendingNonces.set(address, { nextNonce: next, assignedAt: Date.now() });
           }
         }
         ```

      4. Keep resetPendingNonce() as-is (simple delete).

      5. Keep the nonce injection points in transferStx, callContract, deployContract exactly as PR #331 has them.

      6. Keep the advancePendingNonce calls after broadcast exactly as PR #331 has them.

      7. In wallet-manager.ts, keep the resetPendingNonce calls on unlock() and lock() exactly as PR #331 has them. Import should be:
         import { resetPendingNonce } from "../transactions/builder.js";
    </action>
    <verify>
      npm run build  # Must compile
      npm test 2>&1 | tail -20  # Existing tests should pass
    </verify>
    <done>builder.ts has improved nonce tracking with stale timeout (10min), timestamp tracking, missing nonce logging, and the locally-authoritative max() model. wallet-manager.ts resets on lock/unlock. Build passes.</done>
  </task>

  <task id="3">
    <name>Push improvements and update PR</name>
    <files>src/transactions/builder.ts, src/services/wallet-manager.ts</files>
    <action>
      1. Stage and commit:
         git add src/transactions/builder.ts src/services/wallet-manager.ts
         git commit -m "fix(transactions): improve nonce tracking with stale timeout and missing nonce awareness

         - Track assignedAt timestamp per address to detect stale pending nonces
         - Reset to network nonce after 10 minutes of staleness (matches relay)
         - Log detected_missing_nonces from Hiro as informational warnings
         - Keep locally authoritative max(network, pending) model from PR #331
         - Reset pending nonce on wallet lock/unlock"

      2. Push:
         - If on contributor's branch: git push origin fix/nonce-tracking
         - If on our own branch: git push -u origin fix/nonce-tracking
           Then update PR #331 or create a new PR referencing #326

      3. Verify build passes in CI.
    </action>
    <verify>
      git log --oneline -3  # Should show improvement commit
      git diff main --stat  # Should show builder.ts and wallet-manager.ts changes
    </verify>
    <done>Improvements are pushed to the fix/nonce-tracking branch. PR is ready for review and merge.</done>
  </task>
</plan>
