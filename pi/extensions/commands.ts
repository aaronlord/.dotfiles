import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

interface CommandConfig {
	provider: string;
	model: string;
	thinkingLevel: ThinkingLevel;
	skill: string;
}

type CommandsConfig = Record<string, CommandConfig>;

const COMMANDS_PATH = join(getAgentDir(), "commands.json");
const THINKING_LEVELS = new Set<ThinkingLevel>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

function loadCommands(): CommandsConfig {
	if (!existsSync(COMMANDS_PATH)) {
		console.error(`Commands config not found: ${COMMANDS_PATH}`);
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(COMMANDS_PATH, "utf-8"));
	} catch (error) {
		console.error(`Failed to parse commands config ${COMMANDS_PATH}: ${error}`);
		return {};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		console.error(`Commands config must contain an object: ${COMMANDS_PATH}`);
		return {};
	}

	const commands: CommandsConfig = {};
	for (const [name, value] of Object.entries(parsed)) {
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
			console.error(`Ignoring invalid command name "${name}"`);
			continue;
		}

		if (!isCommandConfig(value)) {
			console.error(`Ignoring invalid command config "${name}"`);
			continue;
		}

		commands[name] = value;
	}

	return commands;
}

function isCommandConfig(value: unknown): value is CommandConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	const config = value as Record<string, unknown>;
	return (
		typeof config.provider === "string" &&
		config.provider.length > 0 &&
		typeof config.model === "string" &&
		config.model.length > 0 &&
		typeof config.thinkingLevel === "string" &&
		THINKING_LEVELS.has(config.thinkingLevel as ThinkingLevel) &&
		typeof config.skill === "string" &&
		config.skill.length > 0
	);
}

function hasSkill(pi: ExtensionAPI, skillName: string): boolean {
	return pi.getCommands().some((command) => command.source === "skill" && command.name === `skill:${skillName}`);
}

function registerCommand(pi: ExtensionAPI, name: string, config: CommandConfig): void {
	pi.registerCommand(name, {
		description: `Run ${config.skill} with ${config.provider}/${config.model}`,
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent busy", "warning");
				return;
			}

			const skillName = config.skill;
			if (!hasSkill(pi, skillName)) {
				ctx.ui.notify(`Skill not found: ${skillName}`, "error");
				return;
			}

			const model = ctx.modelRegistry.find(config.provider, config.model);
			if (!model) {
				ctx.ui.notify(`Model not found: ${config.provider}/${config.model}`, "error");
				return;
			}

			const selected = await pi.setModel(model);
			if (!selected) {
				ctx.ui.notify(`No API key for ${config.provider}/${config.model}`, "error");
				return;
			}

			pi.setThinkingLevel(config.thinkingLevel);

			const prompt = args.trim() ? `/skill:${skillName} ${args}` : `/skill:${skillName}`;
			try {
				pi.sendUserMessage(prompt, { expandPromptTemplates: true });
			} catch (error) {
				ctx.ui.notify(`Failed to run ${skillName}: ${error}`, "error");
			}
		},
	});
}

export default function commandsExtension(pi: ExtensionAPI) {
	const commands = loadCommands();
	for (const [name, config] of Object.entries(commands)) {
		registerCommand(pi, name, config);
	}
}
