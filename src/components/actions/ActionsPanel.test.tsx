import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import type { ActionDefinition } from '@/lib/types';

let mockActions: ActionDefinition[] = [];
let mockIsDiscovering = false;

const mockDeleteCustomAction = vi.fn();
const mockRunActionWithArgs = vi.fn();
const mockSaveCustomAction = vi.fn();
const mockStartAction = vi.fn();

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get actions() {
      return mockActions;
    },
    get isDiscovering() {
      return mockIsDiscovering;
    },
  },
  deleteCustomAction: (...args: unknown[]) => mockDeleteCustomAction(...args),
  runActionWithArgs: (...args: unknown[]) => mockRunActionWithArgs(...args),
  saveCustomAction: (...args: unknown[]) => mockSaveCustomAction(...args),
  startAction: (...args: unknown[]) => mockStartAction(...args),
}));

vi.mock('@/stores/projectStore', () => ({
  getActiveProject: () => ({ id: 'proj-1', path: '/repo' }),
}));

vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('./ActionRow', () => ({
  default: (props: { action: ActionDefinition }) => (
    <div data-testid="action-row">{props.action.name}</div>
  ),
}));
vi.mock('./ActionEditor', () => ({ default: () => <div data-testid="action-editor" /> }));
vi.mock('./ActionArgPrompt', () => ({ default: () => <div data-testid="action-arg-prompt" /> }));

import ActionsPanel from './ActionsPanel';

function makeAction(overrides?: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: 'package_json:test',
    name: 'test',
    command: 'npm test',
    working_dir: '/repo',
    source: 'package_json',
    category: 'test',
    description: 'Run tests',
    is_long_running: false,
    ...overrides,
  };
}

describe('ActionsPanel', () => {
  beforeEach(() => {
    mockActions = [];
    mockIsDiscovering = false;
    vi.clearAllMocks();
  });

  it('renders search input and add action button', () => {
    render(() => <ActionsPanel />);
    expect(screen.getByPlaceholderText(/Filter actions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Action/i })).toBeInTheDocument();
  });

  it('shows empty state when no actions are found', () => {
    render(() => <ActionsPanel />);
    expect(screen.getByText(/No actions found/i)).toBeInTheDocument();
  });

  it('renders grouped actions when actions exist', () => {
    mockActions = [makeAction()];
    render(() => <ActionsPanel />);
    expect(screen.getByText(/npm scripts/i)).toBeInTheDocument();
    expect(screen.getByTestId('action-row')).toHaveTextContent('test');
  });
});
