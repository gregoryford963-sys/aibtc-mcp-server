import "dotenv/config";
import axios, { type AxiosInstance } from "axios";
import { mnemonicToAccount, type Network } from "./wallet.js";
import { withSponsoredPaymentInterceptor } from "./services/sponsor-relay.js";

export const NETWORK: Network =
  process.env.NETWORK === "mainnet" ? "mainnet" : "testnet";
export const API_URL = process.env.API_URL || "https://x402.biwas.xyz";

// Cache clients by base URL
const clientCache: Map<string, AxiosInstance> = new Map();

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

  // Use sponsored payment interceptor - fees are covered by the x402 sponsor relay
  const client = withSponsoredPaymentInterceptor(axiosInstance, account);
  clientCache.set(url, client);
  return client;
}

export function getWalletAddress(): Promise<string> {
  const mnemonic = process.env.CLIENT_MNEMONIC || "";
  if (!mnemonic) {
    throw new Error("CLIENT_MNEMONIC is required in environment variables");
  }
  return mnemonicToAccount(mnemonic, NETWORK).then((account) => account.address);
}

export async function getAccount() {
  const mnemonic = process.env.CLIENT_MNEMONIC || "";
  if (!mnemonic) {
    throw new Error("CLIENT_MNEMONIC is required in environment variables");
  }
  return mnemonicToAccount(mnemonic, NETWORK);
}
