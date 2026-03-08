#![forbid(unsafe_code)]

use anyhow::{bail, Result};
use clap::Parser;
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

#[derive(Parser, Debug)]
#[command(name = "zeroclaw-gateway")]
#[command(author = "theonlyhennygod")]
#[command(version)]
#[command(about = "Gateway-only runner for local Suite development.")]
struct Cli {
    #[arg(long)]
    config_dir: Option<String>,

    /// Port to listen on (use 0 for random available port); defaults to config gateway.port
    #[arg(short, long)]
    port: Option<u16>,

    /// Host to bind to; defaults to config gateway.host
    #[arg(long)]
    host: Option<String>,

    /// Clear all paired tokens and generate a fresh pairing code
    #[arg(long)]
    new_pairing: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Keep TLS provider behavior aligned with main binary.
    if let Err(error) = rustls::crypto::ring::default_provider().install_default() {
        eprintln!("Warning: Failed to install default crypto provider: {error:?}");
    }

    let cli = Cli::parse();
    if let Some(config_dir) = &cli.config_dir {
        if config_dir.trim().is_empty() {
            bail!("--config-dir cannot be empty");
        }
        std::env::set_var("ZEROCLAW_CONFIG_DIR", config_dir);
    }

    let subscriber = fmt::Subscriber::builder()
        .with_timer(tracing_subscriber::fmt::time::ChronoLocal::rfc_3339())
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("setting default subscriber failed");

    let mut config = zeroclaw::Config::load_or_init().await?;
    config.apply_env_overrides();
    zeroclaw::observability::runtime_trace::init_from_config(
        &config.observability,
        &config.workspace_dir,
    );
    if let Some(uri) = zeroclaw::ensure_otp_secret_initialized(&config)? {
        println!("Initialized OTP secret for ZeroClaw.");
        println!("Enrollment URI: {uri}");
    }

    if cli.new_pairing {
        let mut persisted_config = zeroclaw::Config::load_or_init().await?;
        persisted_config.gateway.paired_tokens.clear();
        persisted_config.save().await?;
        config.gateway.paired_tokens.clear();
        info!("🔐 Cleared paired tokens — a fresh pairing code will be generated");
    }

    let port = cli.port.unwrap_or(config.gateway.port);
    let host = cli.host.unwrap_or_else(|| config.gateway.host.clone());
    if port == 0 {
        info!("🚀 Starting ZeroClaw Gateway on {host} (random port)");
    } else {
        info!("🚀 Starting ZeroClaw Gateway on {host}:{port}");
    }

    zeroclaw::gateway::run_gateway(&host, port, config).await
}
