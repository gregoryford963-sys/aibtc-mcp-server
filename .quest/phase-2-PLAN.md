# Phase 2: Fix fee estimation (issue #332)

<plan>
  <goal>Ensure fee clamping is applied on ALL write paths (not just tools with explicit fee params), lower the contract_call ceiling from 100k to 50k uSTX, and add fee override capability to service-level contract calls.</goal>

  <context>
    The fee utility in src/utils/fee.ts has a resolveFee() function with FEE_CLAMPS:
    - token_transfer: floor 180, ceiling 3000
    - contract_call: floor 3000, ceiling 100000
    - smart_contract: floor 10000, ceiling 100000

    The sponsor relay uses contract_call ceiling of 50000 (not 100000).

    resolveFee() returns undefined when fee param is undefined, meaning "let @stacks/transactions auto-estimate". The problem: auto-estimation can produce absurdly high fees for complex contract calls.

    Current state of fee handling across write paths:
    - transfer.tools.ts (transfer_stx): Uses resolveFee(fee, NETWORK, "token_transfer") -- GOOD but returns undefined when fee is omitted
    - contract.tools.ts (call_contract): Uses resolveFee(fee, NETWORK, "contract_call") -- GOOD but returns undefined when fee is omitted
    - contract.tools.ts (deploy_contract): Uses resolveFee(fee, NETWORK, "smart_contract") -- GOOD but returns undefined when fee is omitted
    - sbtc.tools.ts: Uses resolveFee -- GOOD
    - tokens.tools.ts: Uses resolveFee -- GOOD
    - nft.tools.ts: Uses resolveFee -- GOOD
    - bitflow.tools.ts: Uses resolveFee -- GOOD
    - erc8004.tools.ts: Uses resolveFee but conditional: `fee ? await resolveFee(...) : undefined` -- PARTIAL

    Service-level calls that do NOT clamp fees (call callContract without fee):
    - defi.service.ts (Zest supply/withdraw/borrow/repay, ALEX swap) -- 6+ callContract calls with NO fee
    - stacking.service.ts (stack_stx, extend_stacking, etc.) -- 5+ callContract calls with NO fee
    - bns.service.ts (preorder, register, claim, etc.) -- 6+ callContract calls with NO fee
    - tokens.service.ts (transfer_token) -- 1 callContract call with NO fee
    - nft.service.ts (transfer_nft) -- 2 callContract calls with NO fee
    - sbtc.service.ts -- 2 callContract calls but tools layer adds fee
    - erc8004.service.ts -- 4 callContract calls but tools layer adds fee conditionally

    The fix strategy:
    1. Lower contract_call ceiling from 100k to 50k in fee.ts
    2. Change resolveFee() to return a clamped "medium" default instead of undefined when fee is omitted
    3. This single change fixes ALL paths -- both tool-level and service-level callers benefit

    Reference: relay fee.ts (~/dev/aibtcdev/x402-sponsor-relay/src/services/fee.ts) uses:
    - contract_call: { floor: 3000, ceiling: 50000 }
    - smart_contract: { floor: 10000, ceiling: 50000 }
  </context>

  <task id="1">
    <name>Lower fee ceilings and make resolveFee always return a clamped value</name>
    <files>src/utils/fee.ts, tests/utils/fee.test.ts</files>
    <action>
      Create a new branch from main (after Phase 1 is merged):
        git checkout main && git pull
        git checkout -b fix/fee-estimation

      1. In src/utils/fee.ts, update FEE_CLAMPS:
         - contract_call ceiling: 100000n -> 50000n
         - smart_contract ceiling: 100000n -> 50000n
         - all ceiling: 100000n -> 50000n

      2. In src/utils/fee.ts, change resolveFee() behavior when fee is undefined/empty:
         Instead of returning undefined (which means "auto-estimate with no ceiling"),
         fetch mempool fees and return the medium_priority value clamped to the appropriate range.

         Replace the early return:
         ```typescript
         if (!fee) {
           return undefined;
         }
         ```

         With:
         ```typescript
         if (!fee) {
           // Default to medium priority with clamping -- prevents runaway auto-estimation
           // that caused NotEnoughFunds errors (issue #332)
           const hiroApi = getHiroApi(network);
           try {
             const mempoolFees = await hiroApi.getMempoolFees();
             const feeTier = mempoolFees[txType];
             const rawFee = BigInt(Math.ceil(feeTier.medium_priority));
             const clamps = FEE_CLAMPS[txType];
             return clampFee(rawFee, clamps.floor, clamps.ceiling);
           } catch (error) {
             console.error(
               `Failed to fetch default fee (using floor): ${error instanceof Error ? error.message : String(error)}`
             );
             return FEE_CLAMPS[txType].floor;
           }
         }
         ```

      3. Update the JSDoc for resolveFee() to reflect the new behavior:
         - Remove "or undefined if fee is undefined" from the @returns
         - Change to: "@returns The fee in micro-STX as bigint. When fee is omitted, returns a clamped medium-priority estimate."
         - Update the examples to show the new behavior

      4. Update the return type from `Promise<bigint | undefined>` to `Promise<bigint>` since it now always returns a value.

      5. Update tests/utils/fee.test.ts:
         - Change the "returns undefined for undefined fee" test to expect a bigint value
         - Change the "returns undefined for empty string fee" test similarly
         - Add a test that verifies the returned default is within clamp bounds for each tx type
    </action>
    <verify>
      npm run build  # Must compile
      npm test -- tests/utils/fee.test.ts 2>&1  # Fee tests must pass
    </verify>
    <done>resolveFee() always returns a clamped bigint. Contract call ceiling is 50k uSTX. Tests updated and passing.</done>
  </task>

  <task id="2">
    <name>Update callers to handle non-optional fee return and verify all write paths</name>
    <files>
      src/tools/contract.tools.ts,
      src/tools/transfer.tools.ts,
      src/tools/sbtc.tools.ts,
      src/tools/tokens.tools.ts,
      src/tools/nft.tools.ts,
      src/tools/bitflow.tools.ts,
      src/tools/erc8004.tools.ts,
      src/transactions/builder.ts
    </files>
    <action>
      Since resolveFee() now always returns bigint (not bigint | undefined), update all callers:

      1. In tool files that use resolveFee, simplify the spread pattern:
         Before: `...(resolvedFee !== undefined && { fee: resolvedFee })`
         After:  `fee: resolvedFee`

         Files to update:
         - src/tools/contract.tools.ts (lines 165-168 for call_contract, lines 212-216 for deploy_contract)
         - src/tools/transfer.tools.ts (lines 41-42 for transfer_stx)
         - src/tools/sbtc.tools.ts (lines 102, 141)
         - src/tools/tokens.tools.ts (line 74)
         - src/tools/nft.tools.ts (line 91)
         - src/tools/bitflow.tools.ts (line 556)

      2. In src/tools/erc8004.tools.ts, fix the conditional pattern:
         Before: `const feeAmount = fee ? await resolveFee(fee, NETWORK, "contract_call") : undefined;`
         After:  `const feeAmount = await resolveFee(fee, NETWORK, "contract_call");`
         (resolveFee handles undefined fee internally now)

      3. In src/transactions/builder.ts, update the fee parameter handling in all three functions:
         - transferStx: fee parameter type stays `bigint | undefined` for backward compat, but now it will always be provided by callers
         - callContract: same
         - deployContract: same
         No changes needed in builder.ts itself -- the `...(fee !== undefined && { fee })` pattern still works.

      4. Verify no service-level callers need changes. Since services call callContract() without a fee param, and those services are called from tools that now always pass a fee, the chain is:
         tool resolveFee() -> always bigint -> passed to service -> passed to callContract(options with fee)

         BUT: Some services (defi.service.ts, stacking.service.ts, bns.service.ts) build ContractCallOptions without fee and call callContract directly. These paths still get @stacks/transactions auto-estimate. The fix here is that the service functions should accept an optional fee parameter.

         For the most critical services, add an optional fee parameter:
         - Check if defi.service.ts, stacking.service.ts, bns.service.ts accept fee in their function signatures
         - If not, add `fee?: bigint` to their function parameters and pass it through to contractCallOptions
         - The calling tools already have resolveFee() so they can pass the resolved fee down

         NOTE: This is a larger change. If it risks scope creep, an alternative is to add a default fee resolution inside callContract() in builder.ts itself as a safety net:

         In builder.ts callContract(), if options.fee is undefined, resolve a default:
         ```typescript
         const fee = options.fee ?? await getDefaultFee(account.network, "contract_call");
         ```
         Where getDefaultFee is a new helper that fetches medium-priority clamped fee.
         This ensures ALL callContract paths are clamped, regardless of caller.

         Prefer the builder-level safety net approach as it is the smallest change that catches all paths.

      5. Add the getDefaultFee helper in builder.ts:
         ```typescript
         import { resolveFee } from "../utils/fee.js";

         async function getDefaultFee(network: Network, txType: "token_transfer" | "contract_call" | "smart_contract"): Promise<bigint> {
           const fee = await resolveFee(undefined, network, txType);
           return fee; // resolveFee now always returns bigint
         }
         ```

         Then in callContract:
         ```typescript
         const resolvedFee = options.fee ?? await getDefaultFee(account.network, "contract_call");
         ```
         And pass resolvedFee to makeContractCall.

         Similarly for transferStx and deployContract.
    </action>
    <verify>
      npm run build  # Must compile with no type errors
      npm test 2>&1 | tail -20  # All tests pass

      # Manual audit: grep for callContract calls without fee to confirm coverage
      grep -rn "callContract(account," src/services/ | grep -v "fee"
      # Should now show all calls go through builder.ts which has the safety net
    </verify>
    <done>All write paths are fee-clamped. Builder-level safety net ensures no callContract/transferStx/deployContract call can produce an unclamped fee. Tool-level callers simplified. Build and tests pass.</done>
  </task>

  <task id="3">
    <name>Commit and create PR</name>
    <files>src/utils/fee.ts, src/transactions/builder.ts, src/tools/*.ts, tests/utils/fee.test.ts</files>
    <action>
      1. Stage all changed files:
         git add src/utils/fee.ts src/transactions/builder.ts src/tools/contract.tools.ts src/tools/transfer.tools.ts src/tools/sbtc.tools.ts src/tools/tokens.tools.ts src/tools/nft.tools.ts src/tools/bitflow.tools.ts src/tools/erc8004.tools.ts tests/utils/fee.test.ts

      2. Commit with conventional commit:
         git commit -m "fix(fees): clamp all write-path fees and lower contract_call ceiling to 50k uSTX

         - resolveFee() now always returns a clamped bigint (medium priority default when fee omitted)
         - Lower contract_call and smart_contract ceiling from 100k to 50k uSTX (matches relay)
         - Add builder-level safety net: callContract/transferStx/deployContract resolve default fee when none provided
         - Fixes NotEnoughFunds on 0.88 STX wallets for complex contract calls

         Closes #332"

      3. Push and create PR:
         git push -u origin fix/fee-estimation
         gh pr create --title "fix(fees): clamp all write-path fees, lower ceiling to 50k uSTX" \
           --body "## Summary
         - resolveFee() now always returns a clamped medium-priority fee (no more undefined/auto-estimate)
         - Contract call fee ceiling lowered from 100k to 50k uSTX (matches x402-sponsor-relay)
         - Builder-level safety net ensures ALL callContract paths are clamped, even service-level calls that bypass tool-level fee resolution
         - Fixes settle-with-refresh NotEnoughFunds on low-balance wallets

         Closes #332

         ## Test plan
         - [ ] npm run build passes
         - [ ] npm test passes (fee.test.ts updated)
         - [ ] Manual: call_contract with no fee param produces fee <= 50000 uSTX
         - [ ] Manual: settle-with-refresh on 0.88 STX wallet no longer rejects"
    </action>
    <verify>
      gh pr view --json state,title  # PR created and open
      npm run build  # Final build check
    </verify>
    <done>PR created for fee estimation fix, referencing issue #332. Ready for review.</done>
  </task>
</plan>
