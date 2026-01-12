import { ClarityValue, bufferCV, uintCV, stringUtf8CV } from "@stacks/transactions";
import { HiroApiService, getHiroApi, BnsName } from "./hiro-api.js";
import { getContracts, parseContractId, type Network } from "../config/index.js";
import { callContract, type Account, type TransferResult } from "../transactions/builder.js";

// ============================================================================
// Types
// ============================================================================

export interface BnsLookupResult {
  name: string;
  address: string;
  namespace: string;
  expireBlock: number;
  zonefile?: string;
}

export interface BnsNameInfo {
  name: string;
  namespace: string;
  address: string;
  expireBlock: number;
  gracePeriod: number;
  status: string;
  zonefile?: string;
  zonefileHash?: string;
  lastTxId: string;
}

export interface BnsPrice {
  units: string;
  amount: string;
  amountStx: string;
}

// ============================================================================
// BNS Service
// ============================================================================

export class BnsService {
  private hiro: HiroApiService;
  private contracts: ReturnType<typeof getContracts>;

  constructor(private network: Network) {
    this.hiro = getHiroApi(network);
    this.contracts = getContracts(network);
  }

  /**
   * Lookup a BNS name and get the associated address
   */
  async lookupName(name: string): Promise<BnsLookupResult | null> {
    try {
      const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
      const info = await this.hiro.getBnsNameInfo(fullName);

      const [baseName, namespace] = fullName.split(".");

      return {
        name: fullName,
        address: info.address,
        namespace: namespace || "btc",
        expireBlock: info.expire_block,
        zonefile: info.zonefile,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reverse lookup - get BNS names for an address
   */
  async reverseLookup(address: string): Promise<string[]> {
    try {
      const result = await this.hiro.getBnsNamesOwnedByAddress(address);
      return result.names || [];
    } catch {
      return [];
    }
  }

  /**
   * Get detailed info about a BNS name
   */
  async getNameInfo(name: string): Promise<BnsNameInfo | null> {
    try {
      const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
      const info = await this.hiro.getBnsNameInfo(fullName);

      const [baseName, namespace] = fullName.split(".");

      return {
        name: fullName,
        namespace: namespace || "btc",
        address: info.address,
        expireBlock: info.expire_block,
        gracePeriod: info.grace_period,
        status: info.status,
        zonefile: info.zonefile,
        zonefileHash: info.zonefile_hash,
        lastTxId: info.last_txid,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a BNS name is available
   */
  async checkAvailability(name: string): Promise<boolean> {
    const info = await this.lookupName(name);
    return info === null;
  }

  /**
   * Get the price of a BNS name
   */
  async getPrice(name: string): Promise<BnsPrice | null> {
    try {
      const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
      const [baseName] = fullName.split(".");

      const price = await this.hiro.getBnsNamePrice(baseName);

      const amountMicroStx = price.amount;
      const amountStx = (BigInt(amountMicroStx) / BigInt(1_000_000)).toString();

      return {
        units: price.units,
        amount: amountMicroStx,
        amountStx,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all domains owned by an address
   */
  async getUserDomains(address: string): Promise<string[]> {
    return this.reverseLookup(address);
  }

  /**
   * Resolve a name to an address (convenient wrapper)
   */
  async resolve(name: string): Promise<string | null> {
    const result = await this.lookupName(name);
    return result?.address || null;
  }

  /**
   * Register a new BNS name
   * Note: BNS registration is a multi-step process involving preorder and register
   */
  async preorderName(
    account: Account,
    name: string,
    salt: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    // Create the hashed salted name for preorder
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256")
      .update(Buffer.from(fullName + salt))
      .digest();

    const functionArgs: ClarityValue[] = [
      bufferCV(hash),
      uintCV(0), // STX to burn (registration fee)
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-preorder",
      functionArgs,
    });
  }

  /**
   * Register a name after preorder
   */
  async registerName(
    account: Account,
    name: string,
    salt: string,
    zonefile?: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      bufferCV(Buffer.from(salt)),
      zonefile ? bufferCV(Buffer.from(zonefile)) : bufferCV(Buffer.alloc(0)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-register",
      functionArgs,
    });
  }

  /**
   * Update a name's zonefile
   */
  async updateZonefile(
    account: Account,
    name: string,
    zonefile: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      bufferCV(Buffer.from(zonefile)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-update",
      functionArgs,
    });
  }

  /**
   * Transfer a BNS name to a new owner
   */
  async transferName(
    account: Account,
    name: string,
    newOwner: string,
    zonefile?: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      { type: "principal", value: newOwner } as unknown as ClarityValue,
      zonefile ? bufferCV(Buffer.from(zonefile)) : bufferCV(Buffer.alloc(0)),
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-transfer",
      functionArgs,
    });
  }

  /**
   * Renew a BNS name
   */
  async renewName(
    account: Account,
    name: string
  ): Promise<TransferResult> {
    const { address: contractAddress, name: contractName } = parseContractId(this.contracts.BNS);

    const fullName = name.endsWith(".btc") ? name : `${name}.btc`;
    const [baseName, namespace] = fullName.split(".");

    const functionArgs: ClarityValue[] = [
      bufferCV(Buffer.from(namespace)),
      bufferCV(Buffer.from(baseName)),
      uintCV(0), // STX to burn (renewal fee)
    ];

    return callContract(account, {
      contractAddress,
      contractName,
      functionName: "name-renewal",
      functionArgs,
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

let _bnsServiceInstance: BnsService | null = null;

export function getBnsService(network: Network): BnsService {
  if (!_bnsServiceInstance || _bnsServiceInstance["network"] !== network) {
    _bnsServiceInstance = new BnsService(network);
  }
  return _bnsServiceInstance;
}
