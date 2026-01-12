import { Network } from "./networks.js";

/**
 * Known contract addresses for mainnet
 */
export const MAINNET_CONTRACTS = {
  // sBTC
  SBTC_TOKEN: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-token",
  SBTC_DEPOSIT: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-deposit",
  SBTC_REGISTRY: "SM3VDXK3WZZSA84XXFQ5FDMR6S8N5XQSEK4KMR5E5.sbtc-registry",

  // Stablecoins
  USDCX: "SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-usdcx",

  // BNS
  BNS: "SP000000000000000000002Q6VF78.bns",

  // Stacking
  POX_4: "SP000000000000000000002Q6VF78.pox-4",
} as const;

/**
 * Known contract addresses for testnet
 */
export const TESTNET_CONTRACTS = {
  // sBTC (testnet)
  SBTC_TOKEN: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token",
  SBTC_DEPOSIT: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-deposit",
  SBTC_REGISTRY: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-registry",

  // Stablecoins
  USDCX: "ST2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-usdcx",

  // BNS
  BNS: "ST000000000000000000002AMW42H.bns",

  // Stacking
  POX_4: "ST000000000000000000002AMW42H.pox-4",
} as const;

/**
 * Get contract addresses for the specified network
 */
export function getContracts(network: Network) {
  return network === "mainnet" ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
}

/**
 * Parse a contract identifier into address and name
 */
export function parseContractId(contractId: string): { address: string; name: string } {
  const [address, name] = contractId.split(".");
  if (!address || !name) {
    throw new Error(`Invalid contract ID: ${contractId}`);
  }
  return { address, name };
}

/**
 * Common token contract IDs
 */
export const WELL_KNOWN_TOKENS = {
  mainnet: {
    STX: "native",
    sBTC: MAINNET_CONTRACTS.SBTC_TOKEN,
    USDCx: MAINNET_CONTRACTS.USDCX,
  },
  testnet: {
    STX: "native",
    sBTC: TESTNET_CONTRACTS.SBTC_TOKEN,
    USDCx: TESTNET_CONTRACTS.USDCX,
  },
} as const;

export function getWellKnownTokens(network: Network) {
  return WELL_KNOWN_TOKENS[network];
}
