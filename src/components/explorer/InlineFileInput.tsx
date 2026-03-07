import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { File, Folder } from 'lucide-solid';
import { t } from '@/stores/i18nStore';

interface InlineFileInputProps {
  parentPath: string;
  type: 'file' | 'folder';
  depth: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const INVALID_CHARS = /[<>:"|?*\0]/;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-4]|LPT[1-4])(\.|$)/i;

const InlineFileInput: Component<InlineFileInputProps> = (props) => {
  const [value, setValue] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  const validationError = createMemo(() => {
    const text = value().trim();
    if (!text) return null;
    if (text.includes('..')) return t('files.outsideProject');

    const parts = text.split('/').filter(Boolean);
    for (const part of parts) {
      if (INVALID_CHARS.test(part)) return t('files.invalidChar');
      if (RESERVED_NAMES.test(part)) return t('files.reservedName');
    }
    return null;
  });

  const isValid = createMemo(() => value().trim().length > 0 && !validationError());
  const fullPath = createMemo(() => {
    const trimmed = value().trim();
    if (!trimmed) return '';
    return props.parentPath ? `${props.parentPath}/${trimmed}` : trimmed;
  });

  function handleConfirm(): void {
    if (!isValid()) return;
    props.onConfirm(value().trim());
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
    inputRef?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!inputRef) return;
      if (!inputRef.contains(event.target as Node)) {
        props.onCancel();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    onCleanup(() => document.removeEventListener('mousedown', handlePointerDown, true));
  });

  return (
    <div
      class="flex items-start gap-1.5 py-1"
      style={{ 'padding-left': `${props.depth * 12 + 4}px` }}
    >
      <Show
        when={props.type === 'folder'}
        fallback={
          <File
            size={13}
            class="shrink-0 mt-[2px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          />
        }
      >
        <Folder
          size={13}
          class="shrink-0 mt-[2px]"
          style={{ color: 'var(--color-text-tertiary)' }}
        />
      </Show>
      <div class="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          class="w-full rounded px-1.5 py-1 text-xs outline-none"
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
          placeholder={props.type === 'folder' ? t('files.newFolder') : t('files.newFile')}
          onInput={(event) => setValue(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!value().trim()) props.onCancel();
          }}
        />
        {value().includes('/') && fullPath() && (
          <div class="text-[10px] mt-0.5 text-text-tertiary truncate">
            {t('files.willCreate', { path: fullPath() })}
          </div>
        )}
        {validationError() && <div class="text-[10px] mt-0.5 text-error">{validationError()}</div>}
      </div>
    </div>
  );
};

export default InlineFileInput;
