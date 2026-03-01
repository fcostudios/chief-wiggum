import type { Message } from './types';

export interface SessionResume {
  lastMessagePreview: string;
  filesTouched: string[];
  openTodos: string[];
  lastTool: string | null;
}

const FILE_TOOL_NAMES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function parseToolUse(content: string): { tool_name?: string; tool_input?: string } | null {
  try {
    return JSON.parse(content) as { tool_name?: string; tool_input?: string };
  } catch {
    return null;
  }
}

export function extractResumeData(messages: Message[]): SessionResume | null {
  const hasAssistant = messages.some((m) => m.role === 'assistant');
  if (!hasAssistant) return null;

  let lastMessagePreview = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      lastMessagePreview = msg.content.slice(0, 100);
      break;
    }
  }

  const fileSeen = new Set<string>();
  const filesTouched: string[] = [];
  let lastTool: string | null = null;

  for (const msg of messages) {
    if (msg.role !== 'tool_use') continue;
    const parsed = parseToolUse(msg.content);
    if (!parsed?.tool_name) continue;

    lastTool = parsed.tool_name;
    if (!FILE_TOOL_NAMES.has(parsed.tool_name) || !parsed.tool_input) continue;

    try {
      const input = JSON.parse(parsed.tool_input) as { file_path?: string; path?: string };
      const filePath = input.file_path ?? input.path;
      if (filePath && !fileSeen.has(filePath)) {
        fileSeen.add(filePath);
        filesTouched.push(filePath);
      }
    } catch {
      // Ignore malformed tool input.
    }
  }

  const openTodos: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool_use') continue;

    const parsed = parseToolUse(msg.content);
    if (!parsed?.tool_name || parsed.tool_name !== 'TodoWrite' || !parsed.tool_input) continue;

    try {
      const input = JSON.parse(parsed.tool_input) as {
        todos?: Array<{ content?: string; status?: string }>;
      };
      if (!Array.isArray(input.todos)) break;
      openTodos.push(
        ...input.todos
          .filter((t) => t.status !== 'completed')
          .map((t) => t.content ?? '')
          .filter(Boolean)
          .slice(0, 3),
      );
      break;
    } catch {
      // Ignore malformed TodoWrite payloads.
    }
  }

  return {
    lastMessagePreview,
    filesTouched,
    openTodos,
    lastTool,
  };
}
