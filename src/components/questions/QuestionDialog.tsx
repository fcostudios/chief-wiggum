import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { MessageCircleQuestion } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { dismissQuestionDialog } from '@/stores/uiStore';
import { t } from '@/stores/i18nStore';
import type { QuestionRequest } from '@/lib/types';

const TIMEOUT_SECONDS = 60;

interface QuestionDialogProps {
  request: QuestionRequest;
}

function parseMultiValue(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const QuestionDialog: Component<QuestionDialogProps> = (props) => {
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const [otherText, setOtherText] = createSignal<Record<string, string>>({});
  const [otherEnabled, setOtherEnabled] = createSignal<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = createSignal(TIMEOUT_SECONDS);
  let dialogRef: HTMLDivElement | undefined;

  const isValid = createMemo(() => {
    for (const question of props.request.questions) {
      if (question.multiSelect) continue;
      const value = answers()[question.question];
      if (!value || !value.trim()) return false;
    }
    return true;
  });

  async function sendResponse(responseAnswers: Record<string, string>): Promise<void> {
    await invoke('respond_question', {
      session_id: props.request.session_id,
      request_id: props.request.request_id,
      answers: responseAnswers,
      original_questions: props.request.questions,
    });
  }

  async function handleSubmit(): Promise<void> {
    const finalAnswers = { ...answers() };
    for (const question of props.request.questions) {
      if (question.multiSelect) continue;
      if (!finalAnswers[question.question]?.trim()) {
        finalAnswers[question.question] = question.options[0]?.label ?? t('questionDialog.defaultAnswer');
      }
    }

    try {
      await sendResponse(finalAnswers);
    } catch (err) {
      console.warn('[QuestionDialog] Failed to respond_question:', err);
    } finally {
      dismissQuestionDialog();
    }
  }

  function handleCancel(): void {
    void sendResponse({}).finally(() => dismissQuestionDialog());
  }

  function handleSingleSelect(questionKey: string, label: string): void {
    setAnswers((prev) => ({ ...prev, [questionKey]: label }));
    setOtherEnabled((prev) => ({ ...prev, [questionKey]: false }));
  }

  function handleMultiToggle(questionKey: string, label: string): void {
    setAnswers((prev) => {
      const values = parseMultiValue(prev[questionKey]);
      const idx = values.indexOf(label);
      if (idx >= 0) values.splice(idx, 1);
      else values.push(label);
      return { ...prev, [questionKey]: values.join(', ') };
    });
  }

  function handleOtherToggle(questionKey: string, multiSelect: boolean): void {
    const currentlyEnabled = !!otherEnabled()[questionKey];
    const nextEnabled = !currentlyEnabled;
    setOtherEnabled((prev) => ({ ...prev, [questionKey]: nextEnabled }));

    const text = (otherText()[questionKey] ?? '').trim();
    if (multiSelect) {
      setAnswers((prev) => {
        const values = parseMultiValue(prev[questionKey]);
        const withoutText = values.filter((v) => v !== text);
        if (nextEnabled && text) withoutText.push(text);
        return { ...prev, [questionKey]: withoutText.join(', ') };
      });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [questionKey]: nextEnabled ? text : '',
    }));
  }

  function handleOtherTextChange(questionKey: string, multiSelect: boolean, value: string): void {
    setOtherText((prev) => ({ ...prev, [questionKey]: value }));
    if (!otherEnabled()[questionKey]) return;

    if (multiSelect) {
      setAnswers((prev) => {
        const oldText = (otherText()[questionKey] ?? '').trim();
        const values = parseMultiValue(prev[questionKey]).filter((v) => v !== oldText);
        if (value.trim()) values.push(value.trim());
        return { ...prev, [questionKey]: values.join(', ') };
      });
      return;
    }

    setAnswers((prev) => ({ ...prev, [questionKey]: value.trim() }));
  }

  function handleDialogKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
      return;
    }
    if (event.key === 'Enter' && isValid()) {
      const target = event.target as HTMLElement;
      if (target?.tagName.toLowerCase() !== 'textarea') {
        event.preventDefault();
        void handleSubmit();
      }
    }
  }

  onMount(() => {
    const initialAnswers: Record<string, string> = {};
    for (const question of props.request.questions) {
      if (!question.multiSelect && question.options.length > 0) {
        initialAnswers[question.question] = question.options[0].label;
      }
    }
    setAnswers(initialAnswers);

    dialogRef?.focus();
  });

  const timer = setInterval(() => {
    setSecondsLeft((prev) => {
      if (prev <= 1) {
        void handleSubmit();
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  onCleanup(() => clearInterval(timer));

  return (
    <div
      class="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div
        ref={dialogRef}
        class="w-full max-w-[560px] max-h-[90vh] rounded-lg overflow-hidden border border-border-primary bg-bg-elevated shadow-md flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={t('questionDialog.title')}
        tabindex="-1"
        onKeyDown={handleDialogKeyDown}
      >
        <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-secondary bg-bg-secondary">
          <div class="flex items-center gap-2">
            <MessageCircleQuestion size={16} color="#a371f7" />
            <h3 class="text-sm font-semibold text-text-primary">{t('questionDialog.title')}</h3>
          </div>
          <span class="text-xs font-mono text-text-tertiary">{secondsLeft()}s</span>
        </div>

        <div class="px-5 py-4 overflow-y-auto space-y-4 min-h-0">
          <For each={props.request.questions}>
            {(question) => (
              <section class="rounded-md border border-border-secondary bg-bg-primary/40">
                <div class="px-3 py-2 border-b border-border-secondary text-[10px] tracking-wide uppercase text-[#a371f7]">
                  {question.header}
                </div>
                <div class="px-3 py-3">
                  <p class="text-xs text-text-primary mb-3">{question.question}</p>
                  <div class="space-y-2">
                    <For each={question.options}>
                      {(option) => (
                        <label class="flex items-start gap-2 text-xs text-text-primary">
                          <Show
                            when={question.multiSelect}
                            fallback={
                              <input
                                type="radio"
                                name={question.question}
                                checked={
                                  !otherEnabled()[question.question] &&
                                  answers()[question.question] === option.label
                                }
                                onChange={() => handleSingleSelect(question.question, option.label)}
                              />
                            }
                          >
                            <input
                              type="checkbox"
                              checked={parseMultiValue(answers()[question.question]).includes(option.label)}
                              onChange={() => handleMultiToggle(question.question, option.label)}
                            />
                          </Show>
                          <span>
                            <span class="font-medium">{option.label}</span>
                            <Show when={option.description}>
                              <span class="text-text-tertiary"> - {option.description}</span>
                            </Show>
                          </span>
                        </label>
                      )}
                    </For>

                    <label class="flex items-start gap-2 text-xs text-text-primary">
                      <Show
                        when={question.multiSelect}
                        fallback={
                          <input
                            type="radio"
                            name={question.question}
                            checked={otherEnabled()[question.question] === true}
                            onChange={() => handleOtherToggle(question.question, false)}
                          />
                        }
                      >
                        <input
                          type="checkbox"
                          checked={otherEnabled()[question.question] === true}
                          onChange={() => handleOtherToggle(question.question, true)}
                        />
                      </Show>
                      <div class="flex-1">
                        <div class="font-medium">{t('questionDialog.otherLabel')}</div>
                        <input
                          type="text"
                          class="mt-1 w-full rounded px-2 py-1 text-xs border border-border-secondary bg-bg-inset text-text-primary disabled:opacity-50"
                          disabled={!otherEnabled()[question.question]}
                          value={otherText()[question.question] ?? ''}
                          placeholder={t('questionDialog.otherPlaceholder')}
                          onInput={(event) =>
                            handleOtherTextChange(
                              question.question,
                              question.multiSelect,
                              event.currentTarget.value,
                            )
                          }
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </section>
            )}
          </For>
        </div>

        <div class="px-5 py-3 border-t border-border-secondary flex items-center justify-between gap-3">
          <span class="text-xs text-text-tertiary">
            {t('questionDialog.timeoutWarning', { seconds: secondsLeft() })}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded-md text-xs border border-border-primary text-text-secondary hover:bg-bg-secondary"
              onClick={handleCancel}
            >
              {t('questionDialog.cancel')}
            </button>
            <button
              class="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-accent enabled:hover:bg-accent-hover disabled:opacity-50"
              disabled={!isValid()}
              onClick={() => void handleSubmit()}
            >
              {t('questionDialog.submit')}
            </button>
          </div>
        </div>

        <div class="h-1 bg-bg-inset">
          <div
            class="h-full bg-[#a371f7] transition-[width] duration-1000 linear"
            style={{ width: `${(secondsLeft() / TIMEOUT_SECONDS) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default QuestionDialog;
