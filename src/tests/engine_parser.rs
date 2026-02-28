use crate::engine::parser::parse_response;
use crate::types::FinalAnswer;

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

/// Unclosed repl code block (no closing ```) should not extract any code.
#[test]
fn unclosed_repl_code_block_not_extracted() {
    let input = "```repl\nprint('hello')\nno closing fence here";
    let parsed = parse_response(input);
    assert!(parsed.code_blocks.is_empty(), "Unclosed repl block should not be extracted");
}

/// FINAL_VAR with unclosed paren should be ignored.
#[test]
fn final_var_unclosed_paren_ignored() {
    let input = "FINAL_VAR(my_var";
    let parsed = parse_response(input);
    assert!(parsed.final_answer.is_none(), "FINAL_VAR with unclosed paren should be ignored");
}
