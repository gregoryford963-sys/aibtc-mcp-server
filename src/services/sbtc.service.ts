import { ClarityValue, uintCV, principalCV } from "@stacks/transactions";
import { HiroApiService, getHiroApi } from "./hiro-api.js";
import { getContracts, parseContractId, type Network } from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";

// ============================================================================
// Types
// ============================================================================

export interface SbtcBalance {
  balance: string;
  balanceSats: string;
  balanceBtc: string;
}

export interface SbtcPegInfo {
  totalSupply: string;
  totalSupplySats: string;
  totalSupplyBtc: string;
  pegRatio: string;
}

export interface SbtcDepositInfo {
  depositAddress: string;
  minDeposit: string;
  maxDeposit: string;
  instructions: string[];
}

// ============================================================================
// sBTC Service
// ============================================================================

export class SbtcService {
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.contracts = getContracts(network);
  }

  /**
   * Get sBTC balance for an address
   */
  async getBalance(address: string): Promise<SbtcBalance> {
    const sbtcContract = this.contracts.SBTC_TOKEN;
    const balance = await this.hiro.getTokenBalance(address, sbtcContract);

    // sBTC uses 8 decimals (same as Bitcoin)
    const balanceSats = balance;
    const balanceBtc = (BigInt(balance) / BigInt(100_000_000)).toString();

    return {
      balance,
      balanceSats,
      balanceBtc,
    };
  }

  /**
   * Transfer sBTC to a recipient
   */
  async transfer(
    account: Account,
    recipient: string,
    amount: bigint,
    memo?: string
  ): Promise<TransferResult> {
    const sbtcContract = this.contracts.SBTC_TOKEN;
    const { address: contractAddress, name: contractName } = parseContractId(sbtcContract);

    const functionArgs: ClarityValue[] = [
      uintCV(amount),
      principalCV(account.address),
      principalCV(recipient),
    ];

    // Add memo if provided
    if (memo) {
      // sBTC transfer typically has an optional memo parameter
      // Implementation depends on the specific sBTC contract version
    }

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "transfer",
      functionArgs,
    });
  }

  /**
   * Get sBTC deposit information
   */
  async getDepositInfo(): Promise<SbtcDepositInfo> {
    // Note: sBTC deposit requires Bitcoin network interaction
    // This returns placeholder info - actual implementation would query sBTC bridge API
    return {
      depositAddress: "Deposit requires sBTC bridge integration",
      minDeposit: "0.0001 BTC",
      maxDeposit: "No limit",
      instructions: [
        "1. sBTC deposits are made from Bitcoin network",
        "2. Send BTC to the sBTC deposit address",
        "3. Include your Stacks address in the OP_RETURN",
        "4. Wait for 3 Bitcoin block confirmations",
        "5. sBTC will be minted to your Stacks address",
      ],
    };
  }

  /**
   * Get sBTC peg information
   */
  async getPegInfo(): Promise<SbtcPegInfo> {
    const sbtcContract = this.contracts.SBTC_TOKEN;

    try {
      // Try to get total supply from contract
      const metadata = await this.hiro.getTokenMetadata(sbtcContract);

      const totalSupply = metadata?.total_supply || "0";
      const totalSupplySats = totalSupply;
      const totalSupplyBtc = (BigInt(totalSupply) / BigInt(100_000_000)).toString();

      return {
        totalSupply,
        totalSupplySats,
        totalSupplyBtc,
        pegRatio: "1:1",
      };
    } catch {
      return {
        totalSupply: "0",
        totalSupplySats: "0",
        totalSupplyBtc: "0",
        pegRatio: "1:1",
      };
    }
  }

  /**
   * Get sBTC withdrawal status
   * Note: This is a placeholder - actual implementation would query sBTC bridge
   */
  async getWithdrawalStatus(operationId: string): Promise<{
    status: string;
    btcTxId?: string;
    confirmations?: number;
  }> {
    // sBTC withdrawals require bridge API integration
    return {
      status: "Withdrawal status requires sBTC bridge API integration",
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

let _sbtcServiceInstance: SbtcService | null = null;

export function getSbtcService(network: Network): SbtcService {
  if (!_sbtcServiceInstance || _sbtcServiceInstance["network"] !== network) {
    _sbtcServiceInstance = new SbtcService(network);
  }
  return _sbtcServiceInstance;
}
