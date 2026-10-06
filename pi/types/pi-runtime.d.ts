declare const process: {
  cwd(): string;
};

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module "node:os" {
  export function homedir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare module "@earendil-works/pi-ai" {
  export interface AssistantMessage {
    role: "assistant";
    model?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: {
        total?: number;
      };
    };
  }
}

declare module "@earendil-works/pi-tui" {
  export class Box {
    constructor(paddingX?: number, paddingY?: number);
    addChild(child: { render(width: number): string[] }): void;
  }

  export function truncateToWidth(text: string, width: number, ellipsis?: string): string;
  export function visibleWidth(text: string): number;
}

declare module "@earendil-works/pi-coding-agent" {
  interface Theme {
    fg(color: string, text: string): string;
  }

  interface SessionStartContext {
    sessionManager: {
      getSessionFile(): string | null | undefined;
    };
  }

  interface TurnEndContext {
    model?: {
      id?: string;
    };
  }

  interface TurnEndEvent {
    message: import("@earendil-works/pi-ai").AssistantMessage;
  }

  export interface ExtensionAPI {
    registerMessageRenderer(
      customType: string,
      renderer: (message: { details: unknown }, options: unknown, theme: Theme) => unknown,
    ): void;
    on(
      event: "session_start",
      handler: (event: unknown, ctx: SessionStartContext) => unknown,
    ): void;
    on(
      event: "turn_end",
      handler: (event: TurnEndEvent, ctx: TurnEndContext) => unknown,
    ): void;
    registerCommand(
      name: string,
      command: {
        description: string;
        handler: (args: string, ctx: unknown) => unknown;
      },
    ): void;
    sendMessage(message: {
      customType: string;
      content: string;
      display: boolean;
      details: unknown;
    }): void;
  }
}
