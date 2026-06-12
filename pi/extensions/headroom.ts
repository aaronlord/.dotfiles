import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Pi extension for Headroom context compression.
 * Provides 3 tools: compress, retrieve, stats
 */

interface CompressionStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  compressionRatio: number;
  itemsCompressed: number;
  totalSaved: number;
}

interface CacheEntry {
  cacheKey: string;
  original: string;
  compressed: string;
  timestamp: number;
  tokensIn: number;
  tokensOut: number;
}

class HeadroomManager {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CompressionStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    compressionRatio: 0,
    itemsCompressed: 0,
    totalSaved: 0,
  };
  private cacheTtl: number = 3600;

  constructor(ttl?: number) {
    if (ttl) this.cacheTtl = ttl;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private generateCacheKey(content: string): string {
    const crypto = require("node:crypto");
    return (
      "cache_" +
      crypto.createHash("sha256").update(content).digest("hex").slice(0, 12)
    );
  }

  async compress(content: string): Promise<{
    compressed: string;
    tokensIn: number;
    tokensOut: number;
    ratio: number;
    cacheKey: string;
  }> {
    const tokensIn = this.estimateTokens(content);

    let compressed = content;
    try {
      const parsed = JSON.parse(content);
      compressed = JSON.stringify(parsed);
    } catch {
      compressed = content
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .join("\n");

      compressed = compressed
        .replace(/^(DEBUG|INFO|WARN|ERROR):\s*/gm, "")
        .replace(/\s{2,}/g, " ")
        .slice(0, 2000);
    }

    const tokensOut = this.estimateTokens(compressed);
    const ratio = tokensOut / tokensIn;
    const cacheKey = this.generateCacheKey(content);

    this.cache.set(cacheKey, {
      cacheKey,
      original: content,
      compressed,
      timestamp: Date.now(),
      tokensIn,
      tokensOut,
    });

    this.stats.totalInputTokens += tokensIn;
    this.stats.totalOutputTokens += tokensOut;
    this.stats.itemsCompressed++;
    this.stats.totalSaved += tokensIn - tokensOut;
    this.stats.compressionRatio =
      this.stats.totalOutputTokens / this.stats.totalInputTokens;

    return {
      compressed,
      tokensIn,
      tokensOut,
      ratio,
      cacheKey,
    };
  }

  retrieve(cacheKey: string): string | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTtl * 1000) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.original;
  }

  getStats(): CompressionStats {
    return { ...this.stats };
  }

  clear(): void {
    this.cache.clear();
    this.stats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      compressionRatio: 0,
      itemsCompressed: 0,
      totalSaved: 0,
    };
  }
}

let manager = new HeadroomManager();

