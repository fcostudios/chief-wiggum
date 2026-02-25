import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ArrowRight, FolderOpen, Keyboard, MessageSquare, X, Zap } from 'lucide-solid';
import { pickAndCreateProject } from '@/stores/projectStore';
import { markOnboardingCompleted } from '@/stores/settingsStore';

interface StepDef {
  icon: Component<{ size?: number }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const STEPS: StepDef[] = [
  {
    icon: MessageSquare,
    title: 'Welcome to Chief Wiggum',
    description:
      'A desktop GUI for Claude Code CLI with visual multi-agent orchestration, real-time cost tracking, and intelligent context management.',
  },
  {
    icon: FolderOpen,
    title: 'Open a Project',
    description:
      'Select a project folder so Claude Code can understand your codebase and provide relevant assistance.',
    action: {
      label: 'Open Folder',
      onClick: () => {
        void pickAndCreateProject();
      },
    },
  },
  {
    icon: Zap,
    title: 'Choose Your Model',
    description:
      'Use Cmd+M to cycle between Sonnet (fast), Opus (powerful), and Haiku (lightweight). You can change this anytime from the title bar.',
  },
  {
    icon: Keyboard,
    title: 'Key Shortcuts',
    description:
      'Cmd+K opens the command palette. Cmd+B toggles the sidebar. Cmd+/ shows all shortcuts. Press Enter to send a message.',
  },
];

const OnboardingFlow: Component = () => {
  const [step, setStep] = createSignal(0);
  const current = createMemo(() => STEPS[step()]);

  function finish(): void {
    markOnboardingCompleted();
  }

  function next(): void {
    if (step() >= STEPS.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <Portal>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
        style={{ background: 'rgba(0, 0, 0, 0.7)', 'backdrop-filter': 'blur(8px)' }}
      >
        <div
          class="relative w-full max-w-[420px] rounded-xl overflow-hidden animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': 'var(--shadow-lg), var(--glow-accent-subtle)',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <button
            type="button"
            class="absolute top-3 right-3 p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={finish}
            aria-label="Skip onboarding"
          >
            <X size={14} />
          </button>

          <div class="px-8 pt-8 pb-6 text-center">
            <div class="flex justify-center gap-1.5 mb-6" aria-hidden="true">
              <For each={STEPS}>
                {(_, i) => (
                  <div
                    class="w-1.5 h-1.5 rounded-full transition-colors"
                    style={{
                      background:
                        i() <= step() ? 'var(--color-accent)' : 'var(--color-border-secondary)',
                      'transition-duration': 'var(--duration-normal)',
                    }}
                  />
                )}
              </For>
            </div>

            <div
              class="mx-auto w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{ background: 'var(--color-accent-muted)' }}
            >
              {(() => {
                const Icon = current().icon;
                return <Icon size={28} />;
              })()}
            </div>

            <h2 id="onboarding-title" class="text-lg font-semibold text-text-primary mb-2">
              {current().title}
            </h2>
            <p class="text-xs text-text-secondary leading-relaxed max-w-[320px] mx-auto">
              {current().description}
            </p>

            <Show when={current().action}>
              {(action) => (
                <button
                  type="button"
                  class="mt-4 px-4 py-2 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-primary)',
                    color: 'var(--color-text-primary)',
                    'transition-duration': 'var(--duration-normal)',
                  }}
                  onClick={action().onClick}
                >
                  {action().label}
                </button>
              )}
            </Show>
          </div>

          <div
            class="flex items-center justify-between px-6 py-3"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <button
              type="button"
              class="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={finish}
            >
              Skip all
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-bg-primary)',
                'transition-duration': 'var(--duration-normal)',
              }}
              onClick={next}
            >
              <span>{step() >= STEPS.length - 1 ? 'Get Started' : 'Next'}</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default OnboardingFlow;
