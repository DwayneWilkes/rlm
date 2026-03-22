use crate::engine::mode::resolve_mode;
use crate::types::Mode;

#[test]
fn explicit_direct_passes_through() {
    let mode = resolve_mode(Mode::Direct, "a".repeat(1_000_000).as_str(), "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Direct);
}

#[test]
fn explicit_iterative_passes_through() {
    let mode = resolve_mode(Mode::Iterative, "", "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Iterative);
}

#[test]
fn auto_selects_direct_for_small_context() {
    // 1000 chars ~ 250 tokens. Claude has 200k limit. 250/200k << 0.70
    let mode = resolve_mode(Mode::Auto, &"x".repeat(1000), "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Direct);
}

#[test]
fn auto_selects_iterative_for_large_context() {
    // 600k chars ~ 150k tokens. Claude has 200k limit. 150k/200k = 0.75 >= 0.70
    let mode = resolve_mode(Mode::Auto, &"x".repeat(600_000), "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Iterative);
}

#[test]
fn auto_selects_iterative_at_threshold() {
    // For a model with 8192 limit (llama3), 70% = 5734 tokens = ~22936 chars
    let mode = resolve_mode(Mode::Auto, &"x".repeat(23000), "llama3");
    assert_eq!(mode, Mode::Iterative);
}

#[test]
fn auto_selects_direct_just_below_threshold() {
    // For llama3 (8192 limit), 69% = ~5652 tokens = ~22610 chars
    let mode = resolve_mode(Mode::Auto, &"x".repeat(22000), "llama3");
    assert_eq!(mode, Mode::Direct);
}
