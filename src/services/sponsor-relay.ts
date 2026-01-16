/**
 * Sponsored Payment Interceptor
 *
 * Uses the x402 sponsor relay to enable gasless transactions for AI agents.
 * The relay sponsors transaction fees and handles settlement verification.
 *
 * Flow:
 * 1. Agent receives 402 Payment Required response
 * 2. Agent builds a sponsored transaction (fee: 0, sponsored: true)
 * 3. Agent submits to sponsor relay with settlement details
 * 4. Relay sponsors the tx, broadcasts, and verifies settlement
 * 5. Agent retries original request with payment proof
 *
 * @see https://github.com/aibtcdev/x402-sponsor-relay
 */

import { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  makeSTXTokenTransfer,
  makeContractCall,
  PostConditionMode,
  uintCV,
  principalCV,
  someCV,
  noneCV,
  bufferCVFromString,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import type { Account } from "../wallet.js";
import { getSponsorRelayUrl, type Network } from "../config/networks.js";

/**
 * x402 payment request structure returned by 402 responses
 */
interface X402PaymentRequest {
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  network: "mainnet" | "testnet";
  nonce: string;
  expiresAt: string;
  tokenType?: "STX" | "sBTC" | "USDCx";
  tokenContract?: {
    address: string;
    name: string;
  };
}

/**
 * Relay request structure
 */
interface RelayRequest {
  transaction: string; // hex-encoded sponsored transaction
  settle: {
    expectedRecipient: string;
    minAmount: string;
    tokenType: "STX" | "sBTC" | "USDCx";
    expectedSender: string;
    resource: string;
    method: string;
  };
}

/**
 * Relay response structure
 */
interface RelayResponse {
  success: boolean;
  txid?: string;
  settlement?: {
    sender: string;
    recipient: string;
    amount: string;
    blockHeight: number;
  };
  error?: string;
}

/**
 * Validate that a response body is a valid x402 payment request
 */
function isValidPaymentRequest(data: unknown): data is X402PaymentRequest {
  if (!data || typeof data !== "object") return false;
  const request = data as Partial<X402PaymentRequest>;
  return (
    typeof request.maxAmountRequired === "string" &&
    typeof request.resource === "string" &&
    typeof request.payTo === "string" &&
    typeof request.network === "string" &&
    typeof request.nonce === "string" &&
    typeof request.expiresAt === "string" &&
    (request.network === "mainnet" || request.network === "testnet")
  );
}

/**
 * Build a sponsored transaction for the payment
 * Creates a transaction with sponsored: true and fee: 0
 */
async function buildSponsoredTransaction(
  paymentRequest: X402PaymentRequest,
  account: Account
): Promise<string> {
  const amount = BigInt(paymentRequest.maxAmountRequired);
  const tokenType = paymentRequest.tokenType || "STX";
  const network =
    paymentRequest.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  const memo = paymentRequest.nonce.substring(0, 34); // Max 34 bytes for Stacks memo

  if (tokenType === "sBTC" || tokenType === "USDCx") {
    // SIP-010 token transfer
    if (!paymentRequest.tokenContract) {
      throw new Error(`Token contract required for ${tokenType} payments`);
    }

    const { address: contractAddress, name: contractName } =
      paymentRequest.tokenContract;

    const functionArgs = [
      uintCV(amount.toString()),
      principalCV(account.address),
      principalCV(paymentRequest.payTo),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
    ];

    const transaction = await makeContractCall({
      contractAddress,
      contractName,
      functionName: "transfer",
      functionArgs,
      senderKey: account.privateKey,
      network,
      postConditionMode: PostConditionMode.Allow,
      // SPONSORED TRANSACTION - relay covers fees
      sponsored: true,
      fee: 0n,
    });

    const serialized = transaction.serialize();
    // serialize() returns a hex string in @stacks/transactions v7.x
    if (typeof serialized === "string") {
      return serialized;
    }
    // Fallback for older versions that return Uint8Array
    return Buffer.from(serialized).toString("hex");
  } else {
    // STX transfer
    const transaction = await makeSTXTokenTransfer({
      recipient: paymentRequest.payTo,
      amount,
      senderKey: account.privateKey,
      network,
      memo,
      // SPONSORED TRANSACTION - relay covers fees
      sponsored: true,
      fee: 0n,
    });

    const serialized = transaction.serialize();
    // serialize() returns a hex string in @stacks/transactions v7.x
    if (typeof serialized === "string") {
      return serialized;
    }
    // Fallback for older versions that return Uint8Array
    return Buffer.from(serialized).toString("hex");
  }
}

/**
 * Submit a sponsored transaction to the relay for broadcasting and settlement
 */
async function submitToRelay(
  relayUrl: string,
  transaction: string,
  paymentRequest: X402PaymentRequest,
  senderAddress: string,
  method: string
): Promise<RelayResponse> {
  const relayRequest: RelayRequest = {
    transaction,
    settle: {
      expectedRecipient: paymentRequest.payTo,
      minAmount: paymentRequest.maxAmountRequired,
      tokenType: paymentRequest.tokenType || "STX",
      expectedSender: senderAddress,
      resource: paymentRequest.resource,
      method: method.toUpperCase(),
    },
  };

  const response = await fetch(`${relayUrl}/relay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(relayRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Relay error (${response.status}): ${errorMessage}`);
  }

  return response.json();
}

