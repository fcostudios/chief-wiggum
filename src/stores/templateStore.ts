import { invoke } from '@tauri-apps/api/core';
import { createStore } from 'solid-js/store';
import type { PromptTemplate } from '@/lib/types';
import { addToast } from '@/stores/toastStore';

interface TemplateState {
  templates: PromptTemplate[];
  loaded: boolean;
}

const [templateState, setTemplateState] = createStore<TemplateState>({
  templates: [],
  loaded: false,
});

export { templateState };

function ensureTemplates(value: unknown): PromptTemplate[] {
  return Array.isArray(value) ? (value as PromptTemplate[]) : [];
}

export async function loadTemplates() {
  try {
    const templates = await invoke<PromptTemplate[] | null>('get_prompt_templates');
    setTemplateState({ templates: ensureTemplates(templates), loaded: true });
  } catch (error) {
    console.error('Failed to load templates', error);
    setTemplateState({ templates: [], loaded: true });
  }
}

export async function createTemplate(name: string, content: string, variables: string[]) {
  const id = await invoke<string>('create_prompt_template', {
    name,
    content,
    variables: JSON.stringify(variables),
  });
  await loadTemplates();
  return id;
}

export async function editTemplate(id: string, name: string, content: string, variables: string[]) {
  await invoke('edit_prompt_template', {
    id,
    name,
    content,
    variables: JSON.stringify(variables),
  });
  await loadTemplates();
}

export async function removeTemplate(id: string) {
  await invoke('remove_prompt_template', { id });
  setTemplateState('templates', (prev) => prev.filter((item) => item.id !== id));
  addToast('Template deleted', 'info');
}

export async function useTemplate(id: string): Promise<string | null> {
  const template = ensureTemplates(templateState.templates).find((item) => item.id === id);
  if (!template) return null;
  await invoke('use_prompt_template', { id }).catch(() => undefined);
  return template.content;
}
