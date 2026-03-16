// Jingswap Auction MCP Tools
// Query + deposit/cancel tools for the STX/sBTC blind auction on Stacks.
// Contract: SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.sbtc-stx-jingswap

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { uintCV, PostConditionMode, Pc } from "@stacks/transactions";
import { getAccount, NETWORK } from "../services/x402.service.js";
import { callContract } from "../transactions/builder.js";
import { getExplorerTxUrl } from "../config/networks.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

const JINGSWAP_API =
  process.env.JINGSWAP_API_URL || "https://faktory-dao-backend.vercel.app";
// Public default key: rate-limited per IP on the backend, same model as Hiro's public API tier.
// Set JINGSWAP_API_KEY env var for higher limits.
const JINGSWAP_API_KEY =
  process.env.JINGSWAP_API_KEY || "jc_b058d7f2e0976bd4ee34be3e5c7ba7ebe45289c55d3f5e45f666ebc14b7ebfd0";

async function jingswapGet(path: string): Promise<any> {
  const res = await fetch(`${JINGSWAP_API}${path}`, {
    headers: { "x-api-key": JINGSWAP_API_KEY },
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

  // ── Deposit STX ─────────────────────────────────────────────

  const JINGSWAP_CONTRACT_ADDRESS = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
  const JINGSWAP_CONTRACT_NAME = "sbtc-stx-jingswap";
  const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

  async function assertDepositPhase(): Promise<void> {
    const data = await jingswapGet("/api/auction/cycle-state");
    if (data.phase !== 0) {
      const phaseNames = ["deposit", "buffer", "settle"];
      throw new Error(
        `Cannot deposit/cancel — auction is in ${phaseNames[data.phase] || "unknown"} phase (must be in deposit phase)`
      );
    }
  }

  server.registerTool(
    "jingswap_deposit_stx",
    {
      description:
        "Deposit STX into the current Jingswap auction cycle. " +
        "Only works during the deposit phase. Amount is in STX (e.g. 10 for 10 STX).",
      inputSchema: {
        amount: z.number().positive().describe("Amount of STX to deposit"),
      },
    },
    async ({ amount }) => {
      try {
        await assertDepositPhase();
        const account = await getAccount();
        const microStx = BigInt(Math.floor(amount * 1_000_000));

        const result = await callContract(account, {
          contractAddress: JINGSWAP_CONTRACT_ADDRESS,
          contractName: JINGSWAP_CONTRACT_NAME,
          functionName: "deposit-stx",
          functionArgs: [uintCV(microStx)],
          postConditionMode: PostConditionMode.Deny,
          postConditions: [
            Pc.principal(account.address).willSendEq(microStx).ustx(),
          ],
        });

        return createJsonResponse({
          success: true,
          txid: result.txid,
          action: "deposit-stx",
          amount: `${amount} STX`,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Deposit sBTC ────────────────────────────────────────────

  server.registerTool(
    "jingswap_deposit_sbtc",
    {
      description:
        "Deposit sBTC into the current Jingswap auction cycle. " +
        "Only works during the deposit phase. Amount is in satoshis (e.g. 1000 for 1000 sats).",
      inputSchema: {
        amount: z.number().int().positive().describe("Amount of sBTC in satoshis"),
      },
    },
    async ({ amount }) => {
      try {
        await assertDepositPhase();
        const account = await getAccount();
        const sats = BigInt(amount);

        const result = await callContract(account, {
          contractAddress: JINGSWAP_CONTRACT_ADDRESS,
          contractName: JINGSWAP_CONTRACT_NAME,
          functionName: "deposit-sbtc",
          functionArgs: [uintCV(sats)],
          postConditionMode: PostConditionMode.Deny,
          postConditions: [
            Pc.principal(account.address)
              .willSendEq(sats)
              .ft(SBTC_CONTRACT as `${string}.${string}`, "sbtc-token"),
          ],
        });

        return createJsonResponse({
          success: true,
          txid: result.txid,
          action: "deposit-sbtc",
          amount: `${amount} sats`,
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Cancel STX Deposit ──────────────────────────────────────

  server.registerTool(
    "jingswap_cancel_stx",
    {
      description:
        "Cancel your STX deposit from the current Jingswap auction cycle and get a full refund. " +
        "Only works during the deposit phase.",
    },
    async () => {
      try {
        await assertDepositPhase();
        const account = await getAccount();

        const result = await callContract(account, {
          contractAddress: JINGSWAP_CONTRACT_ADDRESS,
          contractName: JINGSWAP_CONTRACT_NAME,
          functionName: "cancel-stx-deposit",
          functionArgs: [],
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
        });

        return createJsonResponse({
          success: true,
          txid: result.txid,
          action: "cancel-stx-deposit",
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ── Cancel sBTC Deposit ─────────────────────────────────────

  server.registerTool(
    "jingswap_cancel_sbtc",
    {
      description:
        "Cancel your sBTC deposit from the current Jingswap auction cycle and get a full refund. " +
        "Only works during the deposit phase.",
    },
    async () => {
      try {
        await assertDepositPhase();
        const account = await getAccount();

        const result = await callContract(account, {
          contractAddress: JINGSWAP_CONTRACT_ADDRESS,
          contractName: JINGSWAP_CONTRACT_NAME,
          functionName: "cancel-sbtc-deposit",
          functionArgs: [],
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
        });

        return createJsonResponse({
          success: true,
          txid: result.txid,
          action: "cancel-sbtc-deposit",
          network: NETWORK,
          explorerUrl: getExplorerTxUrl(result.txid, NETWORK),
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
        // Compute human-readable STX/BTC price from XYK pool balances
        const xykStxPerBtc =
          dex.xykBalances && dex.xykBalances.xBalance > 0
            ? (dex.xykBalances.yBalance / dex.xykBalances.xBalance / 1e6) * 1e8
            : null;
        return createJsonResponse({
          pyth,
          dex: {
            ...dex,
            xykStxPerBtc: xykStxPerBtc ? Math.round(xykStxPerBtc * 100) / 100 : null,
          },
          _hint: {
            xykStxPerBtc: "Human-readable STX per BTC from XYK pool",
            xykPrice: "Raw contract value — use xykStxPerBtc instead",
            dlmmPrice: "DLMM price — may be 0 or stale if pool inactive",
            xBalance: "sBTC in sats (÷1e8 for BTC)",
            yBalance: "STX in micro-STX (÷1e6 for STX)",
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
