/**
 * User Context Management
 *
 * Uses AsyncLocalStorage to track which user (API key) is making the current request.
 * This allows the wallet storage to be isolated per-user without passing the API key
 * through every function call.
 */
import { AsyncLocalStorage } from "async_hooks";

interface UserContext {
  apiKey: string;
}

// Global async local storage for user context
const userContextStorage = new AsyncLocalStorage<UserContext>();

/**
 * Set the user context for the current async execution
 */
export function setUserContext(apiKey: string): void {
  const store = userContextStorage.getStore();
  if (store) {
    // If we're already in a context, update it
    store.apiKey = apiKey;
  } else {
    // Enter a new context
    userContextStorage.enterWith({ apiKey });
  }
}

/**
 * Clear the user context
 */
export function clearUserContext(): void {
  // AsyncLocalStorage automatically clears when the async context exits
  // This is mainly for explicit cleanup if needed
}

/**
 * Get the current user's API key
 * @throws Error if called outside of a user context
 */
export function getUserApiKey(): string {
  const store = userContextStorage.getStore();
  if (!store?.apiKey) {
    // Check for environment fallback (for local/stdio mode)
    const envKey = process.env.USER_API_KEY;
    if (envKey) {
      return envKey;
    }
    throw new Error(
      "No user context available. This should only be called within an HTTP request context."
    );
  }
  return store.apiKey;
}

/**
 * Check if we're running in a user context
 */
export function hasUserContext(): boolean {
  const store = userContextStorage.getStore();
  return !!store?.apiKey || !!process.env.USER_API_KEY;
}

/**
 * Run a function within a user context
 */
export function runWithUserContext<T>(apiKey: string, fn: () => T): T {
  return userContextStorage.run({ apiKey }, fn);
}

/**
 * Run an async function within a user context
 */
export async function runWithUserContextAsync<T>(
  apiKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return userContextStorage.run({ apiKey }, fn);
}
