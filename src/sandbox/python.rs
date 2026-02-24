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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sandbox() -> Result<PythonSandbox> {
        PythonSandbox::new()
    }

    #[test]
    fn sandbox_init_and_execute() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("Hello, World!").unwrap();

        let resp = sb.execute("print(len(context))").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "13");

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_get_var() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("test data").unwrap();

        let resp = sb.execute("result = context.upper()").unwrap();
        assert!(resp.ok);

        let val = sb.get_var("result").unwrap();
        assert_eq!(val, Some("TEST DATA".to_string()));

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_get_var_not_found() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("").unwrap();
        let val = sb.get_var("nonexistent").unwrap();
        assert!(val.is_none());

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_execution_error() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("").unwrap();
        let resp = sb.execute("raise ValueError('boom')").unwrap();
        assert!(!resp.ok);
        assert!(resp.error.is_some());
        assert!(resp.error.unwrap().contains("ValueError"));

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_output_truncation() {
        let mut sb = match PythonSandbox::new() {
            Ok(sb) => sb.with_output_limit(50),
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("").unwrap();
        let resp = sb.execute("print('x' * 200)").unwrap();
        assert!(resp.ok);
        assert!(resp.stdout.contains("[truncated]"));
        assert!(resp.stdout.len() <= 70); // 50 + "[truncated]" + newline margin

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_parse_academic_paper() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        let paper = "My Paper Title\n\nAbstract\n\nThis is the abstract text.\n\n1. Introduction\n\nIntro text here.\n";
        sb.init(paper).unwrap();

        let resp = sb
            .execute("result = parse_academic_paper(context)\nprint(list(result.keys()))")
            .unwrap();
        assert!(resp.ok);
        // Should detect at least title, abstract, introduction
        assert!(resp.stdout.contains("title") || resp.stdout.contains("Title"));

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_multiple_executions() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("initial").unwrap();

        // First execution sets a variable
        let resp = sb.execute("x = 10").unwrap();
        assert!(resp.ok);

        // Second execution can see that variable
        let resp = sb.execute("print(x * 2)").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "20");

        // Third execution modifies it
        let resp = sb.execute("x = x + 5\nprint(x)").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "15");

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_read_chunk() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("abcdefghijklmnopqrstuvwxyz").unwrap();

        // read_chunk returns a slice of context
        let resp = sb.execute("print(read_chunk(0, 5))").unwrap();
        assert!(resp.ok, "read_chunk failed: {:?}", resp.error);
        assert_eq!(resp.stdout.trim(), "abcde");

        // read_chunk with offset
        let resp = sb.execute("print(read_chunk(10, 15))").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "klmno");

        // read_chunk past end clamps
        let resp = sb.execute("print(read_chunk(24, 100))").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "yz");

        sb.destroy().unwrap();
    }

    #[test]
    fn sandbox_context_len() {
        let mut sb = match make_sandbox() {
            Ok(sb) => sb,
            Err(e) => {
                eprintln!("Skipping test (python3 not available): {}", e);
                return;
            }
        };

        sb.init("hello world").unwrap();

        // context_len() should be available
        let resp = sb.execute("print(context_len())").unwrap();
        assert!(resp.ok, "context_len failed: {:?}", resp.error);
        assert_eq!(resp.stdout.trim(), "11");

        sb.destroy().unwrap();
    }
}
