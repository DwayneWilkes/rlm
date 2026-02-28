use crate::sandbox::python::PythonSandbox;
use crate::types::Sandbox;

use super::fixtures::{make_sandbox, with_sandbox};

#[test]
fn sandbox_init_and_execute() {
    with_sandbox("Hello, World!", |sb| {
        let resp = sb.execute("print(len(context))").unwrap();
        assert!(resp.ok);
        assert_eq!(resp.stdout.trim(), "13");
    });
}

#[test]
fn sandbox_get_var() {
    with_sandbox("test data", |sb| {
        let resp = sb.execute("result = context.upper()").unwrap();
        assert!(resp.ok);

        let val = sb.get_var("result").unwrap();
        assert_eq!(val, Some("TEST DATA".to_string()));
    });
}

#[test]
fn sandbox_get_var_not_found() {
    with_sandbox("", |sb| {
        let val = sb.get_var("nonexistent").unwrap();
        assert!(val.is_none());
    });
}

#[test]
fn sandbox_execution_error() {
    with_sandbox("", |sb| {
        let resp = sb.execute("raise ValueError('boom')").unwrap();
        assert!(!resp.ok);
        assert!(resp.error.is_some());
        assert!(resp.error.unwrap().contains("ValueError"));
    });
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
    let paper = "My Paper Title\n\nAbstract\n\nThis is the abstract text.\n\n1. Introduction\n\nIntro text here.\n";
    with_sandbox(paper, |sb| {
        let resp = sb
            .execute("result = parse_academic_paper(context)\nprint(list(result.keys()))")
            .unwrap();
        assert!(resp.ok);
        // Should detect at least title, abstract, introduction
        assert!(resp.stdout.contains("title") || resp.stdout.contains("Title"));
    });
}

#[test]
fn sandbox_multiple_executions() {
    with_sandbox("initial", |sb| {
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
    });
}

#[test]
fn sandbox_read_chunk() {
    with_sandbox("abcdefghijklmnopqrstuvwxyz", |sb| {
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
    });
}

#[test]
fn sandbox_context_len() {
    with_sandbox("hello world", |sb| {
        // context_len() should be available
        let resp = sb.execute("print(context_len())").unwrap();
        assert!(resp.ok, "context_len failed: {:?}", resp.error);
        assert_eq!(resp.stdout.trim(), "11");
    });
}
