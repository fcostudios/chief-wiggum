import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Session } from '@/lib/types';

let mockSessions: Session[] = [];
let mockActiveSessionId: string | null = null;
let mockClaudeMdContent: string | null = null;
let mockProjectId: string | null = null;
let mockSelectedPath: string | null = null;
let mockPreviewContent: string | null = null;
let mockPreviewLoading = false;
let mockFileVisible = false;
let mockSelectedActionId: string | null = null;

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get sessions() {
      return mockSessions;
    },
    get activeSessionId() {
      return mockActiveSessionId;
    },
  },
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get claudeMdContent() {
      return mockClaudeMdContent;
    },
    get activeProjectId() {
      return mockProjectId;
    },
  },
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get selectedPath() {
      return mockSelectedPath;
    },
    get previewContent() {
      return mockPreviewContent;
    },
    get isPreviewLoading() {
      return mockPreviewLoading;
    },
    get isVisible() {
      return mockFileVisible;
    },
  },
}));

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get selectedActionId() {
      return mockSelectedActionId;
    },
  },
}));

vi.mock('@/components/conversation/MarkdownContent', () => ({
  default: () => <div data-testid="markdown-project-context" />,
}));
vi.mock('@/components/explorer/FilePreview', () => ({
  default: () => <div data-testid="file-preview" />,
}));
vi.mock('@/components/actions/ActionOutputPanel', () => ({
  default: () => <div data-testid="action-output-panel" />,
}));

import DetailsPanel from './DetailsPanel';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    project_id: null,
    title: 'Session',
    model: 'claude-sonnet-4-6',
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: 2000,
    total_output_tokens: 500,
    total_cost_cents: 321,
    created_at: null,
    updated_at: null,
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

describe('DetailsPanel', () => {
  beforeEach(() => {
    mockSessions = [makeSession()];
    mockActiveSessionId = 's1';
    mockClaudeMdContent = null;
    mockProjectId = null;
    mockSelectedPath = null;
    mockPreviewContent = null;
    mockPreviewLoading = false;
    mockFileVisible = false;
    mockSelectedActionId = null;
  });

  it('renders details panel with Context and Cost sections', () => {
    render(() => <DetailsPanel />);
    expect(screen.getByLabelText('Details panel')).toBeInTheDocument();
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('displays active session token and cost summaries', () => {
    render(() => <DetailsPanel />);
    expect(screen.getByText('2.0K / 0.5K')).toBeInTheDocument();
    expect(screen.getByText('$3.21')).toBeInTheDocument();
  });

  it('shows file preview placeholder when files pane is visible but no file selected', () => {
    mockProjectId = 'p1';
    mockFileVisible = true;
    render(() => <DetailsPanel />);
    expect(screen.getByText('File Preview')).toBeInTheDocument();
    expect(screen.getByText(/Select a file from the sidebar to preview/)).toBeInTheDocument();
  });

  it('renders action output, file preview, and project context sections when data exists', () => {
    mockSelectedActionId = 'action-1';
    mockSelectedPath = 'src/main.ts';
    mockPreviewContent = 'const x = 1';
    mockFileVisible = true;
    mockProjectId = 'p1';
    mockClaudeMdContent = '# Project context';

    render(() => <DetailsPanel />);
    expect(screen.getByText('Action Output')).toBeInTheDocument();
    expect(screen.getByTestId('action-output-panel')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview')).toBeInTheDocument();
    expect(screen.getByText('Project Context')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Project Context'));
    expect(screen.getByTestId('markdown-project-context')).toBeInTheDocument();
  });
});
