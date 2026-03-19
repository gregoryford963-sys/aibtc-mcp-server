import { z } from "zod";

/**
 * Stacks address validation regex
 */
const STACKS_ADDRESS_REGEX = /^S[PMT][A-Z0-9]{38,}$/;

/**
 * Contract ID validation regex (address.contract-name)
 */
const CONTRACT_ID_REGEX = /^S[PMT][A-Z0-9]{38,}\.[a-zA-Z][a-zA-Z0-9-]*$/;

/**
 * Transaction ID validation regex (64 hex chars)
 */
const TXID_REGEX = /^(0x)?[a-fA-F0-9]{64}$/;

/**
 * Validate a Stacks address
 */
function isValidStacksAddress(address: string): boolean {
  return STACKS_ADDRESS_REGEX.test(address);
}

/**
 * Validate a contract ID
 */
function isValidContractId(contractId: string): boolean {
  return CONTRACT_ID_REGEX.test(contractId);
}

/**
 * Validate a transaction ID
 */
function isValidTxId(txid: string): boolean {
  return TXID_REGEX.test(txid);
}

/**
 * Zod schema for Stacks address
 */
const stacksAddressSchema = z.string().refine(
  (val) => isValidStacksAddress(val),
  { message: "Invalid Stacks address. Must start with SP (mainnet) or ST (testnet)" }
);

/**
 * Zod schema for contract ID
 */
const contractIdSchema = z.string().refine(
  (val) => isValidContractId(val),
  { message: "Invalid contract ID. Must be in format: address.contract-name" }
);

/**
 * Zod schema for transaction ID
 */
const txIdSchema = z.string().refine(
  (val) => isValidTxId(val),
  { message: "Invalid transaction ID. Must be 64 hex characters" }
);

/**
 * Zod schema for STX amount (micro-STX as string)
 */
const stxAmountSchema = z.string().refine(
  (val) => /^\d+$/.test(val),
  { message: "Amount must be a positive integer string (micro-STX)" }
);

/**
 * Zod schema for network
 */
const networkSchema = z.enum(["mainnet", "testnet"]);

/**
 * Zod schema for HTTP method
 */
const httpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE"]);

/**
 * Zod schema for post condition mode
 */
const postConditionModeSchema = z.enum(["allow", "deny"]);

/**
 * Common input schemas for tools
 */
const commonSchemas = {
  address: z.string().describe("Stacks address (starts with SP or ST)"),
  optionalAddress: z.string().optional().describe("Optional Stacks address"),
  contractId: z.string().describe("Contract ID in format: address.contract-name"),
  txid: z.string().describe("Transaction ID (64 character hex string)"),
  amount: z.string().describe("Amount in micro-STX (1 STX = 1,000,000 micro-STX)"),
  tokenAmount: z.string().describe("Token amount in smallest unit"),
  memo: z.string().optional().describe("Optional memo message"),
  limit: z.number().optional().default(20).describe("Maximum number of results"),
  offset: z.number().optional().default(0).describe("Offset for pagination"),
};

// Suppress unused variable warnings for schemas kept for potential future use
void stacksAddressSchema;
void contractIdSchema;
void txIdSchema;
void stxAmountSchema;
void networkSchema;
void httpMethodSchema;
void postConditionModeSchema;
void commonSchemas;
