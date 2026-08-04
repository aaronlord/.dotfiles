/**
 * Preset Extension
 *
 * Hardcoded slash commands to switch model + thinking level.
 * No config files, no selector, no cycling.
 *
 * Commands:
 * - /nerd        -> github-copilot/claude-opus-5, thinking high
 * - /thinker     -> github-copilot/claude-sonnet-5, thinking high
 * - /implementer -> github-copilot/kimi-k2.7-code, thinking low
 * - /dumb        -> github-copilot/gpt-5.6-luna, thinking low
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface Preset {
	provider: string;
	model: string;
	thinkingLevel: ThinkingLevel;
}

const PRESETS: Record<string, Preset> = {
	nerd: {
		provider: "github-copilot",
		model: "claude-opus-5",
		thinkingLevel: "high",
	},
	thinker: {
		provider: "github-copilot",
		model: "claude-sonnet-5",
		thinkingLevel: "high",
	},
	implementer: {
		provider: "github-copilot",
		model: "kimi-k2.7-code",
		thinkingLevel: "low",
	},
	dumb: {
		provider: "github-copilot",
		model: "gpt-5.6-luna",
		thinkingLevel: "low",
	},
};

export default function presetExtension(pi: ExtensionAPI) {
	async function applyPreset(name: string, preset: Preset, ctx: ExtensionContext): Promise<void> {
		const model = ctx.modelRegistry.find(preset.provider, preset.model);
		if (!model) {
			ctx.ui.notify(`Preset "${name}": model ${preset.provider}/${preset.model} not found`, "error");
			return;
		}

		const success = await pi.setModel(model);
		if (!success) {
			ctx.ui.notify(`Preset "${name}": no API key for ${preset.provider}/${preset.model}`, "error");
			return;
		}

		pi.setThinkingLevel(preset.thinkingLevel);
		ctx.ui.notify(`${name}: ${preset.provider}/${preset.model}, thinking ${preset.thinkingLevel}`, "info");
	}

	for (const [name, preset] of Object.entries(PRESETS)) {
		pi.registerCommand(name, {
			description: `Switch to ${preset.provider}/${preset.model} (${preset.thinkingLevel} thinking)`,
			handler: async (_args, ctx) => {
				await applyPreset(name, preset, ctx);
			},
		});
	}
}
