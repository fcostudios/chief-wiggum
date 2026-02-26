import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { UserSettings } from '@/lib/types';

let mockSaveError: string | null = null;
let mockIsLoaded = true;
let mockIsSaving = false;

const mockLoadSettings = vi.fn(async () => {});
const mockResetCategory = vi.fn();
const mockRetryPendingSettingsSave = vi.fn();
const mockUpdateSetting = vi.fn();
const mockCloseSettings = vi.fn();

const mockSettings: UserSettings = {
  version: 1,
  appearance: {
    theme: 'dark',
    font_size: 13,
    code_font_size: 12,
    sidebar_default: 'expanded',
  },
  i18n: {
    locale: 'en',
    date_format: 'relative',
    number_format: 'standard',
  },
  cli: {
    default_model: 'claude-sonnet-4-6',
    default_effort: 'high',
  },
  sessions: {
    max_concurrent: 4,
    auto_save_interval_secs: 0,
  },
  onboarding: {
    completed: false,
  },
  keybindings: {},
  privacy: {
    log_redaction_level: 'standard',
  },
  advanced: {
    cli_path_override: '',
    debug_mode: false,
    developer_mode: false,
  },
};

vi.mock('@/stores/uiStore', () => ({
  closeSettings: () => mockCloseSettings(),
}));

vi.mock('@/stores/settingsStore', () => ({
  settingsState: {
    get settings() {
      return mockSettings;
    },
    get isLoaded() {
      return mockIsLoaded;
    },
    get isSaving() {
      return mockIsSaving;
    },
    get saveError() {
      return mockSaveError;
    },
  },
  loadSettings: () => mockLoadSettings(),
  resetCategory: (...args: unknown[]) => mockResetCategory(...args),
  retryPendingSettingsSave: () => mockRetryPendingSettingsSave(),
  updateSetting: (...args: unknown[]) => mockUpdateSetting(...args),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => Promise.resolve('macos'),
}));

import SettingsModal from './SettingsModal';

describe('SettingsModal', () => {
  beforeEach(() => {
    mockSaveError = null;
    mockIsLoaded = true;
    mockIsSaving = false;
    mockLoadSettings.mockClear();
    mockResetCategory.mockClear();
    mockRetryPendingSettingsSave.mockClear();
    mockUpdateSetting.mockClear();
    mockCloseSettings.mockClear();
  });

  it('renders dialog title and search input', () => {
    render(() => <SettingsModal />);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Search settings')).toBeInTheDocument();
  });

  it('renders category navigation buttons', () => {
    render(() => <SettingsModal />);
    expect(screen.getByRole('button', { name: /Appearance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /About/i })).toBeInTheDocument();
  });

  it('changing theme select calls updateSetting', () => {
    render(() => <SettingsModal />);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    expect(mockUpdateSetting).toHaveBeenCalledWith('appearance', 'theme', 'light');
  });

  it('shows About content when About category is selected', () => {
    render(() => <SettingsModal />);
    fireEvent.click(screen.getByRole('button', { name: /About/i }));
    expect(screen.getByText(/Schema version:/i)).toBeInTheDocument();
    expect(screen.getByText(/Open settings:/i)).toBeInTheDocument();
  });

  it('Escape closes settings', async () => {
    render(() => <SettingsModal />);
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockCloseSettings).toHaveBeenCalled();
  });
});
