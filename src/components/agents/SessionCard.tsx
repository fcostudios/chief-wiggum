// src/components/agents/SessionCard.tsx
// Session card used by the Agents parallel session manager grid (CHI-227).

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import type { ProcessStatus, Session } from '@/lib/types';

type SessionCardStatus = ProcessStatus | 'waiting';

interface SessionCardProps {
  session: Session;
  status: SessionCardStatus;
  isActive: boolean;
  lastMessage?: string;
  messageCount?: number;
  projectName?: string;
  onFocus: () => void;
  onStop: () => void;
  onSplit: () => void;
}

function statusDot(status: SessionCardStatus): { color: string; pulse: boolean; label: string } {
  if (status === 'running' || status === 'starting') {
    return { color: 'var(--color-success)', pulse: true, label: 'Running' };
  }
  if (status === 'waiting') {
    return { color: 'var(--color-warning)', pulse: false, label: 'Waiting' };
  }
  if (status === 'error') {
    return { color: 'var(--color-error)', pulse: false, label: 'Error' };
  }
  return { color: 'var(--color-text-tertiary)', pulse: false, label: 'Idle' };
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function formatAge(updatedAt: string | null): string {
  const ts = parseTimestamp(updatedAt);
  if (ts == null) return 'unknown';
  const diffMs = Math.max(0, Date.now() - ts);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const SessionCard: Component<SessionCardProps> = (props) => {
  const dot = () => statusDot(props.status);
  const messageCount = () => Math.max(0, props.messageCount ?? 0);
  const costDisplay = () =>
    props.session.total_cost_cents != null
      ? `$${(props.session.total_cost_cents / 100).toFixed(2)}`
      : '$0.00';

  return (
    <article
      class="flex flex-col rounded-lg overflow-hidden transition-all"
      style={{
        background: props.isActive ? 'rgba(232, 130, 90, 0.07)' : 'var(--color-bg-elevated)',
        border: props.isActive
          ? '1px solid rgba(232, 130, 90, 0.3)'
          : '1px solid var(--color-border-secondary)',
        'box-shadow': props.isActive ? '0 0 0 1px rgba(232, 130, 90, 0.1)' : 'none',
        'transition-duration': 'var(--duration-fast)',
      }}
    >
      <div class="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block w-2 h-2 rounded-full"
            classList={{ 'animate-pulse': dot().pulse }}
            style={{
              background: dot().color,
              'box-shadow': dot().pulse ? `0 0 4px ${dot().color}` : 'none',
            }}
            role="img"
            aria-label={dot().label}
          />
          <span class="text-[11px] font-medium" style={{ color: dot().color }}>
            {dot().label}
          </span>
        </div>

        <Show when={props.status === 'running' || props.status === 'starting'}>
          <button
            class="px-1.5 py-0.5 rounded text-[10px] transition-colors"
            style={{
              color: 'var(--color-error)',
              background: 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.15)',
            }}
            onClick={() => props.onStop()}
            aria-label="Stop session"
          >
            Stop
          </button>
        </Show>
      </div>

      <div class="px-3 pb-1">
        <p class="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {props.session.title || 'New Session'}
        </p>
        <p class="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {props.projectName ? `${props.projectName} · ` : ''}
          {props.session.model}
        </p>
      </div>

      <Show when={props.lastMessage}>
        <div
          class="mx-3 mb-2 px-2 py-1.5 rounded text-[11px] italic"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {props.lastMessage!.slice(0, 80)}
          {props.lastMessage!.length > 80 ? '…' : ''}
        </div>
      </Show>

      <div
        class="px-3 py-1.5 flex items-center gap-2 text-[10px]"
        style={{
          color: 'var(--color-text-tertiary)',
          'border-top': '1px solid var(--color-border-secondary)',
        }}
      >
        <span class="font-mono">{costDisplay()}</span>
        <span aria-hidden="true">·</span>
        <span>{messageCount()} msgs</span>
        <span aria-hidden="true">·</span>
        <span>{formatAge(props.session.updated_at)}</span>
      </div>

      <div
        class="flex items-center gap-1.5 px-3 py-2"
        style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
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
          onClick={() => props.onFocus()}
        >
          Focus ▸
        </button>
        <button
          class="px-2 py-1 rounded text-[11px] transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-elevated)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-inset)';
          }}
          onClick={() => props.onSplit()}
          title="Open alongside current session"
          aria-label="Open in split"
        >
          Split ⊞
        </button>
      </div>
    </article>
  );
};

export default SessionCard;
