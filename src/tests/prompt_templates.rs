use crate::prompt::templates::{list_templates, load_template, TemplateSource};

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
