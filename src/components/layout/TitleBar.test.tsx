import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

let mockProjectName: string | null = 'chief-wiggum';
let mockCliDetected = true;
let mockPermissionRequest: object | null = null;
let mockProcessStatus: string = 'not_started';
let mockIsStreaming = false;

const mockOpenSettings = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get permissionRequest() {
      return mockPermissionRequest;
    },
  },
  openSettings: () => mockOpenSettings(),
  openChangelog: vi.fn(),
  openAbout: vi.fn(),
}));

vi.mock('@/stores/cliStore', () => ({
  cliState: {
    get isDetected() {
      return mockCliDetected;
    },
  },
}));

vi.mock('@/stores/projectStore', () => ({
  getActiveProject: () =>
    mockProjectName
      ? {
          id: 'proj-1',
          name: mockProjectName,
          path: '/tmp/chief-wiggum',
          default_model: null,
          default_effort: null,
          created_at: null,
          last_opened_at: null,
        }
      : undefined,
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

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => {
    if (key === 'titlebar.project_none') return 'No Project';
    if (key === 'status.responding') return 'Responding…';
    if (key === 'status.permission_needed') return 'Permission needed';
    if (key === 'status.cli_not_found') return 'CLI not found';
    return key;
  },
}));

vi.mock('@/components/common/ModelSelector', () => ({
  default: (props: {
    statusText?: string | null;
    showModelWhenStatus?: boolean;
    statusPulse?: boolean;
  }) => (
    <div
      data-testid="model-selector"
      data-status={props.statusText ?? ''}
      data-show-model={props.showModelWhenStatus ? 'true' : 'false'}
      data-pulse={props.statusPulse ? 'true' : 'false'}
    >
      ModelSelector
    </div>
  ),
}));
vi.mock('@/components/common/HelpMenu', () => ({
  default: () => <div data-testid="help-menu">HelpMenu</div>,
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
    mockProjectName = 'chief-wiggum';
    mockCliDetected = true;
    mockPermissionRequest = null;
    mockProcessStatus = 'not_started';
    mockIsStreaming = false;
    mockOpenSettings.mockClear();
  });

  it('renders centered project context and model selector', () => {
    render(() => <TitleBar />);
    expect(screen.getByText('chief-wiggum')).toBeInTheDocument();
    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
  });

  it('renders fallback project label when no project is active', () => {
    mockProjectName = null;
    render(() => <TitleBar />);
    expect(screen.getByText('No Project')).toBeInTheDocument();
  });

  it('forwards responding state to model status chip', () => {
    mockProcessStatus = 'running';
    render(() => <TitleBar />);
    const selector = screen.getByTestId('model-selector');
    expect(selector).toHaveAttribute('data-status', 'Responding…');
    expect(selector).toHaveAttribute('data-show-model', 'true');
    expect(selector).toHaveAttribute('data-pulse', 'true');
  });

  it('forwards permission-needed state to model status chip', () => {
    mockPermissionRequest = { request_id: 'req-1' };
    render(() => <TitleBar />);
    const selector = screen.getByTestId('model-selector');
    expect(selector).toHaveAttribute('data-status', 'Permission needed');
    expect(selector).toHaveAttribute('data-show-model', 'true');
  });

  it('settings gear button opens settings', () => {
    render(() => <TitleBar />);
    fireEvent.click(screen.getByLabelText('Open settings'));
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('renders drag regions for native window movement', () => {
    render(() => <TitleBar />);
    expect(document.querySelector('[data-tauri-drag-region]')).toBeTruthy();
  });

  it('keeps titlebar above conversation overlays for selector popovers', () => {
    render(() => <TitleBar />);
    const header = screen.getByLabelText('Open settings').closest('header');
    expect(header).toHaveStyle({ 'z-index': '20' });
  });
});
