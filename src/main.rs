#![deny(unsafe_code)]

use std::path::PathBuf;

use clap::{Parser, Subcommand};

use rlm::config::{build_config, load_config_file, resolve_profile, CliOverrides};
use rlm::engine::direct::DirectExecutor;
use rlm::engine::iterative::IterativeExecutor;
use rlm::engine::mode::resolve_mode;
use rlm::prompt::templates::list_templates;
use rlm::sandbox::python::PythonSandbox;
use rlm::types::{Executor, Mode, OutputFormat, ProviderConfig};

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

fn cmd_serve() -> anyhow::Result<()> {
    let tools = rlm::tools::all_tools();
    let srv = rlm::server::Server::new(tools);
    srv.run();
    Ok(())
}

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
    let mode = resolve_mode(config.mode, &context, config.provider.model());

    // Build LLM client
    let client = rlm::tools::execute::build_client_from_config(&config)?;

    // Execute
    let result = match mode {
        Mode::Direct => {
            let executor = DirectExecutor::new(client.as_ref());
            executor.execute(&task, &context, &config)?
        }
        Mode::Iterative | Mode::Auto => {
            let sandbox = PythonSandbox::new()?;
            let mut executor = IterativeExecutor::new(client.as_ref(), Box::new(sandbox));
            executor.execute_mut(&task, &context, &config)?
        }
    };

    // Format output
    let output_format = match format.as_str() {
        "json" => OutputFormat::Json,
        "yaml" => OutputFormat::Yaml,
        _ => OutputFormat::Text,
    };

    match output_format {
        OutputFormat::Text => {
            println!("{}", result.answer);
            if let Some(ref synth) = result.synthesis {
                println!("\n--- Synthesis ---\n{}", synth);
            }
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        OutputFormat::Yaml => {
            println!("{}", serde_yaml::to_string(&result)?);
        }
    }

    Ok(())
}

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

fn load_resolved_config(
    config_path: Option<&std::path::Path>,
    profile_name: Option<&str>,
    mode_str: Option<&str>,
    template_name: Option<&str>,
    synthesize: bool,
) -> anyhow::Result<rlm::types::RlmConfig> {
    let mode = mode_str.map(|m| match m {
        "direct" => Mode::Direct,
        "iterative" => Mode::Iterative,
        _ => Mode::Auto,
    });

    let overrides = CliOverrides {
        provider: None,
        mode,
        template: template_name.map(String::from),
        synthesize: if synthesize { Some(true) } else { None },
    };

    // Try loading config file
    match load_config_file(config_path, None)? {
        Some((cfg_file, _path)) => {
            let profile_key = profile_name
                .map(String::from)
                .or_else(|| {
                    // Use first profile if only one exists
                    if cfg_file.profiles.len() == 1 {
                        cfg_file.profiles.keys().next().cloned()
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| "default".to_string());

            let profile = resolve_profile(&cfg_file, &profile_key)?;
            build_config(&profile, &overrides)
        }
        None => {
            // No config file — use defaults
            let profile = rlm::types::Profile {
                provider: Some(ProviderConfig::Anthropic {
                    model: "claude-sonnet-4-20250514".to_string(),
                    api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                }),
                ..rlm::types::Profile::default()
            };
            build_config(&profile, &overrides)
        }
    }
}
