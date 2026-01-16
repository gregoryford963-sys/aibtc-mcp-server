#!/usr/bin/env npx tsx
/**
 * Test script for the x402 sponsor relay
 *
 * Usage: npx tsx scripts/test-sponsor-relay.ts <password>
 *
 * Requires: A managed wallet to be set up (use wallet_create or wallet_import first)
 */

/// <reference types="node" />

import { createApiClient, clearClientCache } from "../src/services/x402.service.js";
import { getWalletManager } from "../src/services/wallet-manager.js";
import { makeSTXTokenTransfer } from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";

async function testSponsorRelay() {
  console.log("=== x402 Sponsor Relay Test ===\n");

  // Clear cache to ensure fresh client
  clearClientCache();

  // Get wallet manager and list wallets
  const walletManager = getWalletManager();
  const wallets = await walletManager.listWallets();

  if (wallets.length === 0) {
    console.error("No wallets found. Create one first with wallet_create.");
    process.exit(1);
  }

  console.log("Available wallets:");
  wallets.forEach((w) => console.log(`  - ${w.name} (${w.network}): ${w.address}`));

  // Get password from command line or prompt
  const password = process.argv[2];
  if (!password) {
    console.error("\nUsage: npx tsx scripts/test-sponsor-relay.ts <wallet-password>");
    process.exit(1);
  }

  // Use first wallet (or specify which one)
  const wallet = wallets[0];
  console.log(`\nUnlocking wallet: ${wallet.name}`);

  try {
    const account = await walletManager.unlock(wallet.id, password);
    console.log(`Unlocked: ${account.address} (${account.network})`);

    // Create API client with sponsored interceptor
    console.log("\nCreating API client with sponsored payment interceptor...");
    const api = await createApiClient("https://x402.biwas.xyz");

    // First, test the relay directly to see raw response
    console.log("\n--- Direct Relay Test ---");
    const network = account.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
    const relayUrl = account.network === "mainnet"
      ? "https://x402-relay.aibtc.com"
      : "https://x402-relay.aibtc.dev";

    const testTx = await makeSTXTokenTransfer({
      recipient: "SP3Y6YFCBP48VD8GFJGM6W9V3B108Y54SV1N391J6",
      amount: 1000n,
      senderKey: account.privateKey,
      network,
      memo: "test-relay",
      sponsored: true,
      fee: 0n,
    });

    const txHex = testTx.serialize();
    console.log("Transaction hex (first 60 chars):", txHex.substring(0, 60) + "...");

    const relayRequest = {
      transaction: txHex,
      settle: {
        expectedRecipient: "SP3Y6YFCBP48VD8GFJGM6W9V3B108Y54SV1N391J6",
        minAmount: "1000",
        tokenType: "STX",
        expectedSender: account.address,
        resource: "/test",
        method: "GET",
      },
    };

    console.log(`\nSubmitting to relay: ${relayUrl}/relay`);
    const relayResponse = await fetch(`${relayUrl}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relayRequest),
    });

    console.log("\n📥 Raw Relay Response:");
    console.log("  Status:", relayResponse.status, relayResponse.statusText);
    const relayBody = await relayResponse.text();
    console.log("  Body:", relayBody);

    if (!relayResponse.ok) {
      console.log("\n⚠️  Relay failed - skipping API test");
      return;
    }

    // Make a paid request
    console.log("\n--- API Request Test ---");
    console.log("Making request to /api/news (costs 0.001 STX)...");
    const startTime = Date.now();

    const response = await api.get("/api/news");

    const elapsed = Date.now() - startTime;
    console.log(`\n✅ SUCCESS! (${elapsed}ms)`);

    if (response.data?.settlement) {
      const s = response.data.settlement;
      console.log("\nSettlement details:");
      console.log(`  TX ID: ${s.tx_id}`);
      console.log(`  Amount: ${s.amount} micro-STX`);
      console.log(`  Fee: ${s.fee} micro-STX (sponsored by relay)`);
      console.log(`  Status: ${s.status}`);
      console.log(`  Block: ${s.block_height}`);
      console.log(`\n  Explorer: https://explorer.hiro.so/txid/${s.tx_id}`);
    }
  } catch (error: any) {
    console.error("\n❌ FAILED:", error.message);

    // Show raw response if available
    if (error.response) {
      console.error("\nRaw response:");
      console.error("  Status:", error.response.status);
      console.error("  Data:", JSON.stringify(error.response.data, null, 2));
    }

    if (error.message.includes("Invalid byte sequence")) {
      console.error("\nThis error indicates the relay has the v7.x compatibility bug.");
      console.error("See: https://github.com/aibtcdev/x402-sponsor-relay/issues/XX");
    }
  } finally {
    walletManager.lock();
    console.log("\nWallet locked.");
  }
}

testSponsorRelay();
