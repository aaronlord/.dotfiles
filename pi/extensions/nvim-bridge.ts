/**
 * nvim-bridge
 *
 * Bridges Neovim visual selections to Pi sessions.
 *
 * Neovim writes a task JSON to ~/.pi/nvim-tasks/{id}.json and sends
 * `/nvim-task {id}` to the Pi tmux pane. This extension handles that command,
 * constructs a structured prompt from the task, and signals completion back to
 * Neovim by writing ~/.pi/nvim-done/{id}.json when agent_end fires.
 *
 * Neovim then reads Pi's output from the temp file and replaces the
 * marked range in the buffer.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOME = process.env.HOME!;
const TASKS_DIR = path.join(HOME, ".pi", "nvim-tasks");
const DONE_DIR = path.join(HOME, ".pi", "nvim-done");
const ATTENTION_DIR = path.join(HOME, ".pi", "nvim-attention");

interface NvimTask {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  code: string;
  surroundingCode: string;
  tempFile: string;
  userPrompt: string;
}

function buildPrompt(task: NvimTask): string {
  return `You are a full coding agent embedded in Neovim.

The user has highlighted a range of lines and given you a task. Before doing anything, you must think through the full scope of the change.

<SELECTION_LOCATION>
File: ${task.file}
Lines: ${task.startLine}-${task.endLine}
</SELECTION_LOCATION>

<SELECTION_CONTENT>
${task.code}
</SELECTION_CONTENT>

<SURROUNDING_CONTEXT>
${task.surroundingCode}
</SURROUNDING_CONTEXT>

<TEMP_FILE>${task.tempFile}</TEMP_FILE>

<Rules>
You MUST follow these steps in order:

1. PLAN: Before writing anything, read the file and search the codebase to fully understand the selected code and the implications of the requested change. Identify every place that would need to change. Write out your plan — what needs to change, where, and why.

2. DECIDE: Based on your plan, are all required changes contained within the selected lines (${task.startLine}-${task.endLine})?

   YES — proceed to step 3.
   NO  — call nvim_attention with a brief reason. Then describe the out-of-scope changes and ask the user how to proceed. Wait. Do not edit anything until the user responds.
        If the user says go ahead: make all changes directly using your edit tools, then call nvim_task_complete.
        If the user says stop: stop.

3. Write the replacement for the selected lines to TEMP_FILE. Nothing else. No explanation.

Never output code conversationally. Never edit files other than through the above steps. Do not use /grill-me.
</Rules>

<Prompt>
${task.userPrompt}
</Prompt>`;
}

export default function (pi: ExtensionAPI) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.mkdirSync(DONE_DIR, { recursive: true });
  fs.mkdirSync(ATTENTION_DIR, { recursive: true });

  // Track the current task so agent_end knows which task just finished.
  // A single Pi session handles one nvim task at a time (they're sequential).
  let currentTaskId: string | null = null;
  let currentTask: NvimTask | null = null;
  let taskStartedAt: number = 0;

  pi.registerTool({
    name: "nvim_attention",
    label: "Neovim Attention",
    description:
      "Signal to Neovim that this task needs user attention — e.g. you need clarification before proceeding, or the task requires changes outside the selection. The selection will be highlighted yellow in the editor. State your question after calling this tool and the user will respond here.",
    promptSnippet:
      "Call nvim_attention when you need user input to complete the task",
    parameters: Type.Object({
      message: Type.String({
        description: "Brief reason attention is needed (shown in Neovim)",
      }),
    }),
    async execute(_toolCallId, _params) {
      if (!currentTaskId) {
        return {
          content: [{ type: "text", text: "No active nvim task — nothing to signal." }],
        };
      }
      const attentionFile = path.join(ATTENTION_DIR, `${currentTaskId}.json`);
      fs.writeFileSync(
        attentionFile,
        JSON.stringify({ id: currentTaskId, requestedAt: Date.now() }),
      );
      return {
        content: [
          {
            type: "text",
            text: "The Neovim selection is now highlighted yellow. State your question or situation clearly — the user will respond here in this session.",
          },
        ],
      };
    },
  });

  pi.registerTool({
    name: "nvim_task_complete",
    label: "Neovim Task Complete",
    description:
      "Signal to Neovim that a direct-edit task is complete (Mode B). Call this after you have finished editing files directly, so Neovim can clean up task markers and reload the buffer.",
    promptSnippet:
      "Call nvim_task_complete after finishing all direct file edits in Mode B",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params) {
      if (!currentTask) {
        return {
          content: [{ type: "text", text: "No active nvim task." }],
        };
      }
      // Write sentinel to TEMP_FILE so agent_end knows to fire task completion.
      fs.writeFileSync(currentTask.tempFile, "__DIRECT_EDIT__");
      return {
        content: [{ type: "text", text: "Neovim notified. Task markers will be cleared and the buffer reloaded." }],
      };
    },
  });

  pi.registerCommand("nvim-task", {
    description: "Process a pending Neovim visual task by ID",
    handler: async (args, ctx) => {
      const id = args.trim();
      if (!id) {
        ctx.ui.notify("Usage: /nvim-task <id>", "error");
        return;
      }

      const taskFile = path.join(TASKS_DIR, `${id}.json`);

      let task: NvimTask;
      try {
        task = JSON.parse(fs.readFileSync(taskFile, "utf-8")) as NvimTask;
      } catch {
        ctx.ui.notify(`nvim-task: task file not found or invalid — ${taskFile}`, "error");
        return;
      }

      currentTaskId = id;
      currentTask = task;
      taskStartedAt = Date.now();
      ctx.ui.setStatus("nvim-task", `nvim task ${id} in progress…`);

      const prompt = buildPrompt(task);
      pi.sendUserMessage(prompt);
    },
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!currentTaskId) return;

    // agent_end fires after every agent turn, not just session end.
    // Only treat it as "done" once the agent has actually written to the temp
    // file — otherwise the agent is mid-conversation (e.g. waiting for input
    // after calling nvim_attention) and we must not close the task yet.
    const tf = currentTask?.tempFile;
    if (tf) {
      try {
        const stat = fs.statSync(tf);
        if (stat.mtimeMs <= taskStartedAt) return; // not written yet
      } catch {
        return; // file doesn't exist yet
      }
    }

    const id = currentTaskId;
    currentTaskId = null;
    currentTask = null;
    taskStartedAt = 0;

    ctx.ui.setStatus("nvim-task", "");

    // Remove any lingering attention signal before notifying Neovim
    const attentionFile = path.join(ATTENTION_DIR, `${id}.json`);
    try { fs.unlinkSync(attentionFile); } catch { /* already gone */ }

    const doneFile = path.join(DONE_DIR, `${id}.json`);
    fs.writeFileSync(
      doneFile,
      JSON.stringify({ id, completedAt: Date.now() }),
    );

    if (ctx.hasUI) {
      ctx.ui.notify(`nvim task ${id} complete`, "info");
    }
  });
}
