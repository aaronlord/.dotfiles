/**
 * clarify — lets pi ask you clarifying questions inline.
 *
 * Registers an `ask_user` tool the LLM can call to pause and ask a free-text
 * question. Works especially well with skills like grill-me where questions
 * come one at a time.
 *
 * Features:
 *   - Free-text answer via inline editor (always available)
 *   - Optional numbered suggestions the user can pick or ignore
 *   - System-prompt injection: tells the LLM to use `ask_user` instead of
 *     embedding questions in prose
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AskResult {
  answer: string | null;
  pickedSuggestion?: number; // 1-based index if user picked a suggestion
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function clarify(pi: ExtensionAPI) {
  // Tell the LLM about the tool so it actually uses it.
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n## Asking clarifying questions\n" +
        "When you need information or clarification from the user — including when using the grill-me skill — " +
        "call the `ask_user` tool instead of embedding questions in your prose. " +
        "Ask exactly one question per `ask_user` call. " +
        "Wait for the user's answer before asking the next question.",
    };
  });

  // ── Tool ──────────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a clarifying question and wait for their free-text answer. " +
      "Use this whenever you need input to proceed. Ask one question at a time. " +
      "Optionally provide suggestions the user can pick or use as inspiration.",
    promptSnippet: "Ask the user a clarifying question and wait for their answer",
    promptGuidelines: [
      "Use ask_user when you need clarification or additional information from the user.",
      "Call ask_user once per question — never bundle multiple questions in one call.",
    ],

    parameters: Type.Object({
      question: Type.String({ description: "The question to ask" }),
      context: Type.Optional(
        Type.String({
          description: "One-line explanation of why you need this (shown dimmed below the question)",
        })
      ),
      suggestions: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional suggested answers. User can pick one with number keys or type their own.",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Non-TUI fallback
      if (ctx.mode !== "tui") {
        return {
          content: [
            {
              type: "text",
              text: "UI not available — please answer in your next message.",
            },
          ],
          details: { answer: null } as AskResult,
        };
      }

      const suggestions: string[] = params.suggestions ?? [];

      const result = await ctx.ui.custom<AskResult | null>(
        (tui, theme, _kb, done) => {
          let cachedLines: string[] | undefined;
          let selectedSuggestion: number | null = null; // 1-based, null = free text

          // ── Editor setup ──────────────────────────────────────────────────

          const editorTheme: EditorTheme = {
            borderColor: (s) => theme.fg("accent", s),
            selectList: {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          };
          const editor = new Editor(tui, editorTheme);

          editor.onSubmit = (value) => {
            const trimmed = value.trim();
            if (!trimmed) return; // don't submit empty
            done({ answer: trimmed });
          };

          // ── Helpers ───────────────────────────────────────────────────────

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          // ── Input handler ─────────────────────────────────────────────────

          function handleInput(data: string) {
            // Escape = cancel
            if (matchesKey(data, Key.escape)) {
              done(null);
              return;
            }

            // Number keys = pick suggestion
            if (suggestions.length > 0) {
              const num = Number(data);
              if (!isNaN(num) && num >= 1 && num <= suggestions.length) {
                selectedSuggestion = num;
                editor.setText(suggestions[num - 1]);
                refresh();
                return;
              }
            }

            // Everything else goes to the editor
            editor.handleInput(data);
            refresh();
          }

          // ── Render ────────────────────────────────────────────────────────

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const add = (s: string) => lines.push(truncateToWidth(s, width));

            // Header rule
            add(theme.fg("accent", "─".repeat(width)));

            // Question
            add(theme.fg("text", theme.bold(` ${params.question}`)));

            // Context (optional)
            if (params.context) {
              add(theme.fg("muted", ` ${params.context}`));
            }

            // Suggestions
            if (suggestions.length > 0) {
              lines.push("");
              add(theme.fg("dim", " Suggestions (press number to fill, then edit or Enter to send):"));
              for (let i = 0; i < suggestions.length; i++) {
                const num = i + 1;
                const isSelected = selectedSuggestion === num;
                const prefix = isSelected
                  ? theme.fg("accent", `  ${num}. `)
                  : theme.fg("dim", `  ${num}. `);
                const text = isSelected
                  ? theme.fg("accent", suggestions[i])
                  : theme.fg("muted", suggestions[i]);
                add(prefix + text);
              }
            }

            // Editor
            lines.push("");
            add(theme.fg("muted", " Your answer:"));
            for (const line of editor.render(width - 2)) {
              add(` ${line}`);
            }

            // Footer hints
            lines.push("");
            const hints: string[] = ["Enter to send", "Esc to cancel"];
            if (suggestions.length > 0) {
              hints.unshift("1–" + suggestions.length + " to fill suggestion");
            }
            add(theme.fg("dim", ` ${hints.join(" • ")}`));
            add(theme.fg("accent", "─".repeat(width)));

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        }
      );

      if (result === null) {
        return {
          content: [{ type: "text", text: "User cancelled — no answer provided." }],
          details: { answer: null } as AskResult,
        };
      }

      const pickedLine =
        result.pickedSuggestion != null
          ? ` (picked suggestion ${result.pickedSuggestion})`
          : "";

      return {
        content: [{ type: "text", text: `User answered: ${result.answer}${pickedLine}` }],
        details: result,
      };
    },

    // ── Custom renderers ────────────────────────────────────────────────────

    renderCall(args, theme, _ctx) {
      const q = typeof args.question === "string" ? args.question : "";
      const sugs = Array.isArray(args.suggestions) ? (args.suggestions as string[]) : [];
      let text =
        theme.fg("toolTitle", theme.bold("ask_user ")) +
        theme.fg("text", q);
      if (sugs.length > 0) {
        text +=
          "\n" +
          theme.fg(
            "dim",
            `  suggestions: ${sugs.map((s, i) => `${i + 1}. ${s}`).join(" | ")}`
          );
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _opts, theme, _ctx) {
      const details = result.details as AskResult | undefined;
      if (!details || details.answer === null) {
        return new Text(theme.fg("warning", "No answer"), 0, 0);
      }
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("accent", details.answer),
        0,
        0
      );
    },
  });
}
