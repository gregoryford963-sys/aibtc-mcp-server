import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAccount, getWalletAddress, NETWORK } from "../services/x402.service.js";
import { getDefiService } from "../services/defi.service.js";
import { getExplorerTxUrl } from "../config/networks.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerDefiTools(server: McpServer): void {
  // Get swap quote
  server.registerTool(
    "get_swap_quote",
    {
      description: `Get the best swap quote across multiple DEXs (ALEX, Velar, Bitflow).

Returns quotes sorted by best output amount.`,
      inputSchema: {
        tokenIn: z.string().describe("Input token (symbol or contract ID)"),
        tokenOut: z.string().describe("Output token (symbol or contract ID)"),
        amountIn: z.string().describe("Amount of input token (in smallest unit)"),
      },
    },
    async ({ tokenIn, tokenOut, amountIn }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const quotes = await defiService.getSwapQuotes(tokenIn, tokenOut, BigInt(amountIn));

        return createJsonResponse({
          network: NETWORK,
          tokenIn,
          tokenOut,
          amountIn,
          quotesCount: quotes.length,
          quotes: quotes.map((q) => ({
            protocol: q.protocol,
            amountOut: q.amountOut,
            priceImpact: q.priceImpact,
            route: q.route,
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Execute swap
  server.registerTool(
    "execute_swap",
    {
      description: "Execute a token swap on a DEX.",
      inputSchema: {
        protocol: z.enum(["alex", "velar", "bitflow"]).describe("DEX protocol to use"),
        tokenIn: z.string().describe("Input token"),
        tokenOut: z.string().describe("Output token"),
        amountIn: z.string().describe("Amount of input token"),
        minAmountOut: z.string().describe("Minimum acceptable output amount (slippage protection)"),
      },
    },
    async ({ protocol, tokenIn, tokenOut, amountIn, minAmountOut }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const account = await getAccount();

        // Get quote for the specific protocol
        const quotes = await defiService.getSwapQuotes(tokenIn, tokenOut, BigInt(amountIn));
        const quote = quotes.find((q) => q.protocol === protocol);

        if (!quote) {
          return createJsonResponse({
            error: `No quote available for ${protocol}`,
          });
        }

        const result = await defiService.executeSwap(account, quote, BigInt(minAmountOut));

        return createJsonResponse({
          success: true,
          txid: result.txid,
          protocol,
          tokenIn,
          tokenOut,
          amountIn,
          expectedAmountOut: quote.amountOut,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get pool info
  server.registerTool(
    "get_pool_info",
    {
      description: "Get information about a liquidity pool.",
      inputSchema: {
        poolId: z.string().describe("Pool ID or contract address"),
      },
    },
    async ({ poolId }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const info = await defiService.getPoolInfo(poolId);

        return createJsonResponse({
          network: NETWORK,
          ...info,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // List pools
  server.registerTool(
    "get_pools_list",
    {
      description: "List available liquidity pools.",
      inputSchema: {
        protocol: z.enum(["alex", "velar"]).optional().describe("Filter by protocol"),
      },
    },
    async ({ protocol }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const pools = await defiService.listPools(protocol);

        return createJsonResponse({
          network: NETWORK,
          poolsCount: pools.length,
          pools,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Add liquidity
  server.registerTool(
    "add_liquidity",
    {
      description: "Add liquidity to a pool.",
      inputSchema: {
        poolId: z.string().describe("Pool ID or contract address"),
        amount0: z.string().describe("Amount of first token"),
        amount1: z.string().describe("Amount of second token"),
      },
    },
    async ({ poolId, amount0, amount1 }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const account = await getAccount();
        const result = await defiService.addLiquidity(account, poolId, BigInt(amount0), BigInt(amount1));

        return createJsonResponse({
          success: true,
          txid: result.txid,
          poolId,
          amount0,
          amount1,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Remove liquidity
  server.registerTool(
    "remove_liquidity",
    {
      description: "Remove liquidity from a pool.",
      inputSchema: {
        poolId: z.string().describe("Pool ID or contract address"),
        lpAmount: z.string().describe("Amount of LP tokens to burn"),
      },
    },
    async ({ poolId, lpAmount }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const account = await getAccount();
        const result = await defiService.removeLiquidity(account, poolId, BigInt(lpAmount));

        return createJsonResponse({
          success: true,
          txid: result.txid,
          poolId,
          lpAmount,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get lending markets
  server.registerTool(
    "get_lending_markets",
    {
      description: "List lending/borrowing markets from Zest and Arkadiko.",
    },
    async () => {
      try {
        const defiService = getDefiService(NETWORK);
        const markets = await defiService.getLendingMarkets();

        return createJsonResponse({
          network: NETWORK,
          marketsCount: markets.length,
          markets,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get DeFi positions
  server.registerTool(
    "get_defi_positions",
    {
      description: "Get all DeFi positions (liquidity, lending, staking) for an address.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Wallet address to check. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const defiService = getDefiService(NETWORK);
        const walletAddress = address || (await getWalletAddress());
        const positions = await defiService.getPositions(walletAddress);

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          positionsCount: positions.length,
          positions,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
