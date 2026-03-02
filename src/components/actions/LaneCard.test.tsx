import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import type { CrossProjectRunningAction } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  stopAction: vi.fn(),
  restartAction: vi.fn(),
  selectAction: vi.fn(),
  setActiveView: vi.fn(),
  addToast: vi.fn(),
  getActionById: vi.fn(() => ({
    id: 'a1',
    name: 'npm run build',
    command: 'npm run build',
    working_dir: '/tmp',
    source: 'package_json',
    category: 'build',
    description: null,
    is_long_running: true,
  })),
}));

vi.mock('@/stores/actionStore', () => ({
  stopAction: mocks.stopAction,
  restartAction: mocks.restartAction,
  selectAction: mocks.selectAction,
  getActionById: mocks.getActionById,
}));

vi.mock('@/stores/uiStore', () => ({
  uiState: { actionTechnicalMode: false },
  setActiveView: mocks.setActiveView,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: mocks.addToast,
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => {
    if (key === 'actions_center.lane.elapsed') return '{duration}';
    if (key === 'actions_center.lane.stop_confirm') return 'Stop {name}?';
    return key;
  },
}));

import LaneCard from './LaneCard';

afterEach(cleanup);

const baseLane: CrossProjectRunningAction = {
  action_id: 'a1',
  project_id: 'p1',
  project_name: 'Alpha',
  action_name: 'npm run build',
  status: 'running',
  elapsed_ms: 10000,
  last_output_line: '> Compiled 5 modules',
  command: 'npm run build',
  category: 'build',
  is_long_running: true,
};

describe('LaneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('renders action name', () => {
    const { getByText } = render(() => <LaneCard lane={baseLane} onInspect={vi.fn()} />);
    expect(getByText('npm run build')).toBeTruthy();
  });

  it('shows elapsed time', () => {
    const { getByText } = render(() => <LaneCard lane={baseLane} onInspect={vi.fn()} />);
    expect(getByText('10s')).toBeTruthy();
  });

  it('calls onInspect when card body clicked', () => {
    const onInspect = vi.fn();
    const { container } = render(() => <LaneCard lane={baseLane} onInspect={onInspect} />);
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.click(card);
    expect(onInspect).toHaveBeenCalledWith('a1');
  });

  it('does not call onInspect when controls clicked', () => {
    const onInspect = vi.fn();
    const { container } = render(() => <LaneCard lane={baseLane} onInspect={onInspect} />);
    const controlBtn = container.querySelector('[data-controls] button') as HTMLElement;
    fireEvent.click(controlBtn);
    expect(onInspect).not.toHaveBeenCalled();
  });
});
