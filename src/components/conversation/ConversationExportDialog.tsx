import type { Component } from 'solid-js';
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { Message } from '@/lib/types';
import {
  type ExportFormat,
  type ExportOptions,
  buildExportFilename,
  exportAsHtml,
  exportAsJson,
  exportAsMarkdown,
  exportAsText,
} from '@/lib/conversationExport';
import { addToast } from '@/stores/toastStore';

export interface ConversationExportDialogProps {
  open: boolean;
  sessionId: string;
  messages: Message[];
  onClose: () => void;
}

const ConversationExportDialog: Component<ConversationExportDialogProps> = (props) => {
  let dialogRef: HTMLDivElement | undefined;

  const [format, setFormat] = createSignal<ExportFormat>('html');
  const [redact, setRedact] = createSignal(true);
  const [includeToolCalls, setIncludeToolCalls] = createSignal(true);
  const [includeThinking, setIncludeThinking] = createSignal(true);
  const [includeTokenCounts, setIncludeTokenCounts] = createSignal(false);
  const [theme, setTheme] = createSignal<'dark' | 'light' | 'system'>('system');
  const [exporting, setExporting] = createSignal(false);
  const formatOptions = ['html', 'md', 'txt', 'json'] as const;
  const themeOptions = ['system', 'dark', 'light'] as const;
  const checkboxOptions = [
    { label: 'Redact secrets', value: redact, set: setRedact },
    { label: 'Include tool calls', value: includeToolCalls, set: setIncludeToolCalls },
    { label: 'Include thinking blocks', value: includeThinking, set: setIncludeThinking },
    { label: 'Include token counts', value: includeTokenCounts, set: setIncludeTokenCounts },
  ] as const;

  createEffect(() => {
    if (!props.open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    requestAnimationFrame(() => dialogRef?.focus());
  });

  function previewSummary(): string {
    const count = props.messages.filter(
      (message) =>
        message.role === 'user' ||
        message.role === 'assistant' ||
        (includeThinking() && message.role === 'thinking') ||
        (includeToolCalls() &&
          (message.role === 'tool_use' || message.role === 'tool_result')),
    ).length;

    const formatLabel = format().toUpperCase();
    const redactNote = redact() ? ' • Secrets redacted' : '';
    return `${formatLabel} export • ${count} messages${redactNote}`;
  }

  async function handleExport(): Promise<void> {
    setExporting(true);

    try {
      const options: ExportOptions = {
        redact: redact(),
        includeToolCalls: includeToolCalls(),
        includeThinking: includeThinking(),
        includeTokenCounts: includeTokenCounts(),
      };

      const selectedFormat = format();
      const sessionMeta = { id: props.sessionId };

      let content: string;
      if (selectedFormat === 'html') {
        content = exportAsHtml(props.messages, props.sessionId, options);
      } else if (selectedFormat === 'md') {
        content = exportAsMarkdown(props.messages, props.sessionId, options);
      } else if (selectedFormat === 'json') {
        content = exportAsJson(props.messages, sessionMeta, options);
      } else {
        content = exportAsText(props.messages, props.sessionId, options);
      }

      const savedPath = await invoke<string | null>('save_export_file', {
        content,
        default_name: buildExportFilename(props.sessionId, selectedFormat),
        extension: selectedFormat,
      });

      if (savedPath) {
        props.onClose();
        addToast('Conversation exported', 'success', {
          label: 'Open File',
          onClick: () => void invoke('open_path_in_shell', { path: savedPath }),
        });
      }
    } catch (error) {
      addToast(
        'Export failed',
        'error',
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={{ 'background-color': 'rgba(0, 0, 0, 0.5)' }}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div
          ref={dialogRef}
          class="mx-4 w-full rounded-lg shadow-xl outline-none"
          style={{
            'max-width': '420px',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-primary)',
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="conv-export-title"
        >
          <div class="px-5 py-4" style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
            <h2
              id="conv-export-title"
              class="text-sm font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Export Conversation
            </h2>
          </div>

          <div class="space-y-4 px-5 py-4">
            <div class="space-y-1.5">
              <label class="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Format
              </label>
              <div class="grid grid-cols-4 gap-1.5">
                <For each={formatOptions}>
                  {(candidateFormat) => (
                    <button
                      class="rounded py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background:
                          format() === candidateFormat
                            ? 'var(--color-accent)'
                            : 'var(--color-bg-elevated)',
                        color:
                          format() === candidateFormat
                            ? 'var(--color-text-inverse)'
                            : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-secondary)',
                      }}
                      onClick={() => setFormat(candidateFormat)}
                      aria-pressed={format() === candidateFormat}
                    >
                      {candidateFormat === 'html'
                        ? 'HTML'
                        : candidateFormat === 'md'
                          ? 'Markdown'
                          : candidateFormat === 'txt'
                            ? 'Plain'
                            : 'JSON'}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Show when={format() === 'html'}>
              <div class="space-y-1.5">
                <label class="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Theme
                </label>
                <div class="flex gap-1.5">
                  <For each={themeOptions}>
                    {(themeOption) => (
                      <button
                        class="rounded px-3 py-1 text-xs transition-colors"
                        style={{
                          background:
                            theme() === themeOption
                              ? 'var(--color-accent)'
                              : 'var(--color-bg-elevated)',
                          color:
                            theme() === themeOption
                              ? 'var(--color-text-inverse)'
                              : 'var(--color-text-secondary)',
                          border: '1px solid var(--color-border-secondary)',
                        }}
                        onClick={() => setTheme(themeOption)}
                        aria-pressed={theme() === themeOption}
                      >
                        {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div class="space-y-2">
              <label class="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Options
              </label>
              <For each={checkboxOptions}>
                {(option) => (
                  <label
                    class="flex cursor-pointer select-none items-center gap-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={option.value()}
                      onChange={(event) =>
                        (option.set as (value: boolean) => void)(event.currentTarget.checked)
                      }
                      class="h-3.5 w-3.5"
                      style={{ 'accent-color': 'var(--color-accent)' }}
                    />
                    <span class="text-xs">{option.label}</span>
                  </label>
                )}
              </For>
            </div>

            <div
              class="rounded-md px-3 py-2 text-xs"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {previewSummary()}
            </div>
          </div>

          <div
            class="flex justify-end gap-2 px-5 py-3"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-elevated)',
              }}
              onClick={() => props.onClose()}
              disabled={exporting()}
            >
              Cancel
            </button>
            <button
              class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-inverse)',
                background: 'var(--color-accent)',
                opacity: exporting() ? '0.6' : '1',
              }}
              onClick={() => void handleExport()}
              disabled={exporting()}
            >
              {exporting() ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ConversationExportDialog;
