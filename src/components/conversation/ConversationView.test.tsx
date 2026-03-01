import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

let mockMessages: Message[] = [];
let mockIsLoading = false;
let mockIsStreaming = false;
let mockError: string | null = null;
let mockThinkingContent = '';
let mockLastUserMessage = '';
let mockActiveSessionId: string | null = 'session-1';
let mockSessions: Array<{ id: string; total_cost_cents: number | null }> = [];
let mockCliDetected = true;
let mockActiveProjectId: string | null = null;
let mockProjects: Array<{ id: string; name: string }> = [];
let mockTypewriterRendered = '';
let mockMessageSearchVisible = false;

const mockSendMessage = vi.fn();
const mockRetryLastMessage = vi.fn();
const mockPickAndCreateProject = vi.fn(() => Promise.resolve());
const mockCloseMessageSearch = vi.fn();
const mockShouldShowResumeCard = vi.fn((_sessionId: string, _messageCount: number) => false);
const mockDismissResume = vi.fn((_sessionId: string) => undefined);
const mockGetSessionLastActiveAt = vi.fn((_sessionId: string) => null as number | null);

vi.mock('@tanstack/solid-virtual', () => ({
  createVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get messages() {
      return mockMessages;
    },
    get isLoading() {
      return mockIsLoading;
    },
    get isStreaming() {
      return mockIsStreaming;
    },
    get error() {
      return mockError;
    },
    get thinkingContent() {
      return mockThinkingContent;
    },
    get lastUserMessage() {
      return mockLastUserMessage;
    },
  },
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  retryLastMessage: (...args: unknown[]) => mockRetryLastMessage(...args),
  editMessage: vi.fn(),
  regenerateResponse: vi.fn(),
  typewriter: {
    rendered: () => mockTypewriterRendered,
  },
}));

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get activeSessionId() {
      return mockActiveSessionId;
    },
    get sessions() {
      return mockSessions;
    },
  },
  shouldShowResumeCard: (sessionId: string, messageCount: number) =>
    mockShouldShowResumeCard(sessionId, messageCount),
  dismissResume: (sessionId: string) => mockDismissResume(sessionId),
  getSessionLastActiveAt: (sessionId: string) => mockGetSessionLastActiveAt(sessionId),
  forkSession: vi.fn(),
  setActiveSession: vi.fn(),
}));

vi.mock('@/stores/cliStore', () => ({
  cliState: {
    get isDetected() {
      return mockCliDetected;
    },
  },
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return mockActiveProjectId;
    },
    get projects() {
      return mockProjects;
    },
  },
  pickAndCreateProject: () => mockPickAndCreateProject(),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get messageSearchVisible() {
      return mockMessageSearchVisible;
    },
  },
  closeMessageSearch: (...args: unknown[]) => mockCloseMessageSearch(...args),
}));

vi.mock('./MessageBubble', () => ({
  default: (props: { message: Message }) => (
    <div data-testid="message-bubble">{props.message.content}</div>
  ),
}));
vi.mock('./MarkdownContent', () => ({
  default: (props: { content: string }) => <div data-testid="markdown">{props.content}</div>,
}));
vi.mock('./ToolUseBlock', () => ({ ToolUseBlock: () => <div data-testid="tool-use" /> }));
vi.mock('./ToolResultBlock', () => ({ ToolResultBlock: () => <div data-testid="tool-result" /> }));
vi.mock('./ThinkingBlock', () => ({ ThinkingBlock: () => <div data-testid="thinking-block" /> }));
vi.mock('./StreamingThinkingBlock', () => ({
  StreamingThinkingBlock: (props: { content: string }) => (
    <div data-testid="streaming-thinking">{props.content}</div>
  ),
}));
vi.mock('./PermissionRecordBlock', () => ({
  PermissionRecordBlock: () => <div data-testid="permission-record" />,
}));

