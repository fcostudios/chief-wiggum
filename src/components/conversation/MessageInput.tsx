// src/components/conversation/MessageInput.tsx
// Message input per SPEC-003 §3.1.
// Auto-expanding textarea (80–300px). Enter sends, Shift+Enter newline.
// Send button with loading state. Cancel button while responding.
// Character count indicator. Disabled when no CLI bridge connected.

import type { Component } from 'solid-js';
import { createSignal, Show, onCleanup } from 'solid-js';
import { Send, Square } from 'lucide-solid';

interface MessageInputProps {
  onSend: (content: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [content, setContent] = createSignal('');
  let textareaRef: HTMLTextAreaElement | undefined;

  // Auto-resize textarea between min and max height
  function adjustHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    const scrollHeight = textareaRef.scrollHeight;
    textareaRef.style.height = `${Math.min(Math.max(scrollHeight, 80), 300)}px`;
  }

  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement;
    setContent(target.value);
    adjustHeight();
  }

  function handleSend() {
    const text = content().trim();
    if (!text || props.isLoading || props.isDisabled) return;
    props.onSend(text);
    setContent('');
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = '80px';
    }
  }

  function handleCancel() {
    props.onCancel?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Enter (without Shift) sends the message
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Cmd/Ctrl+Enter always sends (force send)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Focus textarea when component mounts
  const focusTimeout = setTimeout(() => textareaRef?.focus(), 0);
  onCleanup(() => clearTimeout(focusTimeout));

  const charCount = () => content().length;
  const canSend = () => content().trim().length > 0 && !props.isLoading && !props.isDisabled;

  return (
    <div
      class={`border-t border-border-primary bg-bg-secondary px-4 py-3 ${
        props.isDisabled ? 'opacity-50' : ''
      }`}
    >
      {/* Textarea */}
      <div class="relative">
        <textarea
          ref={textareaRef}
          class="w-full resize-none rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-md text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none font-ui"
          style={{ 'min-height': '80px', 'max-height': '300px' }}
          placeholder={props.isDisabled ? 'No CLI bridge connected' : 'Type your message...'}
          disabled={props.isDisabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Message input"
        />
      </div>

      {/* Footer: character count + buttons */}
      <div class="flex items-center justify-between mt-2">
        {/* Left: character count */}
        <span class="text-xs text-text-tertiary font-mono">
          <Show when={charCount() > 0}>{charCount()} chars</Show>
        </span>

        {/* Right: action buttons */}
        <div class="flex items-center gap-2">
          <Show when={props.isLoading}>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-error bg-error-muted hover:bg-error/20 transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={handleCancel}
              aria-label="Cancel response"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          </Show>

          <button
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              canSend()
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
            }`}
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleSend}
            disabled={!canSend()}
            aria-label="Send message"
          >
            <Send size={12} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
