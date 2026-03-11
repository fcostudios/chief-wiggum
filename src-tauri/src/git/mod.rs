//! Git operations module (CHI-311, Phase 4).
//! Uses git2-rs for all Git operations — no shell spawning.

pub mod branches;
pub mod commit;
pub mod diff;
pub mod log;
pub mod repository;
pub mod staging;
pub mod status;
