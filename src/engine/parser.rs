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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_repl_code_block() {
        let input = "Let me check.\n```repl\nprint(len(context))\n```\n";
        let parsed = parse_response(input);
        assert_eq!(parsed.code_blocks, vec!["print(len(context))"]);
        assert!(parsed.final_answer.is_none());
    }

    #[test]
    fn multiple_code_blocks() {
        let input = "Step 1:\n```repl\nx = 1\n```\nStep 2:\n```repl\ny = x + 1\n```\n";
        let parsed = parse_response(input);
        assert_eq!(parsed.code_blocks.len(), 2);
        assert_eq!(parsed.code_blocks[0], "x = 1");
        assert_eq!(parsed.code_blocks[1], "y = x + 1");
    }

    #[test]
    fn final_literal_answer() {
        let input = "After analysis, the answer is:\nFINAL(42)";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::Literal("42".to_string()))
        );
    }

    #[test]
    fn final_var_answer() {
        let input = "The result is stored.\nFINAL_VAR(result_dict)";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::VarName("result_dict".to_string()))
        );
    }

    #[test]
    fn nested_parentheses_in_final() {
        let input = "FINAL(func(x, y))";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::Literal("func(x, y)".to_string()))
        );
    }

    #[test]
    fn deeply_nested_parentheses() {
        let input = "FINAL(a(b(c(d))))";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::Literal("a(b(c(d)))".to_string()))
        );
    }

    #[test]
    fn no_markers_reasoning_only() {
        let input = "This is just reasoning text.\nNo code or final markers here.";
        let parsed = parse_response(input);
        assert!(parsed.code_blocks.is_empty());
        assert!(parsed.final_answer.is_none());
        assert_eq!(
            parsed.reasoning,
            "This is just reasoning text.\nNo code or final markers here."
        );
    }

    #[test]
    fn mixed_reasoning_code_final() {
        let input = "I'll analyze the data.\n```repl\ntotal = sum(data)\nprint(total)\n```\nThe total is computed.\nFINAL(42)";
        let parsed = parse_response(input);
        assert_eq!(parsed.code_blocks, vec!["total = sum(data)\nprint(total)"]);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::Literal("42".to_string()))
        );
        assert!(parsed.reasoning.contains("I'll analyze the data."));
        assert!(parsed.reasoning.contains("The total is computed."));
        assert!(!parsed.reasoning.contains("sum(data)"));
        assert!(!parsed.reasoning.contains("FINAL("));
    }

    #[test]
    fn empty_input() {
        let parsed = parse_response("");
        assert!(parsed.code_blocks.is_empty());
        assert!(parsed.final_answer.is_none());
        assert_eq!(parsed.reasoning, "");
    }

    #[test]
    fn non_repl_code_block_not_extracted() {
        let input = "Here's some Python:\n```python\nprint('hello')\n```\n";
        let parsed = parse_response(input);
        assert!(parsed.code_blocks.is_empty());
        assert!(parsed.reasoning.contains("```python"));
    }

    #[test]
    fn final_after_code_blocks() {
        let input = "```repl\nresult = analyze(data)\n```\n\n```repl\nsummary = summarize(result)\n```\n\nFINAL_VAR(summary)";
        let parsed = parse_response(input);
        assert_eq!(parsed.code_blocks.len(), 2);
        assert_eq!(parsed.code_blocks[0], "result = analyze(data)");
        assert_eq!(parsed.code_blocks[1], "summary = summarize(result)");
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::VarName("summary".to_string()))
        );
    }

    #[test]
    fn only_first_final_used() {
        let input = "FINAL(first answer)\nFINAL(second answer)";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::Literal("first answer".to_string()))
        );
    }

    #[test]
    fn final_var_before_final() {
        let input = "FINAL_VAR(my_var)\nFINAL(literal)";
        let parsed = parse_response(input);
        assert_eq!(
            parsed.final_answer,
            Some(FinalAnswer::VarName("my_var".to_string()))
        );
    }

    #[test]
    fn unclosed_final_paren_ignored() {
        let input = "FINAL(unclosed paren";
        let parsed = parse_response(input);
        assert!(parsed.final_answer.is_none());
    }

    #[test]
    fn whitespace_only_code_block_not_extracted() {
        let input = "```repl\n   \n```\n";
        let parsed = parse_response(input);
        assert!(parsed.code_blocks.is_empty());
    }

    #[test]
    fn reasoning_trimmed() {
        let input = "  \n\n  Some reasoning  \n\n  ";
        let parsed = parse_response(input);
        assert_eq!(parsed.reasoning, "Some reasoning");
    }
}
