import { ClarityValue, uintCV, tupleCV, bufferCV, noneCV, someCV } from "@stacks/transactions";
import { HiroApiService, getHiroApi, PoxInfo } from "./hiro-api.js";
import { getContracts, parseContractId, type Network } from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";

// ============================================================================
// Types
// ============================================================================

export interface StackingStatus {
  stacked: boolean;
  amountMicroStx: string;
  amountStx: string;
  firstRewardCycle: number;
  lockPeriod: number;
  unlockHeight: number;
  poxAddress?: string;
}

// ============================================================================
// Stacking Service
// ============================================================================

export class StackingService {
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.contracts = getContracts(network);
  }

  /**
   * Get current PoX (Proof of Transfer) info
   */
  async getPoxInfo(): Promise<PoxInfo> {
    return this.hiro.getPoxInfo();
  }

  /**
   * Get stacking status for an address
   * Note: Returns whether the address is stacking, but detailed amounts require proper CV parsing
   */
  async getStackingStatus(address: string): Promise<StackingStatus> {
    try {
      const result = await this.hiro.callReadOnlyFunction(
        this.contracts.POX_4,
        "get-stacker-info",
        [{ type: "principal", value: address } as unknown as ClarityValue],
        address
      );

      if (result.okay && result.result) {
        const isStacked = result.result.includes("some");
        return {
          stacked: isStacked,
          amountMicroStx: "0", // Requires CV parsing
          amountStx: "0",
          firstRewardCycle: 0,
          lockPeriod: 0,
          unlockHeight: 0,
        };
      }
    } catch {
      // Stacker info not found
    }

    return {
      stacked: false,
      amountMicroStx: "0",
      amountStx: "0",
      firstRewardCycle: 0,
      lockPeriod: 0,
      unlockHeight: 0,
    };
  }


  /**
   * Stack STX tokens
   */
  async stack(
    account: Account,
    amount: bigint,
    poxAddress: { version: number; hashbytes: string },
    startBurnHeight: number,
    lockPeriod: number
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.POX_4);

    const functionArgs: ClarityValue[] = [
      uintCV(amount),
      tupleCV({
        version: bufferCV(Buffer.from([poxAddress.version])),
        hashbytes: bufferCV(Buffer.from(poxAddress.hashbytes, "hex")),
      }),
      uintCV(startBurnHeight),
      uintCV(lockPeriod),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "stack-stx",
      functionArgs,
    });
  }

  /**
   * Extend stacking period
   */
  async extendStacking(
    account: Account,
    extendCount: number,
    poxAddress: { version: number; hashbytes: string }
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.POX_4);

    const functionArgs: ClarityValue[] = [
      uintCV(extendCount),
      tupleCV({
        version: bufferCV(Buffer.from([poxAddress.version])),
        hashbytes: bufferCV(Buffer.from(poxAddress.hashbytes, "hex")),
      }),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "stack-extend",
      functionArgs,
    });
  }

  /**
   * Increase stacking amount
   */
  async increaseStacking(
    account: Account,
    increaseAmount: bigint
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.POX_4);

    const functionArgs: ClarityValue[] = [uintCV(increaseAmount)];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "stack-increase",
      functionArgs,
    });
  }

  /**
   * Delegate STX to a stacking pool
   */
  async delegateStx(
    account: Account,
    amount: bigint,
    delegateTo: string,
    untilBurnHeight?: number,
    poxAddress?: { version: number; hashbytes: string }
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.POX_4);

    const functionArgs: ClarityValue[] = [
      uintCV(amount),
      { type: "principal", value: delegateTo } as unknown as ClarityValue,
      untilBurnHeight ? someCV(uintCV(untilBurnHeight)) : noneCV(),
      poxAddress
        ? someCV(tupleCV({
            version: bufferCV(Buffer.from([poxAddress.version])),
            hashbytes: bufferCV(Buffer.from(poxAddress.hashbytes, "hex")),
          }))
        : noneCV(),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "delegate-stx",
      functionArgs,
    });
  }

  /**
   * Revoke delegation
   */
  async revokeDelegation(account: Account): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.POX_4);

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "revoke-delegate-stx",
      functionArgs: [],
    });
  }

}

// ============================================================================
// Helper Functions
// ============================================================================

let _stackingServiceInstance: StackingService | null = null;

export function getStackingService(network: Network): StackingService {
  if (!_stackingServiceInstance || _stackingServiceInstance["network"] !== network) {
    _stackingServiceInstance = new StackingService(network);
  }
  return _stackingServiceInstance;
}
