import "dotenv/config";
import axios, { type AxiosInstance } from "axios";
import { withPaymentInterceptor } from "x402-stacks";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { NETWORK, API_URL, type Network } from "../config/networks.js";
import type { Account } from "../transactions/builder.js";

// Cache clients by base URL
const clientCache: Map<string, AxiosInstance> = new Map();

/**
 * Convert mnemonic to account
 */
export async function mnemonicToAccount(
  mnemonic: string,
  network: Network
): Promise<Account> {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: "",
  });

  const account = wallet.accounts[0];
  const address = getStxAddress(account, network);

  return {
    address,
    privateKey: account.stxPrivateKey,
    network,
  };
}

/**
 * Create an API client with x402 payment interceptor
 */
export async function createApiClient(baseUrl?: string): Promise<AxiosInstance> {
  const url = baseUrl || API_URL;

  // Check cache
  const cached = clientCache.get(url);
  if (cached) {
    return cached;
  }

  const mnemonic = process.env.CLIENT_MNEMONIC || "";
  if (!mnemonic) {
    throw new Error("CLIENT_MNEMONIC is required in environment variables");
  }

  const account = await mnemonicToAccount(mnemonic, NETWORK);
  const axiosInstance = axios.create({
    baseURL: url,
    timeout: 60000,
    transformResponse: [
      (data) => {
        if (typeof data !== "string") {
          return data;
        }
        const trimmed = data.trim();
        if (!trimmed) {
          return data;
        }
        try {
          return JSON.parse(trimmed);
        } catch {
          return data;
        }
      },
    ],
  });

  // Ensure 402 payloads are parsed before x402-stacks validates them
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      const data = error?.response?.data;
      if (error?.response?.status === 402) {
        console.error(
          "x402 debug 402 payload",
          typeof data === "string" ? data : JSON.stringify(data)
        );
      }
      if (typeof data === "string") {
        const trimmed = data.trim();
        if (trimmed) {
          try {
            error.response.data = JSON.parse(trimmed);
          } catch {
            // Leave as-is if it's not JSON
          }
        }
      }
      return Promise.reject(error);
    }
  );

  const client = withPaymentInterceptor(axiosInstance, account);
  clientCache.set(url, client);
  return client;
}

/**
 * Get wallet address from mnemonic
 */
export async function getWalletAddress(): Promise<string> {
  const mnemonic = process.env.CLIENT_MNEMONIC || "";
  if (!mnemonic) {
    throw new Error("CLIENT_MNEMONIC is required in environment variables");
  }
  const account = await mnemonicToAccount(mnemonic, NETWORK);
  return account.address;
}

/**
 * Get account from mnemonic
 */
export async function getAccount(): Promise<Account> {
  const mnemonic = process.env.CLIENT_MNEMONIC || "";
  if (!mnemonic) {
    throw new Error("CLIENT_MNEMONIC is required in environment variables");
  }
  return mnemonicToAccount(mnemonic, NETWORK);
}

/**
 * Clear the client cache (useful for testing)
 */
export function clearClientCache(): void {
  clientCache.clear();
}

export { NETWORK, API_URL };
