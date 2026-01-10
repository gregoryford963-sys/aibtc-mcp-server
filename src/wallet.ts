import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import {
  makeSTXTokenTransfer,
  makeContractCall,
  makeContractDeploy,
  broadcastTransaction,
  PostConditionMode,
  ClarityValue,
  stringAsciiCV,
  stringUtf8CV,
  intCV,
  uintCV,
  boolCV,
  principalCV,
  bufferCV,
  listCV,
  tupleCV,
  noneCV,
  someCV,
} from "@stacks/transactions";
import { StacksNetworkName } from "@stacks/network";

export type Network = "mainnet" | "testnet";

export interface Account {
  address: string;
  privateKey: string;
  network: Network;
}

export interface TransferResult {
  txid: string;
  rawTx: string;
}

export interface ContractCallOptions {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditionMode?: PostConditionMode;
}

export interface ContractDeployOptions {
  contractName: string;
  codeBody: string;
}

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

export function getStacksNetwork(network: Network): StacksNetworkName {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export function getApiBaseUrl(network: Network): string {
  return network === "mainnet"
    ? "https://api.mainnet.hiro.so"
    : "https://api.testnet.hiro.so";
}

/**
 * Get account info including nonce and balance from the Stacks API
 */
export async function getAccountInfo(
  address: string,
  network: Network
): Promise<{ nonce: number; balance: string }> {
  const baseUrl = getApiBaseUrl(network);

  const response = await fetch(`${baseUrl}/v2/accounts/${address}`);
  if (!response.ok) {
    throw new Error(`Failed to get account info: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    nonce: data.nonce,
    balance: data.balance,
  };
}

/**
 * Get STX balance for an address
 */
export async function getStxBalance(
  address: string,
  network: Network
): Promise<{ stx: string; stxLocked: string }> {
  const baseUrl = getApiBaseUrl(network);

  const response = await fetch(`${baseUrl}/extended/v1/address/${address}/stx`);
  if (!response.ok) {
    throw new Error(`Failed to get STX balance: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    stx: data.balance,
    stxLocked: data.locked,
  };
}

/**
 * Transfer STX tokens to a recipient
 */
export async function transferStx(
  account: Account,
  recipient: string,
  amount: bigint,
  memo?: string
): Promise<TransferResult> {
  const networkName = getStacksNetwork(account.network);

  const transaction = await makeSTXTokenTransfer({
    recipient,
    amount,
    senderKey: account.privateKey,
    network: networkName,
    memo: memo || "",
  });

  const broadcastResponse = await broadcastTransaction({
    transaction,
    network: networkName,
  });

  if ("error" in broadcastResponse) {
    throw new Error(
      `Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`
    );
  }

  return {
    txid: broadcastResponse.txid,
    rawTx: Buffer.from(transaction.serialize()).toString("hex"),
  };
}

/**
 * Call a smart contract function
 */
export async function callContract(
  account: Account,
  options: ContractCallOptions
): Promise<TransferResult> {
  const networkName = getStacksNetwork(account.network);

  const transaction = await makeContractCall({
    contractAddress: options.contractAddress,
    contractName: options.contractName,
    functionName: options.functionName,
    functionArgs: options.functionArgs,
    senderKey: account.privateKey,
    network: networkName,
    postConditionMode: options.postConditionMode || PostConditionMode.Deny,
  });

  const broadcastResponse = await broadcastTransaction({
    transaction,
    network: networkName,
  });

  if ("error" in broadcastResponse) {
    throw new Error(
      `Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`
    );
  }

  return {
    txid: broadcastResponse.txid,
    rawTx: Buffer.from(transaction.serialize()).toString("hex"),
  };
}

/**
 * Deploy a smart contract
 */
export async function deployContract(
  account: Account,
  options: ContractDeployOptions
): Promise<TransferResult> {
  const networkName = getStacksNetwork(account.network);

  const transaction = await makeContractDeploy({
    contractName: options.contractName,
    codeBody: options.codeBody,
    senderKey: account.privateKey,
    network: networkName,
  });

  const broadcastResponse = await broadcastTransaction({
    transaction,
    network: networkName,
  });

  if ("error" in broadcastResponse) {
    throw new Error(
      `Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`
    );
  }

  return {
    txid: broadcastResponse.txid,
    rawTx: Buffer.from(transaction.serialize()).toString("hex"),
  };
}

/**
 * Sign a transaction without broadcasting (for offline signing)
 */
export async function signStxTransfer(
  account: Account,
  recipient: string,
  amount: bigint,
  memo?: string
): Promise<{ signedTx: string; txid: string }> {
  const networkName = getStacksNetwork(account.network);

  const transaction = await makeSTXTokenTransfer({
    recipient,
    amount,
    senderKey: account.privateKey,
    network: networkName,
    memo: memo || "",
  });

  return {
    signedTx: Buffer.from(transaction.serialize()).toString("hex"),
    txid: transaction.txid(),
  };
}

/**
 * Sign a contract call without broadcasting
 */
export async function signContractCall(
  account: Account,
  options: ContractCallOptions
): Promise<{ signedTx: string; txid: string }> {
  const networkName = getStacksNetwork(account.network);

  const transaction = await makeContractCall({
    contractAddress: options.contractAddress,
    contractName: options.contractName,
    functionName: options.functionName,
    functionArgs: options.functionArgs,
    senderKey: account.privateKey,
    network: networkName,
    postConditionMode: options.postConditionMode || PostConditionMode.Deny,
  });

  return {
    signedTx: Buffer.from(transaction.serialize()).toString("hex"),
    txid: transaction.txid(),
  };
}

/**
 * Broadcast a pre-signed transaction
 */
export async function broadcastSignedTransaction(
  signedTx: string,
  network: Network
): Promise<{ txid: string }> {
  const baseUrl = getApiBaseUrl(network);
  const txBuffer = Buffer.from(signedTx, "hex");

  const response = await fetch(`${baseUrl}/v2/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: txBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Broadcast failed: ${response.statusText} - ${errorText}`);
  }

  const txid = await response.text();
  return { txid: txid.replace(/"/g, "") };
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  txid: string,
  network: Network
): Promise<{
  status: string;
  block_height?: number;
  tx_result?: unknown;
}> {
  const baseUrl = getApiBaseUrl(network);

  const response = await fetch(`${baseUrl}/extended/v1/tx/${txid}`);
  if (!response.ok) {
    if (response.status === 404) {
      return { status: "pending" };
    }
    throw new Error(`Failed to get transaction status: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    status: data.tx_status,
    block_height: data.block_height,
    tx_result: data.tx_result,
  };
}

/**
 * Parse a JSON argument into a ClarityValue
 * Supports: string, number, boolean, principal, buffer, list, tuple, optional
 */
export function parseArgToClarityValue(arg: unknown): ClarityValue {
  if (arg === null || arg === undefined) {
    return noneCV();
  }

  if (typeof arg === "boolean") {
    return boolCV(arg);
  }

  if (typeof arg === "number") {
    if (Number.isInteger(arg)) {
      return arg >= 0 ? uintCV(arg) : intCV(arg);
    }
    throw new Error("Floating point numbers not supported in Clarity");
  }

  if (typeof arg === "string") {
    // Check if it's a principal (Stacks address pattern)
    if (arg.match(/^S[A-Z0-9]{38,}(\.[a-zA-Z][a-zA-Z0-9-]*)?$/)) {
      return principalCV(arg);
    }
    // Default to string-utf8
    return stringUtf8CV(arg);
  }

  if (Buffer.isBuffer(arg) || arg instanceof Uint8Array) {
    return bufferCV(arg as Uint8Array);
  }

  if (Array.isArray(arg)) {
    return listCV(arg.map(parseArgToClarityValue));
  }

  if (typeof arg === "object") {
    const obj = arg as Record<string, unknown>;

    // Check for typed values with explicit type field
    if ("type" in obj && "value" in obj) {
      const typedArg = obj as { type: string; value: unknown };
      switch (typedArg.type) {
        case "uint":
          return uintCV(BigInt(typedArg.value as string | number));
        case "int":
          return intCV(BigInt(typedArg.value as string | number));
        case "string-ascii":
          return stringAsciiCV(typedArg.value as string);
        case "string-utf8":
          return stringUtf8CV(typedArg.value as string);
        case "bool":
          return boolCV(typedArg.value as boolean);
        case "principal":
          return principalCV(typedArg.value as string);
        case "buffer":
          return bufferCV(Buffer.from(typedArg.value as string, "hex"));
        case "none":
          return noneCV();
        case "some":
          return someCV(parseArgToClarityValue(typedArg.value));
        case "list":
          return listCV(
            (typedArg.value as unknown[]).map(parseArgToClarityValue)
          );
        case "tuple": {
          const tupleData: Record<string, ClarityValue> = {};
          for (const [key, val] of Object.entries(
            typedArg.value as Record<string, unknown>
          )) {
            tupleData[key] = parseArgToClarityValue(val);
          }
          return tupleCV(tupleData);
        }
        default:
          throw new Error(`Unknown type: ${typedArg.type}`);
      }
    }

    // Treat as tuple
    const tupleData: Record<string, ClarityValue> = {};
    for (const [key, val] of Object.entries(obj)) {
      tupleData[key] = parseArgToClarityValue(val);
    }
    return tupleCV(tupleData);
  }

  throw new Error(
    `Cannot convert argument to ClarityValue: ${JSON.stringify(arg)}`
  );
}
