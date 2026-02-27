use crate::sandbox::python::PythonSandbox;
use crate::types::Sandbox;

use super::fixtures::make_sandbox;

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
