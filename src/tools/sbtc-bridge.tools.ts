import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAccount, getWalletAddress, NETWORK } from "../services/x402.service.js";
import { getSbtcBridgeService } from "../services/sbtc-bridge.service.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerSbtcBridgeTools(server: McpServer): void {
  // Get deposit info (signers address, fee rates)
  server.registerTool(
    "sbtc_bridge_info",
    {
      description: `Get sBTC bridge information including deposit address and current fee rates.

Returns the signers' public key, deposit address, and fee rates for BTC → sBTC deposits.
Only available on mainnet.`,
    },
    async () => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const info = await bridgeService.getDepositInfo();

        return createJsonResponse({
          network: NETWORK,
          ...info,
          instructions: [
            "1. Use sbtc_bridge_deposit to create a deposit transaction",
            "2. The transaction will be signed and broadcast automatically",
            "3. sBTC will be minted to your Stacks address within ~3 Bitcoin blocks",
          ],
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get Bitcoin UTXOs for an address
  server.registerTool(
    "sbtc_bridge_utxos",
    {
      description: `Get available Bitcoin UTXOs for a given address.

Use this to check available BTC balance before creating a deposit.`,
      inputSchema: {
        bitcoinAddress: z
          .string()
          .describe("Bitcoin address to check UTXOs for"),
      },
    },
    async ({ bitcoinAddress }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const utxos = await bridgeService.getUtxos(bitcoinAddress);

        const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);
        const totalBtc = (totalSats / 100_000_000).toFixed(8);

        return createJsonResponse({
          network: NETWORK,
          bitcoinAddress,
          utxoCount: utxos.length,
          totalBalance: {
            sats: totalSats,
            btc: `${totalBtc} BTC`,
          },
          utxos: utxos.map((u) => ({
            txid: u.txid,
            vout: u.vout,
            value: u.value,
            valueBtc: (u.value / 100_000_000).toFixed(8),
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Create and broadcast deposit
  server.registerTool(
    "sbtc_bridge_deposit",
    {
      description: `Deposit BTC to receive sBTC on Stacks.

Creates, signs, and broadcasts a Bitcoin deposit transaction.
sBTC will be minted to the specified Stacks address after ~3 Bitcoin block confirmations.
Only available on mainnet.

Note: This requires the wallet to have Bitcoin UTXOs available.`,
      inputSchema: {
        amountSats: z
          .number()
          .int()
          .positive()
          .describe("Amount to deposit in satoshis (e.g., 100000 for 0.001 BTC)"),
        stacksAddress: z
          .string()
          .optional()
          .describe("Stacks address to receive sBTC. Defaults to configured wallet."),
        bitcoinAddress: z
          .string()
          .describe("Bitcoin address with UTXOs to spend from"),
        feeRate: z
          .enum(["low", "medium", "high"])
          .optional()
          .default("medium")
          .describe("Fee rate priority (default: medium)"),
      },
    },
    async ({ amountSats, stacksAddress, bitcoinAddress, feeRate }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const account = await getAccount();

        const recipient = stacksAddress || (await getWalletAddress());

        const result = await bridgeService.createDeposit(account, {
          amountSats,
          stacksAddress: recipient,
          bitcoinAddress,
          feeRate,
        });

        return createJsonResponse({
          success: true,
          network: NETWORK,
          message: "Deposit transaction broadcasted successfully",
          deposit: {
            txid: result.txid,
            amount: {
              sats: result.amountSats,
              btc: `${(result.amountSats / 100_000_000).toFixed(8)} BTC`,
            },
            stacksRecipient: result.stacksRecipient,
            bitcoinSource: result.bitcoinAddress,
            status: result.status,
          },
          estimatedConfirmation: "~3 Bitcoin blocks (~30 minutes)",
          checkStatus: `Use sbtc_bridge_deposit_status with txid: ${result.txid}`,
          explorerUrl: `https://mempool.space/tx/${result.txid}`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Check deposit status
  server.registerTool(
    "sbtc_bridge_deposit_status",
    {
      description: `Check the status of an sBTC deposit.

Returns the current status from the Emily API:
- pending: Waiting for Bitcoin confirmations
- accepted: Signers have accepted the deposit
- confirmed: sBTC has been minted
- failed: Deposit failed (see status message)`,
      inputSchema: {
        txid: z.string().describe("Bitcoin transaction ID of the deposit"),
        outputIndex: z
          .number()
          .int()
          .optional()
          .default(0)
          .describe("Output index (default: 0)"),
      },
    },
    async ({ txid, outputIndex }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const status = await bridgeService.getDepositStatus(txid, outputIndex);

        return createJsonResponse({
          network: NETWORK,
          deposit: {
            txid: status.txid,
            outputIndex: status.outputIndex,
            status: status.status,
            ...(status.amount && {
              amount: {
                sats: status.amount,
                btc: `${(status.amount / 100_000_000).toFixed(8)} BTC`,
              },
            }),
            ...(status.recipient && { recipient: status.recipient }),
            ...(status.lastUpdateHeight && {
              lastUpdateHeight: status.lastUpdateHeight,
            }),
            ...(status.statusMessage && { message: status.statusMessage }),
          },
          explorerUrl: `https://mempool.space/tx/${txid}`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get deposits for a recipient
  server.registerTool(
    "sbtc_bridge_deposits",
    {
      description: `Get all deposits for a Stacks recipient address.

Lists all sBTC deposits (pending, confirmed, failed) for the given Stacks address.`,
      inputSchema: {
        stacksAddress: z
          .string()
          .optional()
          .describe("Stacks address to check deposits for. Defaults to configured wallet."),
      },
    },
    async ({ stacksAddress }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const address = stacksAddress || (await getWalletAddress());
        const deposits = await bridgeService.getDepositsForRecipient(address);

        return createJsonResponse({
          network: NETWORK,
          stacksAddress: address,
          depositCount: deposits.length,
          deposits: deposits.map((d) => ({
            txid: d.txid,
            outputIndex: d.outputIndex,
            status: d.status,
            ...(d.amount && {
              amount: {
                sats: d.amount,
                btc: `${(d.amount / 100_000_000).toFixed(8)} BTC`,
              },
            }),
            ...(d.statusMessage && { message: d.statusMessage }),
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get sBTC balance
  server.registerTool(
    "sbtc_bridge_balance",
    {
      description: `Get sBTC balance for a Stacks address.

Returns the current sBTC balance in sats and BTC.`,
      inputSchema: {
        stacksAddress: z
          .string()
          .optional()
          .describe("Stacks address to check. Defaults to configured wallet."),
      },
    },
    async ({ stacksAddress }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const address = stacksAddress || (await getWalletAddress());
        const balance = await bridgeService.getSbtcBalance(address);

        return createJsonResponse({
          network: NETWORK,
          stacksAddress: address,
          balance: {
            sats: balance.balanceSats,
            btc: `${balance.balanceBtc} sBTC`,
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // =========================================================================
  // Withdrawals (sBTC → BTC)
  // =========================================================================

  // Initiate withdrawal
  server.registerTool(
    "sbtc_bridge_withdraw",
    {
      description: `Withdraw sBTC to receive BTC on Bitcoin.

Initiates a withdrawal by calling the sBTC withdrawal contract.
The contract locks your sBTC, and signers will send BTC to your Bitcoin address
after ~6 Bitcoin block confirmations (~1 hour).

Only available on mainnet.

Requirements:
- Must have sufficient sBTC balance
- Amount must be greater than 546 sats (dust limit)
- Bitcoin address must be native SegWit (bc1q...) or Taproot (bc1p...)`,
      inputSchema: {
        amountSats: z
          .number()
          .int()
          .positive()
          .describe("Amount to withdraw in satoshis (e.g., 100000 for 0.001 BTC)"),
        bitcoinAddress: z
          .string()
          .describe("Bitcoin address to receive BTC (bc1q... or bc1p...)"),
        maxFeeSats: z
          .number()
          .int()
          .optional()
          .default(10000)
          .describe("Maximum fee signers can take in sats (default: 10000)"),
      },
    },
    async ({ amountSats, bitcoinAddress, maxFeeSats }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const account = await getAccount();

        const result = await bridgeService.initiateWithdrawal(account, {
          amountSats,
          bitcoinAddress,
          maxFeeSats,
        });

        return createJsonResponse({
          success: true,
          network: NETWORK,
          message: "Withdrawal request submitted to sBTC contract",
          withdrawal: {
            txid: result.txid,
            amount: {
              sats: result.amountSats,
              btc: `${(result.amountSats / 100_000_000).toFixed(8)} BTC`,
            },
            bitcoinRecipient: result.bitcoinAddress,
            maxFee: {
              sats: result.maxFeeSats,
              btc: `${(result.maxFeeSats / 100_000_000).toFixed(8)} BTC`,
            },
            status: result.status,
          },
          estimatedConfirmation: "~6 Bitcoin blocks (~1 hour)",
          note: "sBTC is locked immediately. BTC will be sent after signers process the request.",
          explorerUrl: result.explorerUrl,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Check withdrawal status
  server.registerTool(
    "sbtc_bridge_withdrawal_status",
    {
      description: `Check the status of an sBTC withdrawal.

Returns the current status from the Emily API:
- pending: Waiting for signers to process
- accepted: Signers have accepted the withdrawal
- confirmed: BTC has been sent
- failed: Withdrawal failed (see status message)`,
      inputSchema: {
        requestId: z
          .number()
          .int()
          .describe("Withdrawal request ID from the contract"),
      },
    },
    async ({ requestId }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const status = await bridgeService.getWithdrawalStatus(requestId);

        return createJsonResponse({
          network: NETWORK,
          withdrawal: {
            requestId: status.requestId,
            status: status.status,
            ...(status.amount && {
              amount: {
                sats: status.amount,
                btc: `${(status.amount / 100_000_000).toFixed(8)} BTC`,
              },
            }),
            ...(status.recipient && { recipient: status.recipient }),
            ...(status.statusMessage && { message: status.statusMessage }),
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get withdrawals for a Bitcoin address
  server.registerTool(
    "sbtc_bridge_withdrawals",
    {
      description: `Get all withdrawals for a Bitcoin recipient address.

Lists all sBTC withdrawals (pending, confirmed, failed) for the given Bitcoin address.`,
      inputSchema: {
        bitcoinAddress: z
          .string()
          .describe("Bitcoin address to check withdrawals for (bc1q... or bc1p...)"),
      },
    },
    async ({ bitcoinAddress }) => {
      try {
        const bridgeService = getSbtcBridgeService(NETWORK);
        const withdrawals = await bridgeService.getWithdrawalsForRecipient(bitcoinAddress);

        return createJsonResponse({
          network: NETWORK,
          bitcoinAddress,
          withdrawalCount: withdrawals.length,
          withdrawals: withdrawals.map((w) => ({
            requestId: w.requestId,
            status: w.status,
            ...(w.amount && {
              amount: {
                sats: w.amount,
                btc: `${(w.amount / 100_000_000).toFixed(8)} BTC`,
              },
            }),
            ...(w.statusMessage && { message: w.statusMessage }),
          })),
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
