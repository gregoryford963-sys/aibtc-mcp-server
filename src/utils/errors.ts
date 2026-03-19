import { redactSensitive } from "./redact.js";

/**
 * Base error class for aibtc-mcp-server
 */
export class AibtcError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AibtcError";
  }
}

/**
 * Base error for wallet operations
 */
export class WalletError extends AibtcError {
  constructor(message: string, details?: unknown) {
    super(message, "WALLET_ERROR", details);
    this.name = "WalletError";
  }
}

/**
 * Error when wallet is locked and operation requires unlocked wallet
 */
export class WalletLockedError extends WalletError {
  constructor() {
    super("Wallet is locked. Use wallet_unlock to unlock it.");
    this.name = "WalletLockedError";
  }
}

/**
 * Error when wallet is not found
 */
export class WalletNotFoundError extends WalletError {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
    this.name = "WalletNotFoundError";
  }
}

/**
 * Error for invalid password
 */
export class InvalidPasswordError extends WalletError {
  constructor() {
    super("Invalid password");
    this.name = "InvalidPasswordError";
  }
}

/**
 * Error for invalid mnemonic
 */
export class InvalidMnemonicError extends WalletError {
  constructor() {
    super("Invalid mnemonic phrase");
    this.name = "InvalidMnemonicError";
  }
}

/**
 * Error when account has insufficient balance for an operation
 */
export class InsufficientBalanceError extends AibtcError {
  constructor(
    message: string,
    public readonly tokenType: 'STX' | 'sBTC',
    public readonly balance: string,
    public readonly required: string,
    public readonly shortfall: string
  ) {
    super(message, "INSUFFICIENT_BALANCE", { tokenType, balance, required, shortfall });
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Format error for tool response
 */
function formatError(error: unknown): { message: string; code?: string; details?: unknown } {
  if (error instanceof AibtcError) {
    return {
      message: redactSensitive(error.message),
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return { message: redactSensitive(error.message) };
  }

  return { message: "Unknown error occurred" };
}

/**
 * Create error response for MCP tools
 */
export function createErrorResponse(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const formatted = formatError(error);
  return {
    content: [
      {
        type: "text",
        text: `Error: ${formatted.message}${formatted.code ? ` (${formatted.code})` : ""}`,
      },
    ],
    isError: true,
  };
}
