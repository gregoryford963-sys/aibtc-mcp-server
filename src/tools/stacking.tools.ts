import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAccount, getWalletAddress, NETWORK } from "../services/x402.service.js";
import { getStackingService } from "../services/stacking.service.js";
import { getExplorerTxUrl } from "../config/networks.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerStackingTools(server: McpServer): void {
  // Get PoX info
  server.registerTool(
    "get_pox_info",
    {
      description: "Get current Proof of Transfer (PoX) cycle information.",
    },
    async () => {
      try {
        const stackingService = getStackingService(NETWORK);
        const poxInfo = await stackingService.getPoxInfo();

        return createJsonResponse({
          network: NETWORK,
          currentCycle: poxInfo.current_cycle,
          nextCycle: poxInfo.next_cycle,
          minAmountUstx: poxInfo.min_amount_ustx,
          rewardCycleLength: poxInfo.reward_cycle_length,
          prepareCycleLength: poxInfo.prepare_cycle_length,
          currentBurnchainBlockHeight: poxInfo.current_burnchain_block_height,
          totalLiquidSupplyUstx: poxInfo.total_liquid_supply_ustx,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get stacking status
  server.registerTool(
    "get_stacking_status",
    {
      description: "Check if an address is currently stacking STX.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Wallet address to check. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const stackingService = getStackingService(NETWORK);
        const walletAddress = address || (await getWalletAddress());
        const status = await stackingService.getStackingStatus(walletAddress);

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          ...status,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get stacking rewards
  server.registerTool(
    "get_stacking_rewards",
    {
      description: "Get stacking rewards earned by an address.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Wallet address to check. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const stackingService = getStackingService(NETWORK);
        const walletAddress = address || (await getWalletAddress());
        const rewards = await stackingService.getStackingRewards(walletAddress);

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          ...rewards,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Stack STX
  server.registerTool(
    "stack_stx",
    {
      description: `Lock STX for stacking to earn BTC rewards.

Requires a Bitcoin address (hash) for receiving rewards.`,
      inputSchema: {
        amount: z.string().describe("Amount of STX to stack (in micro-STX)"),
        poxAddressVersion: z.number().describe("Bitcoin address version (0 for P2PKH, 1 for P2SH, etc.)"),
        poxAddressHashbytes: z.string().describe("Bitcoin address hash (hex string)"),
        startBurnHeight: z.number().describe("Bitcoin block height to start stacking"),
        lockPeriod: z.number().min(1).max(12).describe("Number of reward cycles to lock (1-12)"),
      },
    },
    async ({ amount, poxAddressVersion, poxAddressHashbytes, startBurnHeight, lockPeriod }) => {
      try {
        const stackingService = getStackingService(NETWORK);
        const account = await getAccount();
        const result = await stackingService.stack(
          account,
          BigInt(amount),
          { version: poxAddressVersion, hashbytes: poxAddressHashbytes },
          startBurnHeight,
          lockPeriod
        );

        return createJsonResponse({
          success: true,
          txid: result.txid,
          stacker: account.address,
          amount,
          lockPeriod,
          startBurnHeight,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Extend stacking
  server.registerTool(
    "extend_stacking",
    {
      description: "Extend an existing stacking lock period.",
      inputSchema: {
        extendCount: z.number().min(1).max(12).describe("Number of additional cycles to lock"),
        poxAddressVersion: z.number().describe("Bitcoin address version"),
        poxAddressHashbytes: z.string().describe("Bitcoin address hash (hex string)"),
      },
    },
    async ({ extendCount, poxAddressVersion, poxAddressHashbytes }) => {
      try {
        const stackingService = getStackingService(NETWORK);
        const account = await getAccount();
        const result = await stackingService.extendStacking(
          account,
          extendCount,
          { version: poxAddressVersion, hashbytes: poxAddressHashbytes }
        );

        return createJsonResponse({
          success: true,
          txid: result.txid,
          stacker: account.address,
          extendCount,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get stacking pool info
  server.registerTool(
    "get_stacking_pool_info",
    {
      description: "Get information about a stacking pool.",
      inputSchema: {
        poolAddress: z.string().describe("Pool operator's Stacks address"),
      },
    },
    async ({ poolAddress }) => {
      try {
        const stackingService = getStackingService(NETWORK);
        const info = await stackingService.getPoolInfo(poolAddress);

        return createJsonResponse({
          network: NETWORK,
          ...info,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
