// src/components/actions/ActionOutputPanel.tsx
// Streaming output display for a selected action (CHI-143).

import type { Component, JSX } from 'solid-js';
import { For, Show, createEffect } from 'solid-js';
import { Copy, Trash2, ArrowDown, MessageSquare } from 'lucide-solid';
import {
  actionState,
  getActionOutput,
  getActionStatus,
  clearActionOutput,
} from '@/stores/actionStore';
import { sendMessage } from '@/stores/conversationStore';
import { sessionState, createNewSession } from '@/stores/sessionStore';
import { setActiveView } from '@/stores/uiStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';

/** Strip common ANSI escape codes for clean display. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface IconActionButtonProps {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  className?: string;
  color?: string;
  hoverColor?: string;
}

const IconActionButton: Component<IconActionButtonProps> = (props) => (
  <div class="relative group">
    <button
      class={`p-1 rounded transition-colors ${props.className ?? ''}`}
      style={{
        'transition-duration': 'var(--duration-fast)',
        color: props.color ?? 'var(--color-text-tertiary)',
      }}
      onClick={() => props.onClick()}
      aria-label={props.label}
      title={props.label}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = props.hoverColor ?? 'var(--color-text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = props.color ?? 'var(--color-text-tertiary)';
      }}
    >
      {props.icon}
    </button>
    <div
      class="pointer-events-none absolute top-full right-0 mt-1 px-1.5 py-1 rounded text-[10px] whitespace-nowrap opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all z-20"
      style={{
        background: 'rgba(13, 17, 23, 0.95)',
        border: '1px solid var(--color-border-secondary)',
        color: 'var(--color-text-primary)',
        'transition-duration': 'var(--duration-fast)',
        'backdrop-filter': 'blur(8px)',
        'box-shadow': '0 8px 24px rgba(0,0,0,0.25)',
      }}
      role="tooltip"
    >
      {props.label}
    </div>
  </div>
);

const ActionOutputPanel: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  let shouldAutoScroll = true;

  const actionId = () => actionState.selectedActionId;
  const output = () => (actionId() ? getActionOutput(actionId()!) : []);
  const status = () => (actionId() ? getActionStatus(actionId()!) : 'idle');

  createEffect(() => {
    void output().length;
    if (shouldAutoScroll && scrollRef) {
      requestAnimationFrame(() => {
        if (scrollRef) {
          scrollRef.scrollTop = scrollRef.scrollHeight;
        }
      });
    }
  });

  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function handleCopy() {
    const text = output()
      .map((line) => stripAnsi(line.line))
      .join('\n');
    void navigator.clipboard.writeText(text);
  }

  function handleClear() {
    const id = actionId();
    if (id) clearActionOutput(id);
  }

  function scrollToBottom() {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
      shouldAutoScroll = true;
    }
  }

  function handleAskAI() {
    const lines = output();
    const selectedAction = actionId();
    if (!selectedAction || lines.length === 0) {
      addToast('No action output to analyze', 'warning');
      return;
    }

    const tail = lines.slice(-100);
    const outputText = tail.map((line) => stripAnsi(line.line)).join('\n');
    const prompt = `The project action \`${selectedAction}\` produced the following output:\n\n\`\`\`\n${outputText}\n\`\`\`\n\nPlease analyze this output and help me understand what happened. If there are errors, suggest fixes.`;

    setActiveView('conversation');

    void (async () => {
      try {
        const existingSessionId = sessionState.activeSessionId;
        if (existingSessionId) {
          await sendMessage(prompt, existingSessionId);
          return;
        }

        const session = await createNewSession(
          'claude-sonnet-4-6',
          projectState.activeProjectId ?? undefined,
        );
        await sendMessage(prompt, session.id);
      } catch (err) {
        console.error('[ActionOutputPanel] Failed to pipe action output to AI:', err);
        addToast('Failed to send action output to conversation', 'error');
      }
    })();
  }

  return (
    <div class="flex flex-col h-full min-h-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="text-xs font-mono font-medium truncate max-w-[140px]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {actionId() ?? 'No action'}
          </span>
          <Show when={status() !== 'idle'}>
            <span
              class="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{
                background:
                  status() === 'running' ? 'rgba(63, 185, 80, 0.15)' : 'var(--color-bg-elevated)',
                color:
                  status() === 'running'
                    ? 'var(--color-success)'
                    : status() === 'failed'
                      ? 'var(--color-error)'
                      : 'var(--color-text-tertiary)',
              }}
            >
              {status()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <IconActionButton
            label="Ask AI"
            icon={<MessageSquare size={11} />}
            onClick={handleAskAI}
            hoverColor="var(--color-accent)"
          />
          <IconActionButton
            label="Scroll to bottom"
            icon={<ArrowDown size={11} />}
            onClick={scrollToBottom}
          />
          <IconActionButton label="Copy output" icon={<Copy size={11} />} onClick={handleCopy} />
          <IconActionButton
            label="Clear output"
            icon={<Trash2 size={11} />}
            onClick={handleClear}
            hoverColor="var(--color-error)"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        class="flex-1 min-h-0 overflow-y-auto overflow-x-auto"
        style={{
          background: 'var(--color-bg-inset)',
          'font-family': 'var(--font-mono)',
          'font-size': '11px',
          'line-height': '1.5',
          'scrollbar-gutter': 'stable both-edges',
          'overscroll-behavior': 'contain',
        }}
        onScroll={handleScroll}
      >
        <Show
          when={output().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Run an action to see output
              </p>
            </div>
          }
        >
          <div class="p-2">
            <For each={output()}>
              {(line) => (
                <div
                  class="whitespace-pre-wrap break-all"
                  style={{
                    color: line.is_error ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  }}
                >
                  {stripAnsi(line.line)}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionOutputPanel;
