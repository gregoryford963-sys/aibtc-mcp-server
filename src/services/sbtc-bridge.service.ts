import {
  sbtcDepositHelper,
  SbtcApiClientMainnet,
  SbtcApiClientTestnet,
  SbtcApiClient,
} from "sbtc";
import { hex, bech32, bech32m } from "@scure/base";
import { type Network, getContracts, parseContractId } from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";
import * as secp from "@noble/secp256k1";
import {
  uintCV,
  tupleCV,
  bufferCV,
} from "@stacks/transactions";

// ============================================================================
// Types
// ============================================================================

export interface DepositInfo {
  depositAddress: string;
  signersPublicKey: string;
  feeRates: {
    low: number;
    medium: number;
    high: number;
  };
  limits: {
    minDeposit: string;
    maxDeposit: string;
  };
}

export interface DepositRequest {
  amountSats: number;
  stacksAddress: string;
  bitcoinAddress: string;
  feeRate?: "low" | "medium" | "high";
}

export interface DepositResult {
  txid: string;
  amountSats: number;
  stacksRecipient: string;
  bitcoinAddress: string;
  status: "pending" | "broadcasted";
  depositScript: string;
  reclaimScript: string;
}

export interface DepositStatus {
  txid: string;
  outputIndex: number;
  status: "pending" | "accepted" | "confirmed" | "failed";
  amount?: number;
  recipient?: string;
  lastUpdateHeight?: number;
  statusMessage?: string;
}

export interface WithdrawalRequest {
  amountSats: number;
  bitcoinAddress: string;
  maxFeeSats?: number;
}

export interface WithdrawalResult {
  txid: string;
  amountSats: number;
  bitcoinAddress: string;
  maxFeeSats: number;
  status: "pending";
  explorerUrl: string;
}

export interface WithdrawalStatus {
  requestId: number;
  status: "pending" | "accepted" | "confirmed" | "failed";
  amount?: number;
  recipient?: string;
  statusMessage?: string;
}

// Bitcoin address version bytes for recipient encoding
const BITCOIN_ADDRESS_VERSIONS = {
  P2PKH: 0x00,
  P2SH: 0x01,
  P2SH_P2WPKH: 0x02,
  P2SH_P2WSH: 0x03,
  P2WPKH: 0x04,
  P2WSH: 0x05,
  P2TR: 0x06,
} as const;

// ============================================================================
// sBTC Bridge Service
// ============================================================================

export class SbtcBridgeService {
  private client: SbtcApiClient;

  constructor(private network: Network) {
    this.client =
      network === "mainnet"
        ? new SbtcApiClientMainnet()
        : new SbtcApiClientTestnet();
  }

  private ensureMainnet(): void {
    if (this.network !== "mainnet") {
      throw new Error(
        "sBTC bridge is currently only available on mainnet. Testnet support coming soon."
      );
    }
  }

  /**
   * Get current deposit info including signers address and fee rates
   */
  async getDepositInfo(): Promise<DepositInfo> {
    this.ensureMainnet();

    const [signersPublicKey, signersAddress, lowFee, mediumFee, highFee] =
      await Promise.all([
        this.client.fetchSignersPublicKey(),
        this.client.fetchSignersAddress(),
        this.client.fetchFeeRate("low"),
        this.client.fetchFeeRate("medium"),
        this.client.fetchFeeRate("high"),
      ]);

    return {
      depositAddress: signersAddress,
      signersPublicKey,
      feeRates: {
        low: lowFee,
        medium: mediumFee,
        high: highFee,
      },
      limits: {
        minDeposit: "546 sats (dust limit)",
        maxDeposit: "Subject to current sBTC cap",
      },
    };
  }

