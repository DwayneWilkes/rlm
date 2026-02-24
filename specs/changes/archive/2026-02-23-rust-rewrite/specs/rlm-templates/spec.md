## ADDED Requirements

### Requirement: YAML Template Loading
The template system SHALL load prompt templates from YAML files in a `templates/` directory, resolved relative to the binary or a configured path.

#### Scenario: Load template by name
- **WHEN** `--template academic-summary` is specified
- **THEN** the system loads `templates/academic-summary.yaml` and applies its settings

#### Scenario: Template not found
- **WHEN** an unknown template name is specified
- **THEN** a clear error is returned listing available templates

### Requirement: Template Schema
Each template YAML file SHALL define: `name`, `description`, `mode` (direct/iterative/auto), `systemPrompt` (optional), `inference` (optional inference overrides), and `synthesize` (optional boolean).

#### Scenario: Template with all fields
- **WHEN** a template specifies mode, systemPrompt, inference options, and synthesize: true
- **THEN** all fields are applied to the execution configuration

#### Scenario: Template with minimal fields
- **WHEN** a template only specifies name and description
- **THEN** default mode, system prompt, and inference options are used

### Requirement: Template Listing
The system SHALL provide a way to list all available templates with their names and descriptions.

#### Scenario: List templates
- **WHEN** `rlm templates` is run or `rlm_templates` tool is called
- **THEN** all templates in the templates directory are listed with name and description

### Requirement: System Prompt Builder
The prompt builder SHALL assemble the full system prompt from: base RLM prompt (paper's Appendix D), template overrides, and model-specific hints.

#### Scenario: Default system prompt
- **WHEN** no template system prompt is provided
- **THEN** the base iterative/direct prompt from the paper is used

#### Scenario: Template overrides system prompt
- **WHEN** a template specifies a custom `systemPrompt`
- **THEN** the custom prompt replaces the default base prompt

#### Scenario: Model-specific hints
- **WHEN** the config includes model hints (e.g., extra warnings for certain models)
- **THEN** the hints are appended to the system prompt

### Requirement: Built-in Templates
The system SHALL ship with at least one built-in template: `academic-summary` for summarizing academic papers.

#### Scenario: Academic summary template
- **WHEN** `--template academic-summary` is used
- **THEN** the template configures iterative mode with a paper-analysis system prompt and synthesis enabled
