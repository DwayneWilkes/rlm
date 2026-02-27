use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::types::PromptTemplate;

/// Built-in academic-summary template (compiled into the binary).
const BUILTIN_ACADEMIC_SUMMARY: &str = include_str!("../../templates/academic-summary.yaml");

/// Info about a template for listing purposes.
#[derive(Debug, Clone)]
pub struct TemplateInfo {
    pub name: String,
    pub description: String,
    pub source: TemplateSource,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TemplateSource {
    Builtin,
    File(PathBuf),
}

/// Load a template by name. Checks external templates_dir first, then builtins.
pub fn load_template(name: &str, templates_dir: Option<&Path>) -> Result<PromptTemplate> {
    // Check external directory first
    if let Some(dir) = templates_dir {
        let path = dir.join(format!("{}.yaml", name));
        if path.is_file() {
            let contents = std::fs::read_to_string(&path)?;
            let template: PromptTemplate = serde_yaml::from_str(&contents)?;
            return Ok(template);
        }
        let path = dir.join(format!("{}.yml", name));
        if path.is_file() {
            let contents = std::fs::read_to_string(&path)?;
            let template: PromptTemplate = serde_yaml::from_str(&contents)?;
            return Ok(template);
        }
    }

    // Check builtins
    match name {
        "academic-summary" => {
            let template: PromptTemplate = serde_yaml::from_str(BUILTIN_ACADEMIC_SUMMARY)?;
            Ok(template)
        }
        _ => bail!("Template '{}' not found", name),
    }
}

/// List all available templates (builtins + external directory).
pub fn list_templates(templates_dir: Option<&Path>) -> Result<Vec<TemplateInfo>> {
    let mut templates = Vec::new();

    // Builtins
    if let Ok(t) = serde_yaml::from_str::<PromptTemplate>(BUILTIN_ACADEMIC_SUMMARY) {
        templates.push(TemplateInfo {
            name: t.name,
            description: t.description,
            source: TemplateSource::Builtin,
        });
    }

    // External directory
    if let Some(dir) = templates_dir {
        if dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().is_some_and(|e| e == "yaml" || e == "yml") {
                        if let Ok(contents) = std::fs::read_to_string(&path) {
                            if let Ok(t) = serde_yaml::from_str::<PromptTemplate>(&contents) {
                                // Skip if same name as a builtin (builtin takes precedence for listing)
                                if !templates.iter().any(|existing| existing.name == t.name) {
                                    templates.push(TemplateInfo {
                                        name: t.name,
                                        description: t.description,
                                        source: TemplateSource::File(path),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}