export default function (pi: ExtensionAPI) {
  // Tool 1: Manual compression
  pi.registerTool({
    name: "headroom_compress",
    label: "Compress Messages",
    description:
      "Compress accumulated tool outputs or large text to save tokens. Originals cached for retrieval.",
    parameters: Type.Object({
      text: Type.String({
        description: "Content to compress (tool output, logs, etc.)",
      }),
      cacheTtl: Type.Optional(
        Type.Integer({
          description: "Cache time-to-live in seconds (default: 3600)",
          minimum: 60,
          maximum: 86400,
        })
      ),
    }),
    async execute(toolCallId: any, params: any, signal: any, onUpdate: any, ctx: any) {
      try {
        const result = await manager.compress(params.text);

        return {
          content: [
            {
              type: "text",
              text:
                `✓ Compressed successfully\n\n` +
                `Input tokens: ${result.tokensIn}\n` +
                `Output tokens: ${result.tokensOut}\n` +
                `Savings: ${Math.round((1 - result.ratio) * 100)}%\n` +
                `Cache key: ${result.cacheKey}\n` +
                `TTL: ${params.cacheTtl || 3600}s\n\n` +
                `Compressed content (${result.tokensOut} tokens):\n` +
                `\`\`\`\n${result.compressed.slice(0, 500)}${result.compressed.length > 500 ? "...\n(truncated)" : ""}\n\`\`\``,
            },
          ],
          details: {
            cacheKey: result.cacheKey,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            ratio: result.ratio.toFixed(3),
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `✗ Compression failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { error: String(error) },
        };
      }
    },
  });

  // Tool 2: Retrieve from cache
  pi.registerTool({
    name: "headroom_retrieve",
    label: "Retrieve Original",
    description: "Retrieve original uncompressed content from cache by key",
    parameters: Type.Object({
      cacheKey: Type.String({ description: "Cache key from compress tool" }),
    }),
    async execute(toolCallId: any, params: any) {
      const original = manager.retrieve(params.cacheKey);

      if (original === null) {
        return {
          content: [
            {
              type: "text",
              text: `✗ Cache miss or expired (TTL: 1 hour)\nKey: ${params.cacheKey}`,
            },
          ],
          details: { found: false },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `✓ Retrieved ${original.length} chars\n\n${original}`,
          },
        ],
        details: { found: true, length: original.length },
      };
    },
  });

  // Tool 3: Stats
  pi.registerTool({
    name: "headroom_stats",
    label: "Compression Stats",
    description: "View compression statistics for this session",
    parameters: Type.Object({}),
    async execute(toolCallId: any, params: any) {
      const stats = manager.getStats();

      return {
        content: [
          {
            type: "text",
            text:
              `Compression Session Stats\n` +
              `─────────────────────────\n` +
              `Items compressed: ${stats.itemsCompressed}\n` +
              `Total tokens in: ${stats.totalInputTokens.toLocaleString()}\n` +
              `Total tokens out: ${stats.totalOutputTokens.toLocaleString()}\n` +
              `Total saved: ${stats.totalSaved.toLocaleString()} tokens\n` +
              `Compression ratio: ${(stats.compressionRatio * 100).toFixed(1)}%\n` +
              `Efficiency: ${Math.round((1 - stats.compressionRatio) * 100)}% reduction`,
          },
        ],
        details: stats,
      };
    },
  });

  // Command: /headroom
  pi.registerCommand("headroom", {
    description: "Show headroom compression stats and controls",
    handler: async (args: string, ctx: any) => {
      const stats = manager.getStats();

      if (args === "clear") {
        manager.clear();
        ctx.ui.notify("Compression cache cleared", "info");
        return;
      }

      const msg =
        `Headroom Compression\n` +
        `─────────────────────────\n` +
        `Items: ${stats.itemsCompressed}\n` +
        `Total saved: ${stats.totalSaved.toLocaleString()} tokens\n` +
        `Ratio: ${Math.round((1 - stats.compressionRatio) * 100)}%\n\n` +
        `Commands:\n` +
        `  /headroom stats - view detailed stats\n` +
        `  /headroom clear - clear cache`;

      ctx.ui.notify(msg, "info");
    },
  });

  // Event hook: AUTO-COMPRESS large tool results
  pi.on("tool_result", async (event: any, ctx: any) => {
    try {
      if (
        event?.result?.content?.[0]?.type === "text" &&
        typeof event.result.content[0].text === "string"
      ) {
        const text = event.result.content[0].text;
        const tokens = Math.ceil(text.length / 4);

        // AUTO-COMPRESS large outputs (>2000 tokens)
        if (tokens > 2000 && event.toolName !== "headroom_compress") {
          const result = await manager.compress(text);
          ctx.ui.notify(
            `Auto-compressed ${event.toolName}: ${result.tokensIn} → ${result.tokensOut} tokens (${Math.round((1 - result.ratio) * 100)}% saved) [cache: ${result.cacheKey}]`,
            "info"
          );
        }
      }
    } catch (e) {
      // Silently ignore event hook errors
    }
  });

  // Event hook: Auto-stats on session start
  pi.on("session_start", async (event: any, ctx: any) => {
    ctx.ui.notify("Headroom compression ready", "info");
    manager.clear();
  });
}
