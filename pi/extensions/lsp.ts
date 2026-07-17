/**
 * LSP Extension
 *
 * Exposes go-to-definition, find-references, and hover via language servers
 * already installed by Mason (Neovim's LSP installer). No separate install —
 * reuses binaries in ~/.local/share/nvim/mason/bin.
 *
 * Tools: lsp_definition, lsp_references, lsp_hover
 *
 * Add more servers by extending SERVERS below (must speak stdio JSON-RPC).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname, basename } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MASON_BIN = join(homedir(), ".local", "share", "nvim", "mason", "bin");

interface ServerConfig {
	command: string;
	args: string[];
	languageId: string;
}

// filename/extension -> mason server binary + LSP languageId
const SERVERS: Record<string, ServerConfig> = {
	".ts": { command: "typescript-language-server", args: ["--stdio"], languageId: "typescript" },
	".tsx": { command: "typescript-language-server", args: ["--stdio"], languageId: "typescriptreact" },
	".js": { command: "typescript-language-server", args: ["--stdio"], languageId: "javascript" },
	".jsx": { command: "typescript-language-server", args: ["--stdio"], languageId: "javascriptreact" },
	".mjs": { command: "typescript-language-server", args: ["--stdio"], languageId: "javascript" },
	".lua": { command: "lua-language-server", args: [], languageId: "lua" },
	".sh": { command: "bash-language-server", args: ["start"], languageId: "shellscript" },
	".bash": { command: "bash-language-server", args: ["start"], languageId: "shellscript" },
	".json": { command: "vscode-json-language-server", args: ["--stdio"], languageId: "json" },
	".yaml": { command: "yaml-language-server", args: ["--stdio"], languageId: "yaml" },
	".yml": { command: "yaml-language-server", args: ["--stdio"], languageId: "yaml" },
	".php": { command: "intelephense", args: ["--stdio"], languageId: "php" },
	".vue": { command: "vue-language-server", args: ["--stdio"], languageId: "vue" },
	".md": { command: "marksman", args: ["server"], languageId: "markdown" },
};

function serverForFile(path: string): ServerConfig | undefined {
	if (basename(path) === "Dockerfile") {
		return { command: "docker-langserver", args: ["--stdio"], languageId: "dockerfile" };
	}
	return SERVERS[extname(path)];
}

function resolveBin(command: string): string | undefined {
	const masonPath = join(MASON_BIN, command);
	if (existsSync(masonPath)) return masonPath;
	return undefined; // fall back to PATH lookup by spawn if not in mason
}

// --- minimal LSP JSON-RPC client (Content-Length framed stdio) ---

class LspClient {
	private proc: ChildProcessWithoutNullStreams;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
	private docVersions = new Map<string, number>();
	private docText = new Map<string, string>();
	private diagnostics = new Map<string, { items: any[]; receivedAt: number }>();
	private diagnosticsWaiters = new Map<string, Array<() => void>>();
	ready: Promise<void>;

	constructor(command: string, args: string[], cwd: string) {
		const bin = resolveBin(command) ?? command;
		this.proc = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
		this.proc.stdout.on("data", (chunk) => this.onData(chunk));
		this.proc.on("error", (err) => {
			for (const { reject } of this.pending.values()) reject(err);
			this.pending.clear();
		});
		this.ready = this.initialize(cwd);
	}

	private onData(chunk: Buffer) {
		this.buffer += chunk.toString("utf8");
		while (true) {
			const headerEnd = this.buffer.indexOf("\r\n\r\n");
			if (headerEnd === -1) return;
			const header = this.buffer.slice(0, headerEnd);
			const match = header.match(/Content-Length: (\d+)/i);
			if (!match) {
				this.buffer = this.buffer.slice(headerEnd + 4);
				continue;
			}
			const length = Number(match[1]);
			const bodyStart = headerEnd + 4;
			if (this.buffer.length < bodyStart + length) return; // wait for more data
			const body = this.buffer.slice(bodyStart, bodyStart + length);
			this.buffer = this.buffer.slice(bodyStart + length);
			this.handleMessage(JSON.parse(body));
		}
	}

	private handleMessage(msg: any) {
		if (msg.id !== undefined && this.pending.has(msg.id)) {
			const { resolve, reject } = this.pending.get(msg.id)!;
			this.pending.delete(msg.id);
			if (msg.error) reject(new Error(msg.error.message ?? "LSP error"));
			else resolve(msg.result);
			return;
		}
		if (msg.method === "textDocument/publishDiagnostics") {
			const uri = msg.params.uri;
			this.diagnostics.set(uri, { items: msg.params.diagnostics ?? [], receivedAt: Date.now() });
			for (const wake of this.diagnosticsWaiters.get(uri) ?? []) wake();
		}
		// ignore other server->client requests/notifications (window/logMessage etc.)
	}

	private write(obj: unknown) {
		const json = JSON.stringify(obj);
		const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
		this.proc.stdin.write(header + json);
	}

	request(method: string, params: unknown, timeoutMs = 10000): Promise<any> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`LSP request '${method}' timed out`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v);
				},
				reject: (e) => {
					clearTimeout(timer);
					reject(e);
				},
			});
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}

	notify(method: string, params: unknown) {
		this.write({ jsonrpc: "2.0", method, params });
	}

	private async initialize(cwd: string) {
		await this.request("initialize", {
			processId: process.pid,
			rootUri: `file://${cwd}`,
			workspaceFolders: [{ uri: `file://${cwd}`, name: basename(cwd) }],
			capabilities: {
				textDocument: {
					synchronization: { didSave: true },
					hover: { contentFormat: ["plaintext", "markdown"] },
					definition: {},
					references: {},
					// server withholds diagnostics push entirely without this declared
					publishDiagnostics: { relatedInformation: true, versionSupport: true },
				},
			},
		});
		this.notify("initialized", {});
	}

	// Opens doc on first use; sends didChange if disk content moved since last sync.
	// Keeps definition/hover/references from answering against stale cached text.
	async syncDoc(path: string, languageId: string) {
		const uri = `file://${path}`;
		const text = await readFile(path, "utf8");
		const prevText = this.docText.get(uri);
		if (prevText === undefined) {
			this.docVersions.set(uri, 1);
			this.docText.set(uri, text);
			this.notify("textDocument/didOpen", {
				textDocument: { uri, languageId, version: 1, text },
			});
		} else if (prevText !== text) {
			const version = (this.docVersions.get(uri) ?? 1) + 1;
			this.docVersions.set(uri, version);
			this.docText.set(uri, text);
			this.notify("textDocument/didChange", {
				textDocument: { uri, version },
				contentChanges: [{ text }],
			});
		}
		return uri;
	}

	// Diagnostics arrive async via server push, not a request/response.
	// Wait for a publish newer than `sinceTs`, else return whatever's cached after timeout.
	// Cold server spawn + index (intelephense on a real project) can eat several
	// seconds before the first push ever arrives — give it real headroom.
	// Cold server spawn + index (intelephense on a real project) can eat several
	// seconds before the first push ever arrives — give it real headroom.
	// Some servers (intelephense) push an early empty diagnostics set right after
	// didOpen, before real analysis finishes, then push again with real results.
	// Debounce: wait for a quiet period with no new push before trusting the result.
	waitForDiagnostics(uri: string, sinceTs: number, timeoutMs = 8000, settleMs = 900): Promise<any[]> {
		return new Promise((resolve) => {
			let settleTimer: NodeJS.Timeout | undefined;
			const finish = () => {
				clearTimeout(overallTimer);
				clearTimeout(settleTimer);
				const list = this.diagnosticsWaiters.get(uri);
				if (list) this.diagnosticsWaiters.set(uri, list.filter((w) => w !== wake));
				resolve(this.diagnostics.get(uri)?.items ?? []);
			};
			const overallTimer = setTimeout(finish, timeoutMs);
			const wake = () => {
				clearTimeout(settleTimer);
				settleTimer = setTimeout(finish, settleMs);
			};
			const cached = this.diagnostics.get(uri);
			if (cached && cached.receivedAt > sinceTs) wake();
			const waiters = this.diagnosticsWaiters.get(uri) ?? [];
			waiters.push(wake);
			this.diagnosticsWaiters.set(uri, waiters);
		});
	}

	dispose() {
		try {
			this.notify("shutdown", null);
			this.notify("exit", null);
		} catch {
			// best effort
		}
		this.proc.kill();
	}
}

export default function lspExtension(pi: ExtensionAPI) {
	// key: `${cwd}:${command}` -> client (one server instance per root+language)
	const clients = new Map<string, LspClient>();

	function clientFor(cwd: string, config: ServerConfig): LspClient {
		const key = `${cwd}:${config.command}`;
		let client = clients.get(key);
		if (!client) {
			client = new LspClient(config.command, config.args, cwd);
			clients.set(key, client);
		}
		return client;
	}

	async function withDoc(cwd: string, relPath: string) {
		const path = relPath.startsWith("/") ? relPath : join(cwd, relPath);
		const config = serverForFile(path);
		if (!config) {
			throw new Error(`No LSP server configured for ${relPath}. Install one via Mason and add it to SERVERS in lsp.ts.`);
		}
		if (!resolveBin(config.command)) {
			throw new Error(`'${config.command}' not found in ${MASON_BIN} or PATH. Install it via Mason (:MasonInstall ${config.command}).`);
		}
		const client = clientFor(cwd, config);
		await client.ready;
		const uri = await client.syncDoc(path, config.languageId);
		return { client, uri };
	}

	const positionParams = Type.Object({
		path: Type.String({ description: "File path, absolute or relative to project root" }),
		line: Type.Number({ description: "1-indexed line number" }),
		column: Type.Number({ description: "1-indexed column number" }),
	});

	function toLspPosition(line: number, column: number) {
		return { line: line - 1, character: column - 1 }; // LSP is 0-indexed
	}

	function locationToText(loc: any): string {
		if (!loc) return "";
		const uri = loc.uri ?? loc.targetUri;
		const range = loc.range ?? loc.targetRange;
		if (!uri || !range) return JSON.stringify(loc);
		const path = uri.replace("file://", "");
		return `${path}:${range.start.line + 1}:${range.start.character + 1}`;
	}

	pi.registerTool({
		name: "lsp_definition",
		label: "LSP Definition",
		description: "Go to definition of the symbol at a file position, using the project's language server (via Mason).",
		promptSnippet: "Jump to a symbol's definition with lsp_definition(path, line, column)",
		parameters: positionParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { client, uri } = await withDoc(ctx.cwd, params.path);
			const result = await client.request("textDocument/definition", {
				textDocument: { uri },
				position: toLspPosition(params.line, params.column),
			});
			const locations = Array.isArray(result) ? result : result ? [result] : [];
			if (locations.length === 0) {
				return { content: [{ type: "text", text: "No definition found." }], details: {} };
			}
			return {
				content: [{ type: "text", text: locations.map(locationToText).join("\n") }],
				details: { locations },
			};
		},
	});

	pi.registerTool({
		name: "lsp_references",
		label: "LSP References",
		description: "Find all references to the symbol at a file position, using the project's language server (via Mason).",
		promptSnippet: "Find references to a symbol with lsp_references(path, line, column)",
		parameters: positionParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { client, uri } = await withDoc(ctx.cwd, params.path);
			const result = await client.request("textDocument/references", {
				textDocument: { uri },
				position: toLspPosition(params.line, params.column),
				context: { includeDeclaration: true },
			});
			const locations = Array.isArray(result) ? result : [];
			if (locations.length === 0) {
				return { content: [{ type: "text", text: "No references found." }], details: {} };
			}
			return {
				content: [{ type: "text", text: locations.map(locationToText).join("\n") }],
				details: { locations },
			};
		},
	});

	pi.registerTool({
		name: "lsp_hover",
		label: "LSP Hover",
		description: "Show type/signature info for the symbol at a file position, using the project's language server (via Mason).",
		promptSnippet: "Show hover/type info for a symbol with lsp_hover(path, line, column)",
		parameters: positionParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { client, uri } = await withDoc(ctx.cwd, params.path);
			const result = await client.request("textDocument/hover", {
				textDocument: { uri },
				position: toLspPosition(params.line, params.column),
			});
			if (!result?.contents) {
				return { content: [{ type: "text", text: "No hover info." }], details: {} };
			}
			const contents = result.contents;
			const text =
				typeof contents === "string"
					? contents
					: contents.value ?? (Array.isArray(contents) ? contents.map((c: any) => c.value ?? c).join("\n") : JSON.stringify(contents));
			return { content: [{ type: "text", text }], details: { result } };
		},
	});

	const SEVERITY = { 1: "error", 2: "warning", 3: "info", 4: "hint" } as const;

	pi.registerTool({
		name: "lsp_diagnostics",
		label: "LSP Diagnostics",
		description: "Show compiler/linter errors and warnings for a file, using the project's language server (via Mason).",
		promptSnippet: "Check a file for errors/warnings with lsp_diagnostics(path)",
		parameters: Type.Object({
			path: Type.String({ description: "File path, absolute or relative to project root" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const before = Date.now();
			const { client, uri } = await withDoc(ctx.cwd, params.path);
			const items = await client.waitForDiagnostics(uri, before);
			if (items.length === 0) {
				return { content: [{ type: "text", text: "No diagnostics." }], details: {} };
			}
			const lines = items.map((d: any) => {
				const sev = SEVERITY[d.severity as 1 | 2 | 3 | 4] ?? "info";
				const loc = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
				const source = d.source ? `[${d.source}] ` : "";
				return `${loc} ${sev}: ${source}${d.message}`;
			});
			return { content: [{ type: "text", text: lines.join("\n") }], details: { items } };
		},
	});

	pi.on("session_shutdown", async () => {
		for (const client of clients.values()) client.dispose();
		clients.clear();
	});
}