import ConversationView from './ConversationView';

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'm-1',
    session_id: 'session-1',
    role: 'assistant',
    content: 'Assistant reply',
    model: 'claude-sonnet-4-6',
    input_tokens: 10,
    output_tokens: 5,
    thinking_tokens: null,
    cost_cents: 2,
    is_compacted: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ConversationView', () => {
  beforeEach(() => {
    mockMessages = [];
    mockIsLoading = false;
    mockIsStreaming = false;
    mockError = null;
    mockThinkingContent = '';
    mockLastUserMessage = '';
    mockActiveSessionId = 'session-1';
    mockSessions = [{ id: 'session-1', total_cost_cents: 123 }];
    mockCliDetected = true;
    mockActiveProjectId = null;
    mockProjects = [];
    mockTypewriterRendered = '';
    mockMessageSearchVisible = false;
    mockSendMessage.mockClear();
    mockRetryLastMessage.mockClear();
    mockPickAndCreateProject.mockClear();
    mockCloseMessageSearch.mockClear();
    mockShouldShowResumeCard.mockReset();
    mockShouldShowResumeCard.mockReturnValue(false);
    mockDismissResume.mockClear();
    mockGetSessionLastActiveAt.mockReset();
    mockGetSessionLastActiveAt.mockReturnValue(null);
    if (!HTMLElement.prototype.scrollTo) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: () => {},
      });
    }
  });

  it('renders empty state with project CTA and sample prompts', () => {
    render(() => <ConversationView />);
    expect(screen.getByText('Open a Project Folder')).toBeInTheDocument();
    expect(screen.getByText('conversation.emptyTitle')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
  });

  it('opens project picker from empty-state CTA', () => {
    render(() => <ConversationView />);
    fireEvent.click(screen.getByRole('button', { name: /Open a Project Folder/i }));
    expect(mockPickAndCreateProject).toHaveBeenCalled();
  });

  it('sends sample prompt using active session', () => {
    render(() => <ConversationView />);
    fireEvent.click(screen.getByRole('button', { name: /conversation\.sampleExplain/ }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.any(String), 'session-1');
  });

  it('shows CLI-not-found guidance when CLI is unavailable', () => {
    mockCliDetected = false;
    render(() => <ConversationView />);
    expect(screen.getByText('conversation.cliNotFoundTitle')).toBeInTheDocument();
    expect(screen.getByText(/npm install -g @anthropic-ai\/claude-code/)).toBeInTheDocument();
  });

  it('renders messages and shows retry action for conversation error', () => {
    mockMessages = [
      makeMessage({
        id: 'u1',
        role: 'user',
        content: 'Hello',
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'Hi there' }),
    ];
    mockError = 'Connection failed';
    mockLastUserMessage = 'Hello';

    render(() => <ConversationView />);

    expect(screen.getAllByTestId('message-bubble')).toHaveLength(2);
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(mockRetryLastMessage).toHaveBeenCalledWith('session-1');
  });

  it('hides successful TodoWrite tool_result echoes to avoid duplicate status rows', () => {
    mockMessages = [
      makeMessage({
        id: 'todo-use-1',
        role: 'tool_use',
        content: JSON.stringify({
          tool_name: 'TodoWrite',
          tool_use_id: 'todo-1',
          tool_input: JSON.stringify({ todos: [] }),
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({
        id: 'todo-result-1',
        role: 'tool_result',
        content: JSON.stringify({
          tool_use_id: 'todo-1',
          content:
            'Todos have been modified successfully. Ensure that you continue to use the todo list.',
          is_error: false,
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({
        id: 'todo-use-2',
        role: 'tool_use',
        content: JSON.stringify({
          tool_name: 'TodoWrite',
          tool_use_id: 'todo-2',
          tool_input: JSON.stringify({ todos: [] }),
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({
        id: 'todo-result-2',
        role: 'tool_result',
        content: JSON.stringify({
          tool_use_id: 'todo-2',
          content:
            'Todos have been modified successfully. Ensure that you continue to use the todo list.',
          is_error: false,
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
    ];

    render(() => <ConversationView />);

    expect(screen.getAllByTestId('tool-use')).toHaveLength(2);
    expect(screen.queryByTestId('tool-result')).not.toBeInTheDocument();
  });

  it('still renders tool_result for non-TodoWrite tools', () => {
    mockMessages = [
      makeMessage({
        id: 'bash-use',
        role: 'tool_use',
        content: JSON.stringify({
          tool_name: 'Bash',
          tool_use_id: 'bash-1',
          tool_input: JSON.stringify({ command: 'echo ok' }),
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({
        id: 'bash-result',
        role: 'tool_result',
        content: JSON.stringify({
          tool_use_id: 'bash-1',
          content: 'ok',
          is_error: false,
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
    ];

    render(() => <ConversationView />);

    expect(screen.getByTestId('tool-result')).toBeInTheDocument();
  });

  it('still renders TodoWrite tool_result when it is an error', () => {
    mockMessages = [
      makeMessage({
        id: 'todo-use-err',
        role: 'tool_use',
        content: JSON.stringify({
          tool_name: 'TodoWrite',
          tool_use_id: 'todo-err',
          tool_input: JSON.stringify({ todos: [] }),
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
      makeMessage({
        id: 'todo-result-err',
        role: 'tool_result',
        content: JSON.stringify({
          tool_use_id: 'todo-err',
          content: 'Failed to update todos',
          is_error: true,
        }),
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }),
    ];

    render(() => <ConversationView />);

    expect(screen.getByTestId('tool-result')).toBeInTheDocument();
  });
});
