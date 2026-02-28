pub mod anthropic;
pub mod cache;
pub mod claude_code;
pub mod openai;
pub mod router;

use anyhow::Result;

// ── HTTP Transport Abstraction ──────────────────────────────────────────────

/// HTTP transport abstraction for testability.
pub(crate) trait HttpTransport: Send + Sync {
    /// Send a POST request, return (status_code, response_body).
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &str) -> Result<(u16, String)>;
}

/// Production transport using ureq.
pub(crate) struct UreqTransport;

impl HttpTransport for UreqTransport {
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &str) -> Result<(u16, String)> {
        let mut req = ureq::post(url);
        for &(k, v) in headers {
            req = req.header(k, v);
        }
        let mut resp = req.send(body).map_err(|e| anyhow::anyhow!("{}", e))?;
        let status = resp.status();
        let text = resp.body_mut().read_to_string()?;
        Ok((status.into(), text))
    }
}

// ── Process Runner Abstraction ──────────────────────────────────────────────

/// Subprocess execution abstraction for testability.
pub(crate) trait ProcessRunner: Send + Sync {
    /// Run a command with args and stdin, return (exit_code, stdout, stderr).
    fn run(&self, cmd: &str, args: &[&str], stdin_data: &str) -> Result<(i32, String, String)>;
}

/// Production runner using std::process::Command.
pub(crate) struct StdProcessRunner;

impl ProcessRunner for StdProcessRunner {
    fn run(&self, cmd: &str, args: &[&str], stdin_data: &str) -> Result<(i32, String, String)> {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let mut child = Command::new(cmd)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| anyhow::anyhow!("Failed to spawn {} binary", cmd))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(stdin_data.as_bytes())?;
        }
        let output = child.wait_with_output()?;
        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        Ok((code, stdout, stderr))
    }
}
