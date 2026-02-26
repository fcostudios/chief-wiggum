import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

let mockSelectedActionId: string | null = null;
let mockStatus = 'idle';
let mockOutput: Array<{ line: string; is_error: boolean }> = [];

const mockClearActionOutput = vi.fn();

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get selectedActionId() {
      return mockSelectedActionId;
    },
  },
  getActionOutput: () => mockOutput,
  getActionStatus: () => mockStatus,
  clearActionOutput: (...args: unknown[]) => mockClearActionOutput(...args),
}));

vi.mock('@/stores/conversationStore', () => ({ sendMessage: vi.fn() }));
vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get activeSessionId() {
      return null;
    },
  },
  createNewSession: vi.fn(async () => ({ id: 's-1' })),
}));
vi.mock('@/stores/uiStore', () => ({ setActiveView: vi.fn() }));
vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return null;
    },
  },
}));
vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));

import ActionOutputPanel from './ActionOutputPanel';

describe('ActionOutputPanel', () => {
  beforeEach(() => {
    mockSelectedActionId = null;
    mockStatus = 'idle';
    mockOutput = [];
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  it('shows empty state when no action is selected', () => {
    render(() => <ActionOutputPanel />);
    expect(screen.getByText(/Run an action to see output/i)).toBeInTheDocument();
  });

  it('renders selected action header, status, and output lines', () => {
    mockSelectedActionId = 'package_json:test';
    mockStatus = 'running';
    mockOutput = [{ line: 'npm test', is_error: false }];
    render(() => <ActionOutputPanel />);
    expect(screen.getByText('package_json:test')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
  });

  it('clear output button calls clearActionOutput', () => {
    mockSelectedActionId = 'package_json:test';
    mockOutput = [{ line: 'line', is_error: false }];
    render(() => <ActionOutputPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Clear output/i }));
    expect(mockClearActionOutput).toHaveBeenCalledWith('package_json:test');
  });
});
