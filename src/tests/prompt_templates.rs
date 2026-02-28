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

#[test]
fn list_templates_no_external_dir() {
    // Passing None for external dir should still return builtins
    let templates = list_templates(None).unwrap();
    assert!(!templates.is_empty());
    // All templates should be Builtin source
    for t in &templates {
        assert_eq!(t.source, TemplateSource::Builtin);
    }
    assert!(templates.iter().any(|t| t.name == "academic-summary"));
}

#[test]
fn load_template_invalid_builtin_name_errors() {
    // No external dir, nonexistent builtin name
    let result = load_template("totally-invalid-name-xyz", None);
    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();
    assert!(err_msg.contains("not found"));
    assert!(err_msg.contains("totally-invalid-name-xyz"));
}

/// When templates_dir is set but the template isn't found there, fall back to builtin.
#[test]
fn load_template_falls_through_external_to_builtin() {
    let dir = tempfile::tempdir().unwrap();
    // Dir exists but has no "academic-summary.yaml" or "academic-summary.yml"
    let t = load_template("academic-summary", Some(dir.path())).unwrap();
    assert_eq!(t.name, "academic-summary");
    assert!(t.system_prompt.is_some());
}

/// External template with same name as builtin is skipped in list (builtin wins).
#[test]
fn list_templates_external_duplicate_name_skipped() {
    let dir = tempfile::tempdir().unwrap();
    // Create an external template with the same name as the builtin
    std::fs::write(
        dir.path().join("academic-summary-dupe.yaml"),
        "name: academic-summary\ndescription: Duplicate\nsystemPrompt: dupe\n",
    )
    .unwrap();
    // Also create a unique external template
    std::fs::write(
        dir.path().join("unique.yaml"),
        "name: unique-template\ndescription: Unique\nsystemPrompt: unique\n",
    )
    .unwrap();

    let templates = list_templates(Some(dir.path())).unwrap();
    // Should have builtin academic-summary + unique-template, NOT duplicate academic-summary
    let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(
        names.iter().filter(|&&n| n == "academic-summary").count(),
        1,
        "Should only have one academic-summary"
    );
    assert!(names.contains(&"unique-template"));
}

/// External directory with invalid YAML file is silently skipped.
#[test]
fn list_templates_invalid_yaml_skipped() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("broken.yaml"),
        "not: valid: yaml: template: {{{",
    )
    .unwrap();
    std::fs::write(
        dir.path().join("good.yaml"),
        "name: good\ndescription: A good template\n",
    )
    .unwrap();

    let templates = list_templates(Some(dir.path())).unwrap();
    // Should have builtin + good, broken is skipped
    assert!(templates.iter().any(|t| t.name == "good"));
    assert!(!templates.iter().any(|t| t.name == "broken"));
}

#[test]
fn load_template_with_yml_extension() {
    let dir = tempfile::tempdir().unwrap();
    // Use .yml extension instead of .yaml
    let path = dir.path().join("short-ext.yml");
    std::fs::write(
        &path,
        r#"
name: short-ext
description: Template with .yml extension
systemPrompt: This uses yml
"#,
    )
    .unwrap();

    let t = load_template("short-ext", Some(dir.path())).unwrap();
    assert_eq!(t.name, "short-ext");
    assert_eq!(t.description, "Template with .yml extension");
    assert_eq!(t.system_prompt.as_deref(), Some("This uses yml"));
}
