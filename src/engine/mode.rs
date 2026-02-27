use crate::types::{estimate_tokens, model_context_limit, Mode};

/// Threshold: if context uses less than this fraction of the model's
/// context window, direct mode is selected.
const AUTO_DIRECT_THRESHOLD: f64 = 0.70;

/// Resolve the execution mode. Explicit modes pass through; Auto selects
/// based on context size relative to the model's context window.
pub fn resolve_mode(mode: Mode, context: &str, model: &str) -> Mode {
    match mode {
        Mode::Direct | Mode::Iterative => mode,
        Mode::Auto => {
            let tokens = estimate_tokens(context);
            let limit = model_context_limit(model);
            let ratio = tokens as f64 / limit as f64;
            if ratio < AUTO_DIRECT_THRESHOLD {
                Mode::Direct
            } else {
                Mode::Iterative
            }
        }
    }
}
