import type { Message } from './types';
import { parseTodoWriteInput } from './todoWrite';

export interface SessionResume {
  lastMessagePreview: string;
  lastMessageFull: string;
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
  let lastMessageFull = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const normalized = msg.content.trim();
      if (!normalized) continue;
      lastMessageFull = normalized;
      lastMessagePreview = normalized.slice(0, 100);
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
      const todos = parseTodoWriteInput(parsed.tool_input);
      if (todos.length === 0) break;
      openTodos.push(
        ...todos
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
    lastMessageFull,
    filesTouched,
    openTodos,
    lastTool,
  };
}
