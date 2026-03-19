import type { TodoItem, TodoWriteData } from './types';

function isTodoStatus(value: unknown): value is TodoItem['status'] {
  return value === 'pending' || value === 'in_progress' || value === 'completed';
}

function normalizeTodoItem(value: unknown): TodoItem | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<TodoItem>;
  const content =
    typeof candidate.content === 'string' && candidate.content.trim().length > 0
      ? candidate.content.trim()
      : null;
  if (!content || !isTodoStatus(candidate.status)) return null;

  const activeForm =
    typeof candidate.activeForm === 'string' && candidate.activeForm.trim().length > 0
      ? candidate.activeForm.trim()
      : content;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id : undefined,
    content,
    activeForm,
    status: candidate.status,
  };
}

export function normalizeTodoItems(todos: unknown): TodoItem[] {
  if (!Array.isArray(todos)) return [];
  return todos.map(normalizeTodoItem).filter((item): item is TodoItem => item !== null);
}

export function parseTodoWriteInput(toolInput: string): TodoItem[] {
  try {
    const parsed = JSON.parse(toolInput) as TodoWriteData | { todos?: unknown };
    return normalizeTodoItems(parsed.todos);
  } catch {
    return [];
  }
}
