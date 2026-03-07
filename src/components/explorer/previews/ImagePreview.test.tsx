import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';

const mockInvoke = vi.fn();
const mockConvertFileSrc = vi.fn((path: string) => `asset://${path}`);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...(args as [string])),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return 'proj-1';
    },
  },
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

import ImagePreview from './ImagePreview';

describe('ImagePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue('/tmp/demo/image.png');
  });

  it('resolves asset URL and renders image metadata', async () => {
    render(() => (
      <ImagePreview
        relativePath="assets/image.png"
        sizeBytes={4096}
        extension="png"
        onOpenExternal={() => {}}
      />
    ));

    expect(screen.getByText('image.png')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('resolve_file_path', {
        project_id: 'proj-1',
        relative_path: 'assets/image.png',
      });
    });

    expect(mockConvertFileSrc).toHaveBeenCalledWith('/tmp/demo/image.png');
    expect(screen.getByText(/Format: PNG/)).toBeInTheDocument();
  });
});
