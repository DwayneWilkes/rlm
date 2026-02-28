#![deny(unsafe_code)]

// NOCOV: entry point glue — this entire file is CLI I/O wiring.
// All testable logic lives in rlm::cli and other library modules.

use std::path::PathBuf;

use clap::{Parser, Subcommand};

use rlm::cli::{format_result, load_resolved_config, parse_output_format, resolve_effective_mode};
use rlm::engine::direct::DirectExecutor;
use rlm::engine::iterative::IterativeExecutor;
use rlm::engine::mode::resolve_mode;
use rlm::prompt::templates::list_templates;
use rlm::sandbox::python::PythonSandbox;
use rlm::types::Executor;

#[derive(Parser)]
#[command(name = "rlm", version, about = "Read-Loop-Mond — iterative LLM + code execution engine")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start MCP server (default)
    Serve,

    /// Execute a task
    Run {
        /// The task to execute
        task: String,

        /// Path to context file (or "-" for stdin)
        #[arg(long, short)]
        context: Option<String>,

        /// Execution mode
        #[arg(long, short, value_parser = ["direct", "iterative", "auto"])]
        mode: Option<String>,

        /// Prompt template name
        #[arg(long, short)]
        template: Option<String>,

        /// Config profile name
        #[arg(long, short)]
        profile: Option<String>,

        /// Output format
        #[arg(long, short, value_parser = ["text", "json", "yaml"], default_value = "text")]
        format: String,

        /// Run synthesis pass after iterative extraction
        #[arg(long)]
        synthesize: bool,

        /// Config file path
        #[arg(long)]
        config: Option<PathBuf>,
    },

    /// Show resolved configuration
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },

    /// List available templates
    Templates,
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Display resolved configuration
    Show {
        /// Profile name
        #[arg(long, short)]
        profile: Option<String>,
        /// Config file path
        #[arg(long)]
        config: Option<PathBuf>,
    },
}

// NOCOV: entry point glue
fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        None | Some(Commands::Serve) => cmd_serve(),
        Some(Commands::Run {
            task,
            context,
            mode,
            template,
            profile,
            format,
            synthesize,
            config,
        }) => cmd_run(task, context, mode, template, profile, format, synthesize, config),
        Some(Commands::Config { action }) => match action {
            ConfigAction::Show { profile, config } => cmd_config_show(profile, config),
        },
        Some(Commands::Templates) => cmd_templates(),
    };

    if let Err(e) = result {
        eprintln!("Error: {:#}", e);
        std::process::exit(1);
    }
}

// NOCOV: entry point glue
fn cmd_serve() -> anyhow::Result<()> {
    let tools = rlm::tools::all_tools();
    let srv = rlm::server::Server::new(tools);
    srv.run();
    Ok(())
}

// NOCOV: entry point glue
#[allow(clippy::too_many_arguments)]
fn cmd_run(
    task: String,
    context_path: Option<String>,
    mode_str: Option<String>,
    template_name: Option<String>,
    profile_name: Option<String>,
    format: String,
    synthesize: bool,
    config_path: Option<PathBuf>,
) -> anyhow::Result<()> {
    // Load context
    let context = match context_path {
        Some(ref p) if p == "-" => {
            use std::io::Read;
            let mut buf = String::new();
            std::io::stdin().read_to_string(&mut buf)?;
            buf
        }
        Some(ref p) => std::fs::read_to_string(p)?,
        None => String::new(),
    };

    // Load config
    let config = load_resolved_config(
        config_path.as_deref(),
        profile_name.as_deref(),
        mode_str.as_deref(),
        template_name.as_deref(),
        synthesize,
    )?;

    // Resolve mode
    let resolved = resolve_mode(config.mode, &context, config.provider.model());
    let (mode, downgraded) = resolve_effective_mode(resolved, &config.provider);

    if downgraded {
        eprintln!(
            "Warning: claude-code provider does not support iterative mode — \
             falling back to direct mode. Use anthropic or openai provider for iterative."
        );
    }

    // Build LLM client
    let client = rlm::tools::execute::build_client_from_config(&config)?;

    // Execute
    let result = match mode {
        rlm::types::Mode::Direct => {
            let executor = DirectExecutor::new(client.as_ref());
            executor.execute(&task, &context, &config)?
        }
        rlm::types::Mode::Iterative | rlm::types::Mode::Auto => {
            let sandbox = PythonSandbox::new()?;
            let mut executor = IterativeExecutor::new(client.as_ref(), Box::new(sandbox));
            executor.execute_mut(&task, &context, &config)?
        }
    };

    // Format output
    let output_format = parse_output_format(&format);
    let formatted = format_result(&result, output_format)?;
    println!("{}", formatted);

    Ok(())
}

// NOCOV: entry point glue
fn cmd_config_show(
    profile_name: Option<String>,
    config_path: Option<PathBuf>,
) -> anyhow::Result<()> {
    let config = load_resolved_config(
        config_path.as_deref(),
        profile_name.as_deref(),
        None,
        None,
        false,
    )?;
    println!("{}", rlm::config::display_config(&config));
    Ok(())
}

// NOCOV: entry point glue
fn cmd_templates() -> anyhow::Result<()> {
    let templates = list_templates(None)?;
    if templates.is_empty() {
        println!("No templates available.");
        return Ok(());
    }
    for t in &templates {
        println!("  {} — {}", t.name, t.description);
    }
    Ok(())
}
