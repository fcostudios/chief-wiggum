import type { Component } from 'solid-js';
import { createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { t } from '@/stores/i18nStore';

interface InlineRenameInputProps {
  currentName: string;
  depth: number;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const INVALID_CHARS = /[<>:"|?*\0/\\]/;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-4]|LPT[1-4])(\.|$)/i;

const InlineRenameInput: Component<InlineRenameInputProps> = (props) => {
  const [value, setValue] = createSignal(untrack(() => props.currentName));
  let inputRef: HTMLInputElement | undefined;

  const validationError = createMemo((): string | null => {
    const text = value().trim();
    if (!text) return t('files.nameEmpty');
    if (text === props.currentName) return null;
    if (INVALID_CHARS.test(text)) return t('files.invalidChar');
    if (RESERVED_NAMES.test(text)) return t('files.reservedName');
    return null;
  });

  const isValid = createMemo(() => value().trim().length > 0 && !validationError());

  function handleConfirm(): void {
    const trimmed = value().trim();
    if (trimmed === props.currentName) {
      props.onCancel();
      return;
    }
    if (!isValid()) return;
    props.onConfirm(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      handleConfirm();
    }
  }

  onMount(() => {
    if (!inputRef) return;
    inputRef.focus();

    const dotIndex = props.currentName.lastIndexOf('.');
    const selectionEnd = dotIndex > 0 ? dotIndex : props.currentName.length;
    inputRef.setSelectionRange(0, selectionEnd);

    const handlePointerDown = (event: MouseEvent) => {
      if (inputRef && !inputRef.contains(event.target as Node)) {
        props.onCancel();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', handlePointerDown, true);
    });
  });

  return (
    <div
      class="flex items-start py-0.5 pr-2"
      style={{ 'padding-left': `${props.depth * 12 + 4 + 16}px` }}
    >
      <div class="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          class="w-full rounded px-1.5 py-1 text-[11px] font-mono outline-none"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-primary)',
            border: `1px solid ${
              validationError()
                ? 'var(--color-error)'
                : isValid()
                  ? 'var(--color-success)'
                  : 'var(--color-border-primary)'
            }`,
          }}
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => props.onCancel(), 150);
          }}
          aria-label={`Rename ${props.currentName}`}
        />
        {validationError() && (
          <div class="text-[10px] mt-0.5" style={{ color: 'var(--color-error)' }}>
            {validationError()}
          </div>
        )}
      </div>
    </div>
  );
};

export default InlineRenameInput;
