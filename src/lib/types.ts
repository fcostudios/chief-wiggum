// src/lib/types.ts
// TypeScript IPC types mirroring Rust types (SPEC-004 §6).
// Populated as Tauri commands are added.

/** Session status per SPEC-001 §9 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

/** Agent status per SPEC-001 §9 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'complete' | 'error';

/** Agent role per SPEC-001 §9 */
export type AgentRole = 'lead' | 'teammate' | 'background';

/** Model identifiers per SPEC-001 §3 */
export type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';

/** Message role per SPEC-001 §9 */
export type MessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'permission';

/** Permission request from CLI bridge (mirrors Rust PermissionRequest) */
export interface PermissionRequest {
  request_id: string;
  tool: string;
  command: string;
  file_path: string | null;
  risk_level: 'low' | 'medium' | 'high';
}

/** Permission response action (mirrors Rust PermissionAction) */
export type PermissionAction = 'Approve' | 'Deny' | 'AlwaysAllow';

/** Permission response sent back to backend */
export interface PermissionResponse {
  request_id: string;
  action: PermissionAction;
  pattern: string | null;
}

/** Message per SPEC-004 §6 */
export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cost_cents: number | null;
  is_compacted: boolean;
  created_at: string;
}

/** Structured data stored in tool_use message content (JSON string). */
export interface ToolUseData {
  tool_name: string;
  tool_input: string;
  tool_use_id?: string;
}

/** Structured data stored in tool_result message content (JSON string). */
export interface ToolResultData {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** Structured data stored in permission message content (JSON string). */
export interface PermissionRecordData {
  tool: string;
  command: string;
  outcome: 'allowed' | 'denied' | 'yolo';
  risk_level: string;
}

/** Tool classification category for color-coding. */
export type ToolCategory = 'file' | 'bash' | 'neutral';

/** Process lifecycle status (mirrors Rust ProcessStatus). */
export type ProcessStatus =
  | 'not_started'
  | 'starting'
  | 'running'
  | 'shutting_down'
  | 'exited'
  | 'error';

/** Session per SPEC-004 §6 — matches Rust SessionRow */
export interface Session {
  id: string;
  project_id: string | null;
  title: string | null;
  model: string;
  status: string | null;
  parent_session_id: string | null;
  context_tokens: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
  cli_session_id: string | null;
  pinned: boolean | null;
}

/** CLI location info from backend (mirrors Rust CliLocation) */
export interface CliLocation {
  path_override: string | null;
  resolved_path: string | null;
  version: string | null;
}

/** Project row from backend (mirrors Rust ProjectRow) */
export interface Project {
  id: string;
  name: string;
  path: string;
  default_model: string | null;
  default_effort: string | null;
  created_at: string | null;
  last_opened_at: string | null;
}
