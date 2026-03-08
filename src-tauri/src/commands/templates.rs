//! IPC commands for prompt template CRUD (CHI-259).

use crate::db::queries::{
    delete_prompt_template, increment_template_usage, insert_prompt_template,
    list_prompt_templates, update_prompt_template, PromptTemplate,
};
use crate::db::Database;
use crate::AppError;
use tauri::State;
use uuid::Uuid;

#[tauri::command(rename_all = "snake_case")]
pub fn get_prompt_templates(db: State<'_, Database>) -> Result<Vec<PromptTemplate>, AppError> {
    list_prompt_templates(&db)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_prompt_template(
    db: State<'_, Database>,
    name: String,
    content: String,
    variables: String,
) -> Result<String, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("Name cannot be empty".to_string()));
    }
    if content.trim().is_empty() {
        return Err(AppError::Validation("Content cannot be empty".to_string()));
    }
    let id = Uuid::new_v4().to_string();
    insert_prompt_template(&db, &id, &name, &content, &variables)?;
    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn edit_prompt_template(
    db: State<'_, Database>,
    id: String,
    name: String,
    content: String,
    variables: String,
) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::Validation("id cannot be empty".to_string()));
    }
    if name.trim().is_empty() {
        return Err(AppError::Validation("Name cannot be empty".to_string()));
    }
    if content.trim().is_empty() {
        return Err(AppError::Validation("Content cannot be empty".to_string()));
    }
    update_prompt_template(&db, &id, &name, &content, &variables)
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_prompt_template(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::Validation("id cannot be empty".to_string()));
    }
    delete_prompt_template(&db, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn use_prompt_template(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::Validation("id cannot be empty".to_string()));
    }
    increment_template_usage(&db, &id)
}
