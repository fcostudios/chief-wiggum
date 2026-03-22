import type { Component } from 'solid-js';
import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Check, Copy, Smartphone, X } from 'lucide-solid';
import { getHandoverEntry, reclaimSession } from '@/stores/handoverStore';

interface HandoverPanelProps {
  sessionId: string;
  onClose: () => void;
}

const HandoverPanel: Component<HandoverPanelProps> = (props) => {
  const [qrSvg, setQrSvg] = createSignal('');
  const [qrError, setQrError] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [reclaiming, setReclaiming] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());

  const entry = createMemo(() => getHandoverEntry(props.sessionId));
  const elapsedLabel = createMemo(() => {
    const current = entry();
    if (!current) return '';
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now() - new Date(current.startedAt).getTime()) / 1000),
    );
    if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
    if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m`;
    return `${Math.floor(elapsedSeconds / 3600)}h`;
  });

  onMount(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    const relayUrl = entry()?.relayUrl;
    if (relayUrl) {
      void import('qrcode')
        .then((QRCode) => QRCode.toString(relayUrl, { type: 'svg', margin: 1 }))
        .then(setQrSvg)
        .catch(() => setQrError(true));
    }
    onCleanup(() => window.clearInterval(intervalId));
  });

  async function handleCopy(): Promise<void> {
    const relayUrl = entry()?.relayUrl;
    if (!relayUrl) return;
    await navigator.clipboard.writeText(relayUrl).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleReclaim(): Promise<void> {
    setReclaiming(true);
    try {
      await reclaimSession(props.sessionId);
      props.onClose();
    } finally {
      setReclaiming(false);
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Session handover"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        class="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        <button
          class="absolute right-4 top-4 rounded p-1 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onClick={() => props.onClose()}
          aria-label="Close handover panel"
        >
          <X size={16} />
        </button>

        <div class="mb-5 flex items-start gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(232, 130, 90, 0.12)', color: 'var(--color-accent)' }}
          >
            <Smartphone size={18} />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Session handed over
            </div>
            <div class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Scan the QR code or open the relay URL on your phone.
            </div>
          </div>
          <div
            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: 'rgba(232, 130, 90, 0.12)',
              color: 'var(--color-accent)',
            }}
          >
            {elapsedLabel()}
          </div>
        </div>

        <Show
          when={qrSvg()}
          fallback={
            <Show when={qrError()}>
              <div
                class="mb-4 rounded-xl px-3 py-2 text-center text-xs"
                style={{
                  background: 'var(--color-bg-inset)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                QR unavailable — use the URL above
              </div>
            </Show>
          }
        >
          <div
            class="mb-4 flex items-center justify-center rounded-xl bg-white p-3"
            // eslint-disable-next-line solid/no-innerhtml
            innerHTML={qrSvg()}
          />
        </Show>

        <div
          class="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2"
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <div class="min-w-0 flex-1">
            <div
              class="truncate text-xs font-mono"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {entry()?.relayUrl}
            </div>
          </div>
          <button
            class="rounded p-1 transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onClick={handleCopy}
            aria-label="Copy relay URL"
          >
            <Show when={copied()} fallback={<Copy size={14} />}>
              <Check size={14} style={{ color: 'var(--color-success)' }} />
            </Show>
          </button>
        </div>

        <div
          class="mb-5 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="remote-message-count"
        >
          {entry()?.remoteMessageCount ?? 0} remote message
          {(entry()?.remoteMessageCount ?? 0) === 1 ? '' : 's'} mirrored
        </div>

        <button
          class="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity"
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            opacity: reclaiming() ? '0.7' : '1',
          }}
          onClick={handleReclaim}
          disabled={reclaiming()}
        >
          {reclaiming() ? 'Reclaiming…' : 'Reclaim Session'}
        </button>
      </div>
    </div>
  );
};

export default HandoverPanel;
