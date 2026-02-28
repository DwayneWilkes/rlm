use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};

use anyhow::{bail, Result};

use crate::types::{Sandbox, SandboxCommand, SandboxResponse};

const HARNESS_PY: &str = include_str!("harness.py");
const DEFAULT_OUTPUT_LIMIT: usize = 50_000;

pub struct PythonSandbox {
    child: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
    reader: Option<BufReader<std::process::ChildStdout>>,
    output_limit: usize,
}

impl PythonSandbox {
    // NOCOV: subprocess management
    pub fn new() -> Result<Self> {
        let mut child = Command::new("python3")
            .args(["-u", "-c", HARNESS_PY])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                anyhow::anyhow!(
                    "Failed to spawn python3: {}. Is python3 installed?",
                    e
                )
            })?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();

        Ok(Self {
            child: Some(child),
            stdin,
            reader: stdout.map(BufReader::new),
            output_limit: DEFAULT_OUTPUT_LIMIT,
        })
    }

    pub fn with_output_limit(mut self, limit: usize) -> Self {
        self.output_limit = limit;
        self
    }

    // NOCOV: subprocess management
    fn send_command(&mut self, cmd: &SandboxCommand) -> Result<SandboxResponse> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("Sandbox stdin not available"))?;
        let reader = self
            .reader
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("Sandbox stdout not available"))?;

        let json = serde_json::to_string(cmd)?;
        writeln!(stdin, "{}", json)?;
        stdin.flush()?;

        let mut line = String::new();
        reader.read_line(&mut line)?;

        if line.is_empty() {
            bail!("Sandbox process closed stdout unexpectedly");
        }

        let mut resp: SandboxResponse = serde_json::from_str(line.trim())?;

        // Truncate output if needed
        if resp.stdout.len() > self.output_limit {
            resp.stdout.truncate(self.output_limit);
            resp.stdout.push_str("\n[truncated]");
        }
        if resp.stderr.len() > self.output_limit {
            resp.stderr.truncate(self.output_limit);
            resp.stderr.push_str("\n[truncated]");
        }

        Ok(resp)
    }
}

impl Sandbox for PythonSandbox {
    fn init(&mut self, context: &str) -> Result<()> {
        let cmd = SandboxCommand::Init {
            context: context.to_string(),
        };
        let resp = self.send_command(&cmd)?;
        if !resp.ok {
            bail!(
                "Sandbox init failed: {}",
                resp.error.unwrap_or_default()
            );
        }
        Ok(())
    }

    fn execute(&mut self, code: &str) -> Result<SandboxResponse> {
        let cmd = SandboxCommand::Exec {
            code: code.to_string(),
        };
        self.send_command(&cmd)
    }

    fn get_var(&mut self, name: &str) -> Result<Option<String>> {
        let cmd = SandboxCommand::GetVar {
            name: name.to_string(),
        };
        let resp = self.send_command(&cmd)?;
        if resp.ok {
            Ok(resp.value)
        } else {
            Ok(None)
        }
    }

    fn destroy(&mut self) -> Result<()> {
        // Try graceful shutdown
        if self.stdin.is_some() {
            let cmd = SandboxCommand::Shutdown;
            let _ = self.send_command(&cmd);
        }

        // Drop stdin to signal EOF
        self.stdin.take();
        self.reader.take();

        // Kill the process if still running
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        Ok(())
    }
}

impl Drop for PythonSandbox {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}
