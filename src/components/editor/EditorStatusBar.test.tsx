import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    editorCursorLine: 42,
    editorCursorCol: 7,
    saveStatus: 'saved',
    isDirty: false,
  },
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

import EditorStatusBar from './EditorStatusBar';

describe('EditorStatusBar', () => {
  it('renders cursor position', () => {
    render(() => <EditorStatusBar />);
    expect(screen.getByText(/42/)).toBeDefined();
    expect(screen.getByText(/7/)).toBeDefined();
  });
});
