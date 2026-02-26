import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';

let mockYoloMode = false;
let mockDeveloperMode = false;
let mockDetailsPanelVisible = true;
let mockProcessStatus: string = 'not_started';
let mockIsStreaming = false;

const mockCyclePermissionTier = vi.fn();
const mockOpenSettings = vi.fn();
const mockToggleDetailsPanel = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get yoloMode() {
      return mockYoloMode;
    },
    get developerMode() {
      return mockDeveloperMode;
    },
    get detailsPanelVisible() {
      return mockDetailsPanelVisible;
    },
  },
  cyclePermissionTier: () => mockCyclePermissionTier(),
  getPermissionTier: () => 'Safe',
  openSettings: () => mockOpenSettings(),
  toggleDetailsPanel: () => mockToggleDetailsPanel(),
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get processStatus() {
      return mockProcessStatus;
    },
    get isStreaming() {
      return mockIsStreaming;
    },
  },
}));

vi.mock('@/components/common/ModelSelector', () => ({
  default: () => <div data-testid="model-selector">ModelSelector</div>,
}));

vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

import TitleBar from './TitleBar';

describe('TitleBar', () => {
  beforeEach(() => {
    mockYoloMode = false;
    mockDeveloperMode = false;
    mockDetailsPanelVisible = true;
    mockProcessStatus = 'not_started';
    mockIsStreaming = false;
    vi.clearAllMocks();
  });

  it('renders app name and model selector', () => {
    render(() => <TitleBar />);
    expect(screen.getByText('Chief Wiggum')).toBeInTheDocument();
    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
  });

  it('renders drag region container', () => {
    render(() => <TitleBar />);
    expect(document.querySelector('[data-tauri-drag-region]')).toBeTruthy();
  });

  it('settings gear button opens settings', () => {
    render(() => <TitleBar />);
    fireEvent.click(screen.getByLabelText('Open settings'));
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('details toggle button reflects state and toggles panel', () => {
    render(() => <TitleBar />);
    const toggle = screen.getByLabelText(/Hide details panel/i);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(mockToggleDetailsPanel).toHaveBeenCalled();
  });

  it('permission button cycles when idle and is disabled while agent is busy', () => {
    render(() => <TitleBar />);
    const permissionButton = screen.getByLabelText(/Permission: Safe/i);
    fireEvent.click(permissionButton);
    expect(mockCyclePermissionTier).toHaveBeenCalled();

    mockProcessStatus = 'running';
    cleanup();
    render(() => <TitleBar />);
    expect(screen.getByLabelText(/Permission: Safe/i)).toBeDisabled();
  });
});
