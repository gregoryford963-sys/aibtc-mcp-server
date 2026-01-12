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

  // ALEX DEX
  ALEX_VAULT: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.alex-vault",
  ALEX_SWAP: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-swap-pool-v1-1",
  ALEX_ROUTER: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.swap-helper-v1-03",

  // Velar DEX
  VELAR_ROUTER: "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router",

  // Arkadiko
  ARKADIKO_ORACLE: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-oracle-v2-3",
  ARKADIKO_VAULT: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-freddie-v1-1",
  ARKADIKO_TOKEN: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token",

  // Zest Protocol
  ZEST_POOL: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v1-2",

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

  // ALEX DEX (testnet)
  ALEX_VAULT: "ST1J4G6RR643BCG8G8SR6M2D9Z9KXT2NJDRK3FBTK.alex-vault",
  ALEX_SWAP: "ST1J4G6RR643BCG8G8SR6M2D9Z9KXT2NJDRK3FBTK.amm-swap-pool-v1-1",
  ALEX_ROUTER: "ST1J4G6RR643BCG8G8SR6M2D9Z9KXT2NJDRK3FBTK.swap-helper-v1-03",

  // Velar DEX (testnet)
  VELAR_ROUTER: "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.univ2-router",

  // Arkadiko (testnet)
  ARKADIKO_ORACLE: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.arkadiko-oracle-v2-3",
  ARKADIKO_VAULT: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.arkadiko-freddie-v1-1",
  ARKADIKO_TOKEN: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.arkadiko-token",

  // Zest Protocol (testnet)
  ZEST_POOL: "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pool-borrow-v1-2",

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
    ALEX: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex",
    DIKO: MAINNET_CONTRACTS.ARKADIKO_TOKEN,
  },
  testnet: {
    STX: "native",
    sBTC: TESTNET_CONTRACTS.SBTC_TOKEN,
    USDCx: TESTNET_CONTRACTS.USDCX,
    ALEX: "ST1J4G6RR643BCG8G8SR6M2D9Z9KXT2NJDRK3FBTK.token-alex",
    DIKO: TESTNET_CONTRACTS.ARKADIKO_TOKEN,
  },
} as const;

export function getWellKnownTokens(network: Network) {
  return WELL_KNOWN_TOKENS[network];
}
