use crate::types::{FinalAnswer, ParsedResponse};

/// Parse an LLM response into structured components: reasoning text,
/// repl-tagged code blocks, and an optional FINAL/FINAL_VAR marker.
pub fn parse_response(text: &str) -> ParsedResponse {
    let code_blocks = extract_code_blocks(text);
    let final_answer = extract_final_marker(text);
    let reasoning = extract_reasoning(text);

    ParsedResponse {
        reasoning,
        code_blocks,
        final_answer,
    }
}

/// Extract all fenced code blocks tagged with `repl`.
fn extract_code_blocks(text: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut lines = text.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if trimmed == "```repl" || trimmed.starts_with("```repl ") {
            let mut code = String::new();
            let mut found_end = false;
            for inner_line in lines.by_ref() {
                if inner_line.trim() == "```" {
                    found_end = true;
                    break;
                }
                if !code.is_empty() {
                    code.push('\n');
                }
                code.push_str(inner_line);
            }
            if found_end {
                let trimmed_code = code.trim().to_string();
                if !trimmed_code.is_empty() {
                    blocks.push(trimmed_code);
                }
            }
        }
    }

    blocks
}

/// Extract the first FINAL(...) or FINAL_VAR(...) marker.
fn extract_final_marker(text: &str) -> Option<FinalAnswer> {
    // Check FINAL_VAR first since FINAL is a prefix of it
    for line in text.lines() {
        let trimmed = line.trim();

        if let Some(rest) = trimmed.strip_prefix("FINAL_VAR(") {
            if let Some(content) = extract_balanced_parens(rest) {
                return Some(FinalAnswer::VarName(content.trim().to_string()));
            }
        }

        if let Some(rest) = trimmed.strip_prefix("FINAL(") {
            if let Some(content) = extract_balanced_parens(rest) {
                return Some(FinalAnswer::Literal(content.trim().to_string()));
            }
        }
    }

    // Also check for multiline FINAL — look for FINAL( at end of a line
    // (already handled above since we check each line for the prefix)

    None
}

/// Extract content with balanced parentheses, starting after the opening paren.
/// Input: "some text) more stuff" -> Some("some text")
/// Input: "func(x, y)) extra" -> Some("func(x, y)")
fn extract_balanced_parens(text: &str) -> Option<String> {
    let mut depth = 1;
    let mut end = None;

    for (i, b) in text.bytes().enumerate() {
        match b {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }

    end.map(|i| text[..i].to_string())
}

/// Extract reasoning text — everything not inside code fences or FINAL markers.
fn extract_reasoning(text: &str) -> String {
    let mut reasoning_parts = Vec::new();
    let lines = text.lines();
    let mut in_code_block = false;

    for line in lines {
        let trimmed = line.trim();

        if in_code_block {
            if trimmed == "```" {
                in_code_block = false;
            }
            continue;
        }

        if trimmed == "```repl" || trimmed.starts_with("```repl ") {
            in_code_block = true;
            continue;
        }

        // Skip FINAL/FINAL_VAR lines
        if trimmed.starts_with("FINAL(") || trimmed.starts_with("FINAL_VAR(") {
            continue;
        }

        reasoning_parts.push(line);
    }

    let result = reasoning_parts.join("\n");
    result.trim().to_string()
}
