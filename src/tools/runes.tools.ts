/**
 * Runes tools
 *
 * MCP tools for the Bitcoin Runes protocol — a Bitcoin-native fungible token
 * standard introduced by Casey Rodarmor. Provides read-only access to rune
 * etchings, holders, activity, and address balances via the Hiro Runes API.
 *
 * Tools:
 * - runes_list_etchings: List all rune etchings with pagination
 * - runes_get_etching: Get details for a specific rune by name or numeric ID
 * - runes_get_holders: Get holder list for a rune
 * - runes_get_activity: Get recent mint/transfer/burn activity for a rune
 * - runes_get_address_balances: Get all rune balances for a Bitcoin address
 * - runes_get_address_activity: Get rune activity for a Bitcoin address
 *
 * Data is fetched from the Hiro Runes API (api.hiro.so/runes/v1).
 * Set HIRO_API_KEY environment variable to increase rate limits.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NETWORK, getApiBaseUrl } from "../config/networks.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";
import { getHiroApiKey } from "../utils/storage.js";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function runesApiFetch<T>(path: string): Promise<T> {
  const apiKey = (await getHiroApiKey()) || process.env.HIRO_API_KEY || "";
  const baseUrl = getApiBaseUrl(NETWORK);
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-hiro-api-key": apiKey } : {}),
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hiro Runes API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerRunesTools(server: McpServer): void {
  // --------------------------------------------------------------------------
  // runes_list_etchings — List all rune etchings
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_list_etchings",
    {
      description:
        "List all Bitcoin Rune etchings (token deployments) with pagination.\n\n" +
        "Returns rune names, IDs, supply, divisibility, symbol, etching transaction, " +
        "and other metadata for each rune.\n\n" +
        "Use runes_get_etching to get full details on a specific rune.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Number of results to return (1-60, default: 20)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default: 0)"),
      },
    },
    async ({ limit = 20, offset = 0 }) => {
      try {
        const data = await runesApiFetch(
          `/runes/v1/etchings?limit=${limit}&offset=${offset}`
        );
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // runes_get_etching — Get a specific rune by name or ID
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_get_etching",
    {
      description:
        "Get details for a specific Bitcoin Rune by its name or numeric ID.\n\n" +
        "Returns name, ID, supply info, divisibility, symbol, etching transaction, " +
        "cenotaph status, terms (mint conditions), and turbo flag.\n\n" +
        "Rune names use spacers (e.g., 'UNCOMMONGOODS' or 'UNCOMMON•GOODS').",
      inputSchema: {
        rune: z
          .string()
          .describe(
            "Rune name (e.g., 'UNCOMMONGOODS' or 'UNCOMMON•GOODS') or numeric rune ID"
          ),
      },
    },
    async ({ rune }) => {
      try {
        const encoded = encodeURIComponent(rune);
        const data = await runesApiFetch(`/runes/v1/etchings/${encoded}`);
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // runes_get_holders — Get holders of a rune
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_get_holders",
    {
      description:
        "Get the list of holders for a specific Bitcoin Rune.\n\n" +
        "Returns Bitcoin addresses and their rune balances, sorted by balance descending.\n\n" +
        "Supports pagination for runes with many holders.",
      inputSchema: {
        rune: z
          .string()
          .describe(
            "Rune name (e.g., 'UNCOMMONGOODS' or 'UNCOMMON•GOODS') or numeric rune ID"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Number of results to return (1-60, default: 20)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default: 0)"),
      },
    },
    async ({ rune, limit = 20, offset = 0 }) => {
      try {
        const encoded = encodeURIComponent(rune);
        const data = await runesApiFetch(
          `/runes/v1/etchings/${encoded}/holders?limit=${limit}&offset=${offset}`
        );
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // runes_get_activity — Get recent activity for a rune
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_get_activity",
    {
      description:
        "Get recent on-chain activity (mints, transfers, burns) for a specific Bitcoin Rune.\n\n" +
        "Returns transaction events with amounts, addresses, block heights, and timestamps.\n\n" +
        "Useful for monitoring rune distribution and trading activity.",
      inputSchema: {
        rune: z
          .string()
          .describe(
            "Rune name (e.g., 'UNCOMMONGOODS' or 'UNCOMMON•GOODS') or numeric rune ID"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Number of results to return (1-60, default: 20)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default: 0)"),
      },
    },
    async ({ rune, limit = 20, offset = 0 }) => {
      try {
        const encoded = encodeURIComponent(rune);
        const data = await runesApiFetch(
          `/runes/v1/etchings/${encoded}/activity?limit=${limit}&offset=${offset}`
        );
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // runes_get_address_balances — Get rune balances for a Bitcoin address
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_get_address_balances",
    {
      description:
        "Get all Bitcoin Rune balances for a Bitcoin address.\n\n" +
        "Returns each rune the address holds along with its balance, divisibility, " +
        "and symbol. Useful for checking which runes a wallet owns.\n\n" +
        "Address can be any Bitcoin address format (P2WPKH bc1q..., P2TR bc1p..., legacy 1..., etc.)",
      inputSchema: {
        address: z
          .string()
          .describe("Bitcoin address to check rune balances for"),
      },
    },
    async ({ address }) => {
      try {
        const encoded = encodeURIComponent(address);
        const data = await runesApiFetch(
          `/runes/v1/addresses/${encoded}/balances`
        );
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // runes_get_address_activity — Get rune activity for a Bitcoin address
  // --------------------------------------------------------------------------
  server.registerTool(
    "runes_get_address_activity",
    {
      description:
        "Get Bitcoin Rune transaction activity for a specific Bitcoin address.\n\n" +
        "Returns mints received, transfers sent/received, and burns associated with " +
        "this address across all runes.\n\n" +
        "Address can be any Bitcoin address format (P2WPKH bc1q..., P2TR bc1p..., legacy 1..., etc.)",
      inputSchema: {
        address: z
          .string()
          .describe("Bitcoin address to query rune activity for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Number of results to return (1-60, default: 20)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default: 0)"),
      },
    },
    async ({ address, limit = 20, offset = 0 }) => {
      try {
        const encoded = encodeURIComponent(address);
        const data = await runesApiFetch(
          `/runes/v1/addresses/${encoded}/activity?limit=${limit}&offset=${offset}`
        );
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