// Track which requests have already had payment attempted
const paymentAttempted = new WeakSet<InternalAxiosRequestConfig>();

/**
 * Wrap an axios instance with sponsored x402 payment handling
 *
 * This interceptor:
 * 1. Intercepts 402 Payment Required responses
 * 2. Builds a sponsored transaction (fee covered by relay)
 * 3. Submits to the sponsor relay for broadcasting and settlement
 * 4. Retries the original request with the payment txid
 *
 * @param axiosInstance - The axios instance to wrap
 * @param account - The Stacks account to use for signing payments
 * @returns The wrapped axios instance
 *
 * @example
 * ```typescript
 * const account = await mnemonicToAccount(mnemonic, 'testnet');
 * const api = withSponsoredPaymentInterceptor(axios.create(), account);
 *
 * // 402 payments are now automatically handled with sponsored fees
 * const response = await api.get('https://x402.example.com/premium-data');
 * ```
 */
export function withSponsoredPaymentInterceptor(
  axiosInstance: AxiosInstance,
  account: Account
): AxiosInstance {
  const relayUrl = getSponsorRelayUrl(account.network);

  axiosInstance.interceptors.response.use(
    // Pass through successful responses
    (response) => response,

    // Handle errors (including 402)
    async (error: AxiosError) => {
      const originalRequest = error.config;

      // Need config to retry
      if (!originalRequest) {
        return Promise.reject(error);
      }

      // Check if this is a 402 response
      if (error.response?.status !== 402) {
        return Promise.reject(error);
      }

      // Prevent infinite retry loops
      if (paymentAttempted.has(originalRequest)) {
        return Promise.reject(
          new Error("Payment already attempted for this request")
        );
      }
      paymentAttempted.add(originalRequest);

      const paymentRequest = error.response.data as unknown;

      // Validate payment request structure
      if (!isValidPaymentRequest(paymentRequest)) {
        console.error(
          "Invalid x402 payment request:",
          JSON.stringify(paymentRequest)
        );
        return Promise.reject(
          new Error("Invalid x402 payment request from server")
        );
      }

      // Check expiration
      const expiresAt = new Date(paymentRequest.expiresAt);
      if (expiresAt < new Date()) {
        return Promise.reject(new Error("Payment request has expired"));
      }

      try {
        console.log(
          `[x402-sponsor] Building sponsored payment: ${paymentRequest.maxAmountRequired} ${paymentRequest.tokenType || "STX"} to ${paymentRequest.payTo}`
        );

        // Build sponsored transaction (fee: 0, sponsored: true)
        const sponsoredTx = await buildSponsoredTransaction(
          paymentRequest,
          account
        );

        console.log(
          `[x402-sponsor] Submitting to relay: ${relayUrl}/relay`
        );

        // Submit to sponsor relay
        const relayResponse = await submitToRelay(
          relayUrl,
          sponsoredTx,
          paymentRequest,
          account.address,
          originalRequest.method || "GET"
        );

        if (!relayResponse.success || !relayResponse.txid) {
          throw new Error(
            relayResponse.error || "Relay did not return a successful settlement"
          );
        }

        console.log(
          `[x402-sponsor] Payment settled! txid: ${relayResponse.txid}`
        );

        // Retry the request with the payment txid
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers["X-PAYMENT"] = relayResponse.txid;
        originalRequest.headers["X-PAYMENT-TOKEN-TYPE"] =
          paymentRequest.tokenType || "STX";

        return axiosInstance.request(originalRequest);
      } catch (paymentError) {
        const errorMessage =
          paymentError instanceof Error
            ? paymentError.message
            : "Unknown error";
        console.error(`[x402-sponsor] Payment failed: ${errorMessage}`);
        return Promise.reject(
          new Error(`Sponsored payment failed: ${errorMessage}`)
        );
      }
    }
  );

  return axiosInstance;
}
