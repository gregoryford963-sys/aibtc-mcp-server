# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

stx402-agent is an MCP (Model Context Protocol) server that enables Claude to discover, pay for, and execute x402 endpoints using a user-provided Stacks wallet. The plugin automatically handles x402 payment challenges when accessing paid endpoints.

Key scope: This project focuses on **consumer-side tooling only**. x402 endpoints are created and maintained in separate repositories.

## Build Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript to dist/
npm run dev       # Run in development mode with tsx
npm start         # Run compiled server
```

## Architecture

```
Claude Code
    ↓ (MCP stdio transport)
stx402-agent MCP Server (src/index.ts)
    ↓
API Client with x402 interceptor (src/api.ts)
    ↓
Wallet Helper (src/wallet.ts)
    ↓
x402 Endpoints (external)
```

### Key Files

- `src/index.ts` - MCP server with tool definitions (get_wallet_info, check_position_health, execute_x402_endpoint)
- `src/api.ts` - Axios client with x402-stacks payment interceptor that auto-pays 402 responses
- `src/wallet.ts` - Converts mnemonic to Stacks account using @stacks/wallet-sdk

### x402 Payment Flow

1. Client makes request to x402 endpoint
2. Endpoint returns HTTP 402 with payment requirements
3. `withPaymentInterceptor` from x402-stacks intercepts the 402
4. Interceptor signs and broadcasts payment transaction
5. Request is retried with payment proof
6. Endpoint returns actual response

## Configuration

Set environment variables in `.env`:
- `CLIENT_MNEMONIC` - 24-word Stacks wallet mnemonic (required)
- `NETWORK` - "mainnet" or "testnet" (default: testnet)
- `API_URL` - x402 API base URL (default: https://x402.biwas.xyz)

## Adding to Claude Code

Add to your Claude Code MCP settings:
```json
{
  "mcpServers": {
    "stx402": {
      "command": "node",
      "args": ["/path/to/stx402-agent/dist/index.js"],
      "env": {
        "CLIENT_MNEMONIC": "your mnemonic here",
        "NETWORK": "testnet"
      }
    }
  }
}
```

## Available Tools

- `get_wallet_info` - Returns configured wallet address and network
- `check_position_health` - Checks Zest protocol position health (x402 endpoint)
- `execute_x402_endpoint` - Generic tool to call any x402 endpoint with auto-payment
