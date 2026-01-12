import { StacksNetworkName } from "@stacks/network";

export type Network = "mainnet" | "testnet";

export const NETWORK: Network =
  process.env.NETWORK === "mainnet" ? "mainnet" : "testnet";

export const API_URL = process.env.API_URL || "https://x402.biwas.xyz";

export function getStacksNetwork(network: Network): StacksNetworkName {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export function getApiBaseUrl(network: Network): string {
  return network === "mainnet"
    ? "https://api.mainnet.hiro.so"
    : "https://api.testnet.hiro.so";
}

export function getExplorerUrl(network: Network): string {
  return network === "mainnet"
    ? "https://explorer.stacks.co"
    : "https://explorer.stacks.co";
}

export function getExplorerTxUrl(txid: string, network: Network): string {
  return `${getExplorerUrl(network)}/txid/${txid}?chain=${network}`;
}

export function getExplorerAddressUrl(address: string, network: Network): string {
  return `${getExplorerUrl(network)}/address/${address}?chain=${network}`;
}

export function getExplorerContractUrl(contractId: string, network: Network): string {
  return `${getExplorerUrl(network)}/txid/${contractId}?chain=${network}`;
}
