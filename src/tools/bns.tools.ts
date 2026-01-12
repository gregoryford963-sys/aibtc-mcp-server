import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWalletAddress, NETWORK } from "../services/x402.service.js";
import { getBnsService } from "../services/bns.service.js";
import { createJsonResponse, createErrorResponse } from "../utils/index.js";

export function registerBnsTools(server: McpServer): void {
  // Lookup BNS name
  server.registerTool(
    "lookup_bns_name",
    {
      description: "Resolve a .btc domain name to its Stacks address.",
      inputSchema: {
        name: z.string().describe("BNS name to lookup (e.g., 'alice.btc' or 'alice')"),
      },
    },
    async ({ name }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const result = await bnsService.lookupName(name);

        if (!result) {
          return createJsonResponse({
            name,
            found: false,
            message: "Name not found or not registered",
          });
        }

        return createJsonResponse({
          name: result.name,
          found: true,
          address: result.address,
          namespace: result.namespace,
          expireBlock: result.expireBlock,
          network: NETWORK,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Reverse BNS lookup
  server.registerTool(
    "reverse_bns_lookup",
    {
      description: "Get the BNS domain names owned by an address.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Stacks address to lookup. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const walletAddress = address || (await getWalletAddress());
        const names = await bnsService.reverseLookup(walletAddress);

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          namesCount: names.length,
          names,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get BNS name info
  server.registerTool(
    "get_bns_info",
    {
      description: "Get detailed information about a BNS domain name.",
      inputSchema: {
        name: z.string().describe("BNS name to lookup (e.g., 'alice.btc')"),
      },
    },
    async ({ name }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const info = await bnsService.getNameInfo(name);

        if (!info) {
          return createJsonResponse({
            name,
            found: false,
            message: "Name not found",
          });
        }

        return createJsonResponse({
          network: NETWORK,
          found: true,
          ...info,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Check BNS availability
  server.registerTool(
    "check_bns_availability",
    {
      description: "Check if a BNS domain name is available for registration.",
      inputSchema: {
        name: z.string().describe("BNS name to check (e.g., 'alice')"),
      },
    },
    async ({ name }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const available = await bnsService.checkAvailability(name);

        return createJsonResponse({
          name: name.endsWith(".btc") ? name : `${name}.btc`,
          available,
          network: NETWORK,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Get BNS price
  server.registerTool(
    "get_bns_price",
    {
      description: "Get the registration price for a BNS domain name.",
      inputSchema: {
        name: z.string().describe("BNS name to check (e.g., 'alice')"),
      },
    },
    async ({ name }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const price = await bnsService.getPrice(name);

        if (!price) {
          return createJsonResponse({
            name,
            error: "Could not determine price",
          });
        }

        return createJsonResponse({
          name: name.endsWith(".btc") ? name : `${name}.btc`,
          network: NETWORK,
          price: {
            units: price.units,
            microStx: price.amount,
            stx: price.amountStx + " STX",
          },
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // List user domains
  server.registerTool(
    "list_user_domains",
    {
      description: "List all BNS domains owned by an address.",
      inputSchema: {
        address: z
          .string()
          .optional()
          .describe("Stacks address to check. Uses configured wallet if not provided."),
      },
    },
    async ({ address }) => {
      try {
        const bnsService = getBnsService(NETWORK);
        const walletAddress = address || (await getWalletAddress());
        const domains = await bnsService.getUserDomains(walletAddress);

        return createJsonResponse({
          address: walletAddress,
          network: NETWORK,
          domainsCount: domains.length,
          domains,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
