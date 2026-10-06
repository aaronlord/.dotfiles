import type { ExtensionAPI, UserBashEventResult } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const pane = process.env.TMUX_PANE;
  if (!pane) return;

  const defaultBashOps = createLocalBashOperations();

  const runTmux = async (args: string[]) => {
    try {
      await pi.exec("tmux", args);
    } catch {}
  };

  const setStatus = async (status: "working" | "prompt" | "idle") => {
    await runTmux(["set-option", "-p", "-t", pane, "@pi_pane_status", status]);
    await runTmux(["refresh-client", "-S"]);
  };

  const clearStatus = async () => {
    await runTmux(["set-option", "-u", "-p", "-t", pane, "@pi_pane_status"]);
    await runTmux(["refresh-client", "-S"]);
  };

  // Pi lifecycle event hooks
  pi.on("agent_start", () => setStatus("working"));
  pi.on("agent_end", () => setStatus("idle"));
  pi.on("agent_settled", () => setStatus("idle"));
  pi.on("ui_prompt_start", () => setStatus("prompt"));
  pi.on("ui_prompt_end", () => setStatus("working"));
  pi.on("session_shutdown", () => clearStatus());

  // Hook into CLI commands run by user via ! or !! prefix
  pi.on("user_bash", async (): Promise<UserBashEventResult> => {
    return {
      operations: {
        exec: async (command, cwd, options) => {
          await setStatus("working");
          try {
            return await defaultBashOps.exec(command, cwd, options);
          } finally {
            await setStatus("idle");
          }
        },
      },
    };
  });

  // Initial state on extension load
  setStatus("idle");
}
