// Headroom pi extension — compresses bash/read/grep/find tool outputs before
// they reach the LLM context. Requires headroom-ai installed via pipx.
//
// Works with any model provider (including github-copilot) because it operates
// on tool RESULTS, not the provider transport layer.
//
// Env vars:
//   HEADROOM_DISABLED=1          Skip compression entirely
//   HEADROOM_PORT=<n>            (reserved for future proxy mode)
//
// Exit code contract for headroom-compress.py:
//   0  Compressed text on stdout — replace content
//   1  Error — pass through unchanged
//   2  Input too short / no improvement — pass through unchanged

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import {
  isBashToolResult,
  isReadToolResult,
  isGrepToolResult,
  isFindToolResult,
} from "@earendil-works/pi-coding-agent"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const COMPRESS_TIMEOUT_MS = 8_000

// Resolve the Python helper sitting alongside this extension file.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPRESS_SCRIPT = resolve(__dirname, "compress.py")

// headroom-ai is installed in its own pipx venv — use that interpreter directly
// so the extension works regardless of which python3 is on PATH.
const HEADROOM_PYTHON = `${process.env.HOME}/.local/pipx/venvs/headroom-ai/bin/python`

async function compressText(
  pi: ExtensionAPI,
  text: string,
  signal?: AbortSignal
): Promise<string | null> {
  const result = await pi.exec(HEADROOM_PYTHON, [COMPRESS_SCRIPT], {
    timeout: COMPRESS_TIMEOUT_MS,
    signal,
    stdin: text,
  })

  if (result.killed) return null
  // exit 0 = compressed output ready; exit 1/2 = pass through
  if (result.code !== 0) return null

  const out = result.stdout.trim()
  return out || null
}

// Session-scoped compression totals (reset on session_start)
let sessionCharsBefore = 0
let sessionCharsAfter = 0
let sessionCompressions = 0

function formatStatus(): string {
  if (sessionCompressions === 0) return "0%"
  const saved = sessionCharsBefore - sessionCharsAfter
  const pct = Math.round((saved / sessionCharsBefore) * 100)
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
  return `${pct}% ↓${fmtK(saved)}`
}

export default async function (pi: ExtensionAPI) {
  if (process.env.HEADROOM_DISABLED === "1") {
    console.warn("[headroom] HEADROOM_DISABLED=1 — extension inactive")
    return
  }

  // Verify the headroom venv Python exists.
  const probe = await pi.exec(HEADROOM_PYTHON, ["--version"], { timeout: 3_000 })
  if (probe.code !== 0) {
    console.warn(
      "[headroom] headroom-ai venv not found at",
      HEADROOM_PYTHON,
      "— run: pipx install --python python3.13 headroom-ai[all]"
    )
    return
  }

  console.log("[headroom] ready — compressing bash/read/grep/find outputs")

  pi.on("session_start", (_event, ctx) => {
    sessionCharsBefore = 0
    sessionCharsAfter = 0
    sessionCompressions = 0
    ctx.ui.setStatus("headroom", formatStatus())
  })

  pi.on("tool_result", async (event, ctx) => {
    try {
      // Only compress text-heavy tool results
      const isTarget =
        isBashToolResult(event) ||
        isReadToolResult(event) ||
        isGrepToolResult(event) ||
        isFindToolResult(event)
      if (!isTarget) return
      if (event.isError) return

      // Extract first text block
      const textBlock = event.content.find((c) => c.type === "text")
      if (!textBlock || textBlock.type !== "text") return

      const original = textBlock.text
      if (!original) return

      const compressed = await compressText(pi, original, ctx.signal)
      if (!compressed) return

      // Track session savings
      const compressedText = compressed.replace(/\n\[headroom:.*\]$/, "")
      sessionCharsBefore += original.length
      sessionCharsAfter += compressedText.length
      sessionCompressions += 1
      ctx.ui.setStatus("headroom", formatStatus())

      // Replace the text content, preserve any image blocks
      return {
        content: event.content.map((c) =>
          c.type === "text" ? { ...c, text: compressed } : c
        ),
      }
    } catch (err) {
      // Fail open — never block tool results
      console.warn("[headroom] unexpected error in tool_result handler; passing through", err)
    }
  })
}
