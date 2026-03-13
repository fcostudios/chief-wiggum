//! Terminal session data types (CHI-332).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TerminalStatus {
    Running,
    Exited,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalSession {
    pub terminal_id: String,
    pub shell: String,
    pub cwd: String,
    pub status: TerminalStatus,
    pub exit_code: Option<i32>,
    pub title: Option<String>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::TerminalStatus;

    #[test]
    fn terminal_status_serializes_in_snake_case() {
        let json = serde_json::to_string(&TerminalStatus::Running).expect("serialize status");
        assert_eq!(json, "\"running\"");
    }
}
