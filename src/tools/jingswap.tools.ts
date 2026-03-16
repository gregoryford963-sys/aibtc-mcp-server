// Jingswap Auction MCP Tools
// Read-only tools to query the STX/sBTC blind auction on Stacks.
// Contract: SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.sbtc-stx-jingswap

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";
import { PILLAR_API_URL, PILLAR_API_KEY } from "../config/pillar.js";

async function jingswapGet(path: string): Promise<any> {
  const res = await fetch(`${PILLAR_API_URL}${path}`, {
    headers: { "x-api-key": PILLAR_API_KEY },
  });
  if (!res.ok) throw new Error(`Jingswap API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "API returned failure");
  return json.data;
}

export function registerJingswapTools(server: McpServer): void {
  // ── Cycle State ──────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_cycle_state",
    {
      description:
        "Get the current Jingswap auction cycle state including phase (deposit/buffer/settle), " +
        "blocks elapsed, cycle totals (STX + sBTC deposited), and minimum deposit requirements. " +
        "Use this to understand where the auction currently stands.",
    },
    async () => {
      try {
        const data = await jingswapGet("/api/auction/cycle-state");
        return createJsonResponse({
          ...data,
          _hint: {
            phases: "0=deposit, 1=buffer, 2=settle",
            stxUnits: "micro-STX (÷1e6 for STX)",
            sbtcUnits: "satoshis (÷1e8 for sBTC)",
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Depositors ───────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_depositors",
    {
      description:
        "Get the list of STX and sBTC depositors for a specific auction cycle. " +
        "Returns arrays of Stacks addresses on each side. Max 50 depositors per side.",
      inputSchema: {
        cycle: z.number().describe("Cycle number to query"),
      },
    },
    async ({ cycle }) => {
      try {
        const data = await jingswapGet(`/api/auction/depositors/${cycle}`);
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── User Deposit ─────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_user_deposit",
    {
      description:
        "Get a specific user's deposit amounts (STX and sBTC) for a given auction cycle.",
      inputSchema: {
        cycle: z.number().describe("Cycle number"),
        address: z.string().describe("Stacks address of the depositor"),
      },
    },
    async ({ cycle, address }) => {
      try {
        const data = await jingswapGet(`/api/auction/deposit/${cycle}/${address}`);
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Settlement ───────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_settlement",
    {
      description:
        "Get settlement details for a completed auction cycle. Returns clearing price (STX/BTC), " +
        "amounts cleared, fees, and the block height at which settlement occurred. " +
        "Returns null settlement if the cycle hasn't been settled yet.",
      inputSchema: {
        cycle: z.number().describe("Cycle number to query"),
      },
    },
    async ({ cycle }) => {
      try {
        const data = await jingswapGet(`/api/auction/settlement/${cycle}`);
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Cycles History ───────────────────────────────────────────

  server.registerTool(
    "jingswap_get_cycles_history",
    {
      description:
        "Get the full history of all auction cycles from cycle 0 to the current cycle. " +
        "Each entry includes settlement data (if settled) and cycle totals. " +
        "Useful for analyzing historical auction performance and volume.",
    },
    async () => {
      try {
        const data = await jingswapGet("/api/auction/cycles-history");
        return createJsonResponse(data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── User Activity ────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_user_activity",
    {
      description:
        "Get a user's auction activity history — deposits, cancellations, fills, and settlements. " +
        "Indexed from on-chain contract events.",
      inputSchema: {
        address: z.string().describe("Stacks address to query"),
      },
    },
    async ({ address }) => {
      try {
        const data = await jingswapGet(`/api/auction/activity/${address}`);
        return createJsonResponse({
          ...data,
          _hint: {
            "distribute-stx-depositor": "stxAmount = unswapped STX rolled to next cycle, sbtcAmount = sBTC received from swap",
            "distribute-sbtc-depositor": "sbtcAmount = unswapped sats rolled to next cycle, stxAmount = STX received from swap",
            "refund-stx": "deposit rejected (e.g. duplicate or below minimum)",
            "refund-sbtc": "deposit rejected (e.g. duplicate or below minimum)",
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Oracle Prices ────────────────────────────────────────────

  server.registerTool(
    "jingswap_get_prices",
    {
      description:
        "Get current oracle and DEX prices used by the Jingswap auction. " +
        "Returns Pyth oracle prices (BTC/USD, STX/USD with confidence and freshness), " +
        "on-chain DEX prices (XYK pool with TVL, DLMM), and the derived STX/BTC price.",
    },
    async () => {
      try {
        const [pyth, dex] = await Promise.all([
          jingswapGet("/api/auction/pyth-prices"),
          jingswapGet("/api/auction/dex-price"),
        ]);
        return createJsonResponse({ pyth, dex });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
