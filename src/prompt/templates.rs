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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_builtin_academic_summary() {
        let t = load_template("academic-summary", None).unwrap();
        assert_eq!(t.name, "academic-summary");
        assert!(t.description.contains("PhD"));
        assert!(t.system_prompt.is_some());
        assert!(t.system_prompt.unwrap().contains("research analyst"));
        assert_eq!(t.inference.as_ref().unwrap().temperature, Some(0.3));
    }

    #[test]
    fn load_nonexistent_template_errors() {
        let result = load_template("nonexistent", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn load_template_from_external_dir() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("custom.yaml");
        std::fs::write(
            &path,
            r#"
name: custom
description: A custom template
systemPrompt: Custom prompt text
"#,
        )
        .unwrap();

        let t = load_template("custom", Some(dir.path())).unwrap();
        assert_eq!(t.name, "custom");
        assert_eq!(t.system_prompt.as_deref(), Some("Custom prompt text"));
    }

    #[test]
    fn external_template_overrides_builtin() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("academic-summary.yaml");
        std::fs::write(
            &path,
            r#"
name: academic-summary
description: Overridden template
systemPrompt: Custom override
"#,
        )
        .unwrap();

        let t = load_template("academic-summary", Some(dir.path())).unwrap();
        assert_eq!(t.description, "Overridden template");
    }

    #[test]
    fn list_templates_includes_builtins() {
        let templates = list_templates(None).unwrap();
        assert!(!templates.is_empty());
        assert!(templates.iter().any(|t| t.name == "academic-summary"));
        assert_eq!(templates[0].source, TemplateSource::Builtin);
    }

    #[test]
    fn list_templates_includes_external() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("code-review.yaml"),
            r#"
name: code-review
description: Code review template
systemPrompt: Review this code
"#,
        )
        .unwrap();

        let templates = list_templates(Some(dir.path())).unwrap();
        assert!(templates.iter().any(|t| t.name == "academic-summary"));
        assert!(templates.iter().any(|t| t.name == "code-review"));
    }

    #[test]
    fn list_templates_sorted_by_name() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("zebra.yaml"),
            "name: zebra\ndescription: Z template\nsystemPrompt: z\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("alpha.yaml"),
            "name: alpha\ndescription: A template\nsystemPrompt: a\n",
        )
        .unwrap();

        let templates = list_templates(Some(dir.path())).unwrap();
        let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
        // Should be alphabetical: academic-summary, alpha, zebra
        assert_eq!(names, vec!["academic-summary", "alpha", "zebra"]);
    }

    #[test]
    fn minimal_template_loads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("minimal.yaml"),
            "name: minimal\ndescription: Bare minimum\n",
        )
        .unwrap();

        let t = load_template("minimal", Some(dir.path())).unwrap();
        assert_eq!(t.name, "minimal");
        assert!(t.system_prompt.is_none());
        assert!(t.mode.is_none());
        assert!(t.inference.is_none());
    }
}
