// src/components/conversation/WelcomeScreen.tsx
// Welcome screen shown when the conversation is empty (CHI-242).

import type { Component } from 'solid-js';
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { FolderOpen } from 'lucide-solid';
import { t } from '@/stores/i18nStore';
import { projectState } from '@/stores/projectStore';

interface PromptCard {
  titleKey: string;
  descKey: string;
  prompt: string;
}

const PROMPT_CARDS: PromptCard[] = [
  {
    titleKey: 'conversation.sampleExplain',
    descKey: 'conversation.sampleExplainDesc',
    prompt:
      'Give me a high-level overview of this codebase. What does it do, how is it structured, and what are the key files?',
  },
  {
    titleKey: 'conversation.sampleBug',
    descKey: 'conversation.sampleBugDesc',
    prompt: "Help me debug an issue I'm seeing. Let me describe what's happening...",
  },
  {
    titleKey: 'conversation.sampleFeature',
    descKey: 'conversation.sampleFeatureDesc',
    prompt: 'I want to add a new feature. Here is what it should do...',
  },
  {
    titleKey: 'conversation.sampleReview',
    descKey: 'conversation.sampleReviewDesc',
    prompt: 'Review the latest changes and summarize potential risks and next steps.',
  },
];

const TIPS = [
  'conversation.welcomeTip1',
  'conversation.welcomeTip2',
  'conversation.welcomeTip3',
  'conversation.welcomeTip4',
] as const;

interface WelcomeScreenProps {
  onPromptSelect: (text: string) => void;
  model: string;
  onOpenProject?: () => void;
}

const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  const [tipIndex, setTipIndex] = createSignal(0);
  let tipInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    tipInterval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 5000);
  });

  onCleanup(() => {
    if (tipInterval) clearInterval(tipInterval);
  });

  return (
    <div class="flex flex-col items-center justify-center h-full px-6 pb-8 animate-fade-in">
      <div class="flex flex-col items-center gap-3 mb-8">
        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 35%, transparent) 0%, var(--color-accent-muted) 100%)',
            'box-shadow': '0 0 20px color-mix(in srgb, var(--color-accent) 30%, transparent)',
          }}
        >
          <span
            class="font-bold select-none"
            style={{
              'font-size': '22px',
              'letter-spacing': '-0.02em',
              color: 'var(--color-accent)',
            }}
          >
            CW
          </span>
        </div>
        <div class="text-center">
          <h1
            class="font-semibold"
            style={{
              'font-size': '20px',
              color: 'var(--color-text-primary)',
              'letter-spacing': '-0.02em',
            }}
          >
            Chief Wiggum
          </h1>
          <p class="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('conversation.emptySubtitle')}
          </p>
        </div>
        <span
          class="px-2 py-0.5 rounded-full text-[10px] font-mono"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
            color: 'var(--color-text-tertiary)',
          }}
          title={t('conversation.activeModel')}
        >
          {props.model}
        </span>
      </div>

      <Show when={!projectState.activeProjectId && props.onOpenProject}>
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg mb-6 text-sm transition-colors"
          style={{
            background: 'var(--color-accent-muted)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            color: 'var(--color-accent)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => props.onOpenProject?.()}
        >
          <FolderOpen size={14} />
          {t('sidebar.openProject')}
        </button>
      </Show>

      <div class="grid grid-cols-2 gap-3 w-full max-w-[480px] mb-6">
        <For each={PROMPT_CARDS}>
          {(card) => (
            <button
              class="flex flex-col items-start gap-1 p-3 rounded-lg text-left transition-colors"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-secondary)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-elevated)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-secondary)';
              }}
              onClick={() => props.onPromptSelect(card.prompt)}
            >
              <span class="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {t(card.titleKey)}
              </span>
              <span
                class="text-[10px] leading-snug"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t(card.descKey)}
              </span>
            </button>
          )}
        </For>
      </div>

      <p
        data-testid="welcome-tip"
        class="text-[10px] text-center"
        style={{ color: 'var(--color-text-tertiary)', 'max-width': '320px' }}
      >
        {t(TIPS[tipIndex()])}
      </p>
    </div>
  );
};

export default WelcomeScreen;