  /**
   * Get UTXOs for a Bitcoin address
   */
  async getUtxos(
    bitcoinAddress: string
  ): Promise<Array<{ txid: string; vout: number; value: number }>> {
    const utxos = await this.client.fetchUtxos(bitcoinAddress);
    return utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
    }));
  }

  /**
   * Create and broadcast a deposit transaction
   *
   * Flow:
   * 1. Build deposit transaction with sbtcDepositHelper
   * 2. Sign with provided private key
   * 3. Broadcast to Bitcoin network
   * 4. Notify Emily API
   */
  async createDeposit(
    account: Account,
    request: DepositRequest
  ): Promise<DepositResult> {
    this.ensureMainnet();

    const { amountSats, stacksAddress, bitcoinAddress, feeRate = "medium" } = request;

    // Derive the reclaim public key from the private key
    // This is the x-only public key used for Taproot
    const privateKeyBytes = hex.decode(account.privateKey.replace("0x", ""));
    const fullPubKey = secp.getPublicKey(privateKeyBytes, true);
    // x-only public key is the last 32 bytes of the compressed public key
    const reclaimPublicKey = hex.encode(fullPubKey.slice(1));

    // Fetch required data
    const [signersPublicKey, currentFeeRate, utxos] = await Promise.all([
      this.client.fetchSignersPublicKey(),
      this.client.fetchFeeRate(feeRate),
      this.client.fetchUtxos(bitcoinAddress),
    ]);

    if (utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${bitcoinAddress}`);
    }

    // Calculate total available
    const totalAvailable = utxos.reduce(
      (sum: number, u: { value: number }) => sum + u.value,
      0
    );
    if (totalAvailable < amountSats) {
      throw new Error(
        `Insufficient funds: have ${totalAvailable} sats, need ${amountSats} sats`
      );
    }

    // Build the deposit transaction
    const deposit = await sbtcDepositHelper({
      amountSats,
      stacksAddress,
      signersPublicKey,
      feeRate: currentFeeRate,
      utxos,
      bitcoinChangeAddress: bitcoinAddress,
      reclaimPublicKey,
    });

    // Sign the transaction
    deposit.transaction.sign(privateKeyBytes);
    deposit.transaction.finalize();

    // Broadcast to Bitcoin network
    const txid = await this.client.broadcastTx(deposit.transaction);

    // Notify Emily API about the deposit
    await this.client.notifySbtc({
      depositScript: deposit.depositScript,
      reclaimScript: deposit.reclaimScript,
      transaction: deposit.transaction,
    });

    return {
      txid,
      amountSats,
      stacksRecipient: stacksAddress,
      bitcoinAddress,
      status: "broadcasted",
      depositScript: deposit.depositScript,
      reclaimScript: deposit.reclaimScript,
    };
  }

  /**
   * Get deposit status from Emily API
   */
  async getDepositStatus(txid: string, outputIndex: number = 0): Promise<DepositStatus> {
    this.ensureMainnet();

    // Emily API endpoint: GET /deposit/{txid}/{index}
    const emilyBaseUrl = "https://beta.sbtc-emily.com";
    const response = await fetch(`${emilyBaseUrl}/deposit/${txid}/${outputIndex}`);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          txid,
          outputIndex,
          status: "pending",
          statusMessage: "Deposit not yet indexed by Emily. It may take a few minutes after broadcast.",
        };
      }
      throw new Error(`Emily API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      txid,
      outputIndex,
      status: data.status?.toLowerCase() || "pending",
      amount: data.amount,
      recipient: data.recipient,
      lastUpdateHeight: data.last_update_height,
      statusMessage: data.status_message,
    };
  }

  /**
   * Get all deposits for a Stacks recipient address
   */
  async getDepositsForRecipient(
    stacksAddress: string
  ): Promise<Array<DepositStatus>> {
    this.ensureMainnet();

    const emilyBaseUrl = "https://beta.sbtc-emily.com";
    const response = await fetch(
      `${emilyBaseUrl}/deposit/recipient/${stacksAddress}`
    );

    if (!response.ok) {
      throw new Error(`Emily API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.deposits || []).map((d: any) => ({
      txid: d.bitcoin_txid,
      outputIndex: d.bitcoin_tx_output_index,
      status: d.status?.toLowerCase() || "pending",
      amount: d.amount,
      recipient: d.recipient,
      lastUpdateHeight: d.last_update_height,
      statusMessage: d.status_message,
    }));
  }

  /**
   * Get sBTC balance for a Stacks address
   */
  async getSbtcBalance(stacksAddress: string): Promise<{
    balance: string;
    balanceSats: string;
    balanceBtc: string;
  }> {
    const balance = await this.client.fetchSbtcBalance(stacksAddress);
    const balanceSats = balance.toString();
    const balanceBtc = (Number(balance) / 100_000_000).toFixed(8);

    return {
      balance: balanceSats,
      balanceSats,
      balanceBtc,
    };
  }

  /**
   * Parse a Bitcoin address into the contract recipient format
   * Returns { version: Buffer, hashbytes: Buffer }
   */
  private parseBitcoinAddress(
    bitcoinAddress: string
  ): { version: Uint8Array; hashbytes: Uint8Array } {
    // Try bech32m first (P2TR - Taproot)
    try {
      const decoded = bech32m.decode(bitcoinAddress as `${string}1${string}`);
      if (decoded.prefix === "bc" || decoded.prefix === "tb") {
        const words = decoded.words;
        const witnessVersion = words[0];
        const data = bech32m.fromWords(words.slice(1));

        if (witnessVersion === 1 && data.length === 32) {
          // P2TR (Taproot)
          return {
            version: new Uint8Array([BITCOIN_ADDRESS_VERSIONS.P2TR]),
            hashbytes: new Uint8Array(data),
          };
        }
      }
    } catch {
      // Not bech32m, try bech32
    }

    // Try bech32 (P2WPKH, P2WSH)
    try {
      const decoded = bech32.decode(bitcoinAddress as `${string}1${string}`);
      if (decoded.prefix === "bc" || decoded.prefix === "tb") {
        const words = decoded.words;
        const witnessVersion = words[0];
        const data = bech32.fromWords(words.slice(1));

        if (witnessVersion === 0) {
          if (data.length === 20) {
            // P2WPKH
            // Pad to 32 bytes (contract expects 32-byte hashbytes)
            const padded = new Uint8Array(32);
            padded.set(new Uint8Array(data));
            return {
              version: new Uint8Array([BITCOIN_ADDRESS_VERSIONS.P2WPKH]),
              hashbytes: padded,
            };
          } else if (data.length === 32) {
            // P2WSH
            return {
              version: new Uint8Array([BITCOIN_ADDRESS_VERSIONS.P2WSH]),
              hashbytes: new Uint8Array(data),
            };
          }
        }
      }
    } catch {
      // Not bech32
    }

    throw new Error(
      `Unsupported Bitcoin address format: ${bitcoinAddress}. ` +
        "Use a native SegWit (bc1q...) or Taproot (bc1p...) address."
    );
  }

  /**
   * Initiate a withdrawal request (sBTC → BTC)
   *
   * Flow:
   * 1. Parse Bitcoin address into contract format
   * 2. Call sbtc-withdrawal.initiate-withdrawal-request
   * 3. Contract locks sBTC and creates withdrawal request
   * 4. Signers will process and send BTC (~6 blocks)
   */
  async initiateWithdrawal(
    account: Account,
    request: WithdrawalRequest
  ): Promise<WithdrawalResult> {
    this.ensureMainnet();

    const { amountSats, bitcoinAddress, maxFeeSats = 10000 } = request;
    const contracts = getContracts(this.network);

    // Validate amount
    if (amountSats <= 546) {
      throw new Error("Withdrawal amount must be greater than 546 sats (dust limit)");
    }

    // Parse Bitcoin address
    const recipient = this.parseBitcoinAddress(bitcoinAddress);

    // Get withdrawal contract
    const { address: contractAddress, name: contractName } = parseContractId(
      contracts.SBTC_WITHDRAWAL
    );

    // Build the contract call
    const result = await callContract(account, {
      contractAddress,
      contractName,
      functionName: "initiate-withdrawal-request",
      functionArgs: [
        uintCV(BigInt(amountSats)),
        tupleCV({
          version: bufferCV(recipient.version),
          hashbytes: bufferCV(recipient.hashbytes),
        }),
        uintCV(BigInt(maxFeeSats)),
      ],
    });

    return {
      txid: result.txid,
      amountSats,
      bitcoinAddress,
      maxFeeSats,
      status: "pending",
      explorerUrl: `https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`,
    };
  }

  /**
   * Get withdrawal status from Emily API
   */
  async getWithdrawalStatus(requestId: number): Promise<WithdrawalStatus> {
    this.ensureMainnet();

    const emilyBaseUrl = "https://beta.sbtc-emily.com";
    const response = await fetch(`${emilyBaseUrl}/withdrawal/${requestId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          requestId,
          status: "pending",
          statusMessage: "Withdrawal not yet indexed by Emily. It may take a few minutes after the Stacks tx confirms.",
        };
      }
      throw new Error(`Emily API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      requestId,
      status: data.status?.toLowerCase() || "pending",
      amount: data.amount,
      recipient: data.recipient,
      statusMessage: data.status_message,
    };
  }

  /**
   * Get all withdrawals for a Bitcoin recipient address
   */
  async getWithdrawalsForRecipient(
    bitcoinAddress: string
  ): Promise<Array<WithdrawalStatus>> {
    this.ensureMainnet();

    // Parse address to get the scriptPubKey hex
    const recipient = this.parseBitcoinAddress(bitcoinAddress);
    const scriptPubKey = hex.encode(
      new Uint8Array([...recipient.version, ...recipient.hashbytes])
    );

    const emilyBaseUrl = "https://beta.sbtc-emily.com";
    const response = await fetch(
      `${emilyBaseUrl}/withdrawal/recipient/${scriptPubKey}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Emily API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.withdrawals || []).map((w: any) => ({
      requestId: w.request_id,
      status: w.status?.toLowerCase() || "pending",
      amount: w.amount,
      recipient: w.recipient,
      statusMessage: w.status_message,
    }));
  }
}

// ============================================================================
// Service Singleton
// ============================================================================

let _bridgeServiceInstance: SbtcBridgeService | null = null;

export function getSbtcBridgeService(network: Network): SbtcBridgeService {
  if (!_bridgeServiceInstance || _bridgeServiceInstance["network"] !== network) {
    _bridgeServiceInstance = new SbtcBridgeService(network);
  }
  return _bridgeServiceInstance;
}
