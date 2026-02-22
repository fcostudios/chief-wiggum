// src/components/conversation/MessageInput.tsx
// Message input per SPEC-003 §3.1.
// Auto-expanding textarea (80–300px). Enter sends, Shift+Enter newline.
// Send button with loading state. Cancel button while responding.
// Character count indicator. Disabled when no CLI bridge connected.

import type { Component } from 'solid-js';
import { createSignal, createEffect, Show, onCleanup } from 'solid-js';
import { Send, Square } from 'lucide-solid';
import type { SlashCommand } from '@/lib/types';
import SlashCommandMenu from './SlashCommandMenu';
import {
  slashState,
  filteredCommands,
  openMenu,
  closeMenu,
  setFilter,
  highlightPrev,
  highlightNext,
  getHighlightedCommand,
} from '@/stores/slashStore';

interface MessageInputProps {
  onSend: (content: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [content, setContent] = createSignal('');
  const [isFocused, setIsFocused] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;

  // Local boolean synced with store — avoids any store proxy issues in event handlers
  let menuOpen = false;
  createEffect(() => {
    menuOpen = slashState.isOpen;
  });

  // Auto-resize textarea between min and max height
  function adjustHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    const scrollHeight = textareaRef.scrollHeight;
    textareaRef.style.height = `${Math.min(Math.max(scrollHeight, 80), 300)}px`;
  }

  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement;
    const value = target.value;
    setContent(value);
    adjustHeight();

    // Slash command detection: `/` after a space, newline, or at the start of text.
    // Extracts the slash token from the cursor backwards to the triggering `/`.
    const cursorPos = target.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);

    // Find the last `/` before the cursor that's preceded by whitespace or is at position 0
    const slashMatch = textBeforeCursor.match(/(?:^|[\s])\/([^\s/]*)$/);
    if (slashMatch) {
      const afterSlash = slashMatch[1];
      openMenu(afterSlash);
      setFilter(afterSlash);
    } else {
      if (slashState.isOpen) closeMenu();
    }
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

  function handleSlashSelect(cmd: SlashCommand) {
    if (!textareaRef) return;
    const value = textareaRef.value;
    const cursorPos = textareaRef.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    // Find the `/` that triggered the menu (last `/` preceded by whitespace or at pos 0)
    const match = textBeforeCursor.match(/(?:^|[\s])(\/[^\s/]*)$/);
    if (!match) return;
    const slashStart = textBeforeCursor.length - match[1].length;
    const replacement = `/${cmd.name}${cmd.args_hint ? ' ' : ' '}`;
    const newValue = value.slice(0, slashStart) + replacement + value.slice(cursorPos);
    setContent(newValue);
    textareaRef.value = newValue;
    const newCursorPos = slashStart + replacement.length;
    textareaRef.focus();
    textareaRef.setSelectionRange(newCursorPos, newCursorPos);
    closeMenu();
    adjustHeight();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // When slash menu is open, intercept navigation keys
    if (menuOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        highlightPrev();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        highlightNext();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const cmd = getHighlightedCommand();
        if (cmd) {
          handleSlashSelect(cmd);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const cmd = getHighlightedCommand();
        if (cmd) {
          handleSlashSelect(cmd);
        }
        return;
      }
    }

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
      class={`px-4 py-3 ${props.isDisabled ? 'opacity-50' : ''}`}
      style={{
        background:
          'linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%)',
        'border-top': '1px solid var(--color-border-secondary)',
      }}
    >
      {/* Textarea with ambient glow on focus */}
      <div class="relative max-w-4xl mx-auto">
        <SlashCommandMenu
          isOpen={slashState.isOpen}
          commands={filteredCommands()}
          highlightedIndex={slashState.highlightedIndex}
          onSelect={handleSlashSelect}
          onClose={closeMenu}
        />
        <textarea
          ref={textareaRef}
          class="w-full resize-none rounded-lg px-3 py-2.5 text-md text-text-primary placeholder:text-text-tertiary/50 font-ui focus:outline-none transition-all"
          style={{
            'min-height': '80px',
            'max-height': '300px',
            background: 'var(--color-bg-inset)',
            border: isFocused()
              ? '1px solid rgba(232, 130, 90, 0.3)'
              : '1px solid var(--color-border-secondary)',
            'box-shadow': isFocused() ? 'var(--glow-accent-subtle)' : 'none',
            'transition-duration': 'var(--duration-normal)',
          }}
          placeholder={props.isDisabled ? 'No CLI bridge connected' : 'Message Chief Wiggum...'}
          disabled={props.isDisabled}
          onInput={handleInput}
          on:keydown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            // Delay close to allow click on menu items
            setTimeout(() => {
              if (slashState.isOpen) closeMenu();
            }, 200);
          }}
          rows={1}
          aria-label="Message input"
        />
      </div>

      {/* Footer: character count + buttons */}
      <div class="flex items-center justify-between mt-2 max-w-4xl mx-auto">
        {/* Left: character count */}
        <span class="text-[10px] text-text-tertiary/40 font-mono tracking-wide">
          <Show when={charCount() > 0}>{charCount()}</Show>
        </span>

        {/* Right: action buttons */}
        <div class="flex items-center gap-2">
          <Show when={props.isLoading}>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                'transition-duration': 'var(--duration-fast)',
                color: 'var(--color-error)',
                background: 'rgba(248, 81, 73, 0.1)',
                border: '1px solid rgba(248, 81, 73, 0.2)',
              }}
              onClick={handleCancel}
              aria-label="Cancel response"
            >
              <Square size={11} />
              <span>Stop</span>
            </button>
          </Show>

          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              'transition-duration': 'var(--duration-fast)',
              background: canSend() ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: canSend() ? 'white' : 'var(--color-text-tertiary)',
              'box-shadow': canSend() ? '0 0 12px rgba(232, 130, 90, 0.2)' : 'none',
              cursor: canSend() ? 'pointer' : 'not-allowed',
            }}
            onClick={handleSend}
            disabled={!canSend()}
            aria-label="Send message"
          >
            <Send size={11} />
            <span class="tracking-wide">Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
