import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronUp, X } from 'lucide-solid';
import type { SessionResume } from '@/lib/resumeDetector';

interface SessionResumeCardProps {
  resume: SessionResume;
  resumedAgo: string;
  projectName?: string;
  costDisplay?: string;
  onDismiss: () => void;
  onContinue: () => void;
}

const SessionResumeCard: Component<SessionResumeCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const visibleFiles = () =>
    expanded() ? props.resume.filesTouched : props.resume.filesTouched.slice(0, 4);
  const extraFiles = () => Math.max(0, props.resume.filesTouched.length - 4);

  return (
    <div
      class="mx-3 mb-2 rounded-lg animate-fade-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-primary)',
        'box-shadow': 'var(--shadow-sm)',
      }}
      role="region"
      aria-label="Session resumed"
    >
      <div
        class="flex items-center justify-between px-3 py-2 rounded-t-lg"
        style={{
          background: 'rgba(232, 130, 90, 0.07)',
          'border-bottom': '1px solid var(--color-border-secondary)',
        }}
      >
        <div class="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>📋</span>
          <span class="font-medium" style={{ color: 'var(--color-accent)' }}>
            Resumed
          </span>
          <span>{props.resumedAgo}</span>
          <Show when={props.projectName}>
            <span>·</span>
            <span>{props.projectName}</span>
          </Show>
          <Show when={props.costDisplay}>
            <span>·</span>
            <span>{props.costDisplay} spent</span>
          </Show>
        </div>
        <button
          class="flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
          onClick={props.onDismiss}
          aria-label="Dismiss resume card"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      <div class="px-3 py-2.5 space-y-2">
        <div class="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>Last message: </span>
          <Show
            when={expanded()}
            fallback={
              <button
                class="italic"
                onClick={() => setExpanded(true)}
                style={{ color: 'var(--color-text-secondary)' }}
                title="Show full message"
              >
                "{props.resume.lastMessagePreview}"
              </button>
            }
          >
            <span class="italic">"{props.resume.lastMessagePreview}"</span>
          </Show>
        </div>

        <Show when={props.resume.filesTouched.length > 0}>
          <div class="text-xs">
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              Files touched ({props.resume.filesTouched.length}):{' '}
            </span>
            <For each={visibleFiles()}>
              {(file, i) => (
                <>
                  <span class="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {file}
                  </span>
                  <Show when={i() < visibleFiles().length - 1}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}> · </span>
                  </Show>
                </>
              )}
            </For>
            <Show when={!expanded() && extraFiles() > 0}>
              <span style={{ color: 'var(--color-text-tertiary)' }}> +{extraFiles()} more</span>
            </Show>
          </div>
        </Show>

        <Show when={props.resume.openTodos.length > 0}>
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              Open todos ({props.resume.openTodos.length}):
            </span>
            <For each={props.resume.openTodos}>
              {(todo) => <span style={{ color: 'var(--color-text-secondary)' }}>✗ {todo}</span>}
            </For>
          </div>
        </Show>
      </div>

      <div
        class="flex items-center gap-2 px-3 py-2 rounded-b-lg"
        style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onClick={props.onContinue}
        >
          Continue ▸
        </button>
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          <Show when={expanded()} fallback={<ChevronDown size={11} />}>
            <ChevronUp size={11} />
          </Show>
          <span>{expanded() ? 'Show less' : 'Show full summary'}</span>
        </button>
      </div>
    </div>
  );
};

export default SessionResumeCard;
