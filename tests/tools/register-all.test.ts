/**
 * Smoke test: verify all MCP tools register without errors.
 *
 * Catches duplicate tool names, missing imports, and registration-time
 * exceptions before they reach production.
 */

import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../src/tools/index.js";

describe("registerAllTools", () => {
  it("registers all tools without throwing", () => {
    const server = new McpServer({
      name: "test-server",
      version: "0.0.0",
    });

    expect(() => registerAllTools(server)).not.toThrow();
  });

  it("registers no duplicate tool names", () => {
    const registered: string[] = [];
    const server = new McpServer({
      name: "test-server",
      version: "0.0.0",
    });

    // Intercept registerTool to collect names before the SDK checks
    const original = server.registerTool.bind(server);
    server.registerTool = ((name: string, ...args: unknown[]) => {
      registered.push(name);
      return (original as Function)(name, ...args);
    }) as typeof server.registerTool;

    registerAllTools(server);

    const duplicates = registered.filter(
      (name, i) => registered.indexOf(name) !== i
    );
    expect(duplicates).toEqual([]);
  });

  it("registers at least 50 tools", () => {
    let count = 0;
    const server = new McpServer({
      name: "test-server",
      version: "0.0.0",
    });

    const original = server.registerTool.bind(server);
    server.registerTool = ((name: string, ...args: unknown[]) => {
      count++;
      return (original as Function)(name, ...args);
    }) as typeof server.registerTool;

    registerAllTools(server);

    // Sanity check: if this drops significantly, a register function is broken
    expect(count).toBeGreaterThanOrEqual(50);
  });
});
