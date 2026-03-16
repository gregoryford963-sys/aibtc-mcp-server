<?xml version="1.0" encoding="UTF-8"?>
<plan>
  <goal>Fix fee estimation issue #332: lower contract_call ceiling to 50k uSTX, apply fee clamping on ALL write paths by auto-resolving a default medium-priority fee inside callContract/deployContract/transferStx when no fee is provided, and add fee override param to call_contract tool.</goal>

  <context>
    The codebase has a resolveFee() utility in src/utils/fee.ts that fetches mempool fees and
    clamps them. It is used in: contract.tools.ts, transfer.tools.ts, sbtc.tools.ts, nft.tools.ts,
    tokens.tools.ts, erc8004.tools.ts, bitflow.tools.ts.

    However many write paths call callContract() directly with no fee argument, relying on
    @stacks/transactions auto-estimation which can return unclamped high values. These include:
    - dual-stacking.tools.ts (enroll, opt-out)
    - stacking.service.ts (stack-stx, stack-extend, stack-increase, delegate-stx, revoke-delegate)
    - defi.service.ts ALEX swap (uses makeContractCall directly, not callContract)
    - defi.service.ts Zest (supply, withdraw, borrow, repay, depositToVault, redeemFromVault)
    - bns.service.ts (preorder, register, claim)
    - sbtc-deposit.service.ts
    - tokens.service.ts, nft.service.ts, erc8004.service.ts (pass fee through)
    - stacking-lottery.tools.ts

    Current FEE_CLAMPS in src/utils/fee.ts:
      contract_call: { floor: 3000n, ceiling: 100000n }  <- needs to be 50000n

    The fix strategy: apply fee clamping INSIDE the builder functions (callContract,
    deployContract, transferStx) when no fee is provided, so every write path benefits
    automatically. This is safer and lower-risk than touching each caller.

    Reference: x402-sponsor-relay/src/services/fee.ts uses DEFAULT_CLAMPS:
      contract_call: { floor: 3000, ceiling: 50000 }
  </context>

  <task id="1">
    <name>Lower contract_call ceiling and apply automatic fee clamping in builder functions</name>
    <files>
      src/utils/fee.ts,
      src/transactions/builder.ts
    </files>
    <action>
      1. In src/utils/fee.ts:
         - Change contract_call ceiling from 100000n to 50000n
         - Change smart_contract ceiling from 100000n to 50000n (match sponsor-relay)
         - Export a new function `resolveDefaultFee(network, txType)` that always fetches
           the medium-priority clamped fee. Used when caller passes no fee (auto-estimate path).

      2. In src/transactions/builder.ts:
         - Import resolveDefaultFee from utils/fee.ts
         - In transferStx(): if fee is undefined, call resolveDefaultFee(account.network, "token_transfer")
           before building the tx
         - In callContract(): if options.fee is undefined, call resolveDefaultFee(account.network, "contract_call")
         - In deployContract(): if options.fee is undefined, call resolveDefaultFee(account.network, "smart_contract")
         - In signStxTransfer() / signContractCall(): also apply defaults for consistency

      This means ALL callers — including defi.service, stacking.service, dual-stacking, bns.service,
      stacking-lottery — automatically get clamped fees without any changes to those files.
    </action>
    <verify>
      npm run build — should succeed with no TypeScript errors.
      Grep: the ceiling value 100000n should no longer appear in fee.ts.
    </verify>
    <done>
      contract_call and smart_contract ceilings are 50000n in FEE_CLAMPS.
      builder.ts callContract/deployContract/transferStx auto-resolve a default fee when
      none is provided, using resolveFee with "medium" preset and the correct txType.
    </done>
  </task>

  <task id="2">
    <name>Add fee override parameter description update to call_contract tool</name>
    <files>
      src/tools/contract.tools.ts
    </files>
    <action>
      The fee parameter already exists in call_contract (added in a previous commit).
      Update the description to reflect the new 50k uSTX ceiling:
        "Optional fee in micro-STX or preset ('low'|'medium'|'high'). Clamped to 50,000 uSTX
         max for contract calls. If omitted, medium-priority fee is auto-resolved. Ignored when
         sponsored=true."
      Also add a clamp for user-provided fees: if the user passes a numeric fee > 50000n, clamp
      it to 50000n and log a warning. This prevents users from accidentally overpaying.
      Apply the same clamp to deploy_contract and transfer_stx tools.
    </action>
    <verify>
      npm run build — should succeed.
      Check that the inputSchema description for fee in call_contract mentions 50,000 uSTX.
    </verify>
    <done>
      call_contract fee description mentions the 50k ceiling.
      User-provided numeric fees above the ceiling are clamped before use.
    </done>
  </task>
</plan>
