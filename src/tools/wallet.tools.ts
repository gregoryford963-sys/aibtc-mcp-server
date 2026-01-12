import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWalletAddress, NETWORK, API_URL } from "../services/x402.service.js";
import { getStxBalance } from "../services/hiro-api.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerWalletTools(server: McpServer): void {
  // Get wallet info
  server.registerTool(
    "get_wallet_info",
    {
      description: "Get the configured wallet address, network, and API URL.",
    },
    async () => {
      try {
        const address = await getWalletAddress();
        return createJsonResponse({
          address,
          network: NETWORK,
          apiUrl: API_URL,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get STX balance
  server.registerTool(
    "get_stx_balance",
    {
      description: "Get the STX balance for a wallet address.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Wallet address to check. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const walletAddress = address || (await getWalletAddress());
        const balance = await getStxBalance(walletAddress, NETWORK);

        const stxBalance = (BigInt(balance.stx) / BigInt(1000000)).toString();
        const stxLocked = (BigInt(balance.stxLocked) / BigInt(1000000)).toString();

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          balance: {
            stx: stxBalance + " STX",
            microStx: balance.stx,
          },
          locked: {
            stx: stxLocked + " STX",
            microStx: balance.stxLocked,
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
