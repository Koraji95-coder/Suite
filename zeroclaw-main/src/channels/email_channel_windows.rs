#![allow(clippy::uninlined_format_args)]
#![allow(clippy::map_unwrap_or)]
#![allow(clippy::redundant_closure_for_method_calls)]
#![allow(clippy::cast_lossless)]
#![allow(clippy::trim_split_whitespace)]
#![allow(clippy::doc_link_with_quotes)]
#![allow(clippy::doc_markdown)]
#![allow(clippy::too_many_lines)]
#![allow(clippy::unnecessary_map_or)]

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lettre::message::SinglePart;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use super::traits::{Channel, ChannelMessage, SendMessage};

/// Email channel configuration
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EmailConfig {
    /// IMAP server hostname
    pub imap_host: String,
    /// IMAP server port (default: 993 for TLS)
    #[serde(default = "default_imap_port")]
    pub imap_port: u16,
    /// IMAP folder to poll (default: INBOX)
    #[serde(default = "default_imap_folder")]
    pub imap_folder: String,
    /// SMTP server hostname
    pub smtp_host: String,
    /// SMTP server port (default: 465 for TLS)
    #[serde(default = "default_smtp_port")]
    pub smtp_port: u16,
    /// Use TLS for SMTP (default: true)
    #[serde(default = "default_true")]
    pub smtp_tls: bool,
    /// Email username for authentication
    pub username: String,
    /// Email password for authentication
    pub password: String,
    /// From address for outgoing emails
    pub from_address: String,
    /// IDLE timeout in seconds before re-establishing connection
    #[serde(default = "default_idle_timeout", alias = "poll_interval_secs")]
    pub idle_timeout_secs: u64,
    /// Allowed sender addresses/domains (empty = deny all, ["*"] = allow all)
    #[serde(default)]
    pub allowed_senders: Vec<String>,
}

impl crate::config::traits::ChannelConfig for EmailConfig {
    fn name() -> &'static str {
        "Email"
    }

    fn desc() -> &'static str {
        "Email over IMAP/SMTP"
    }
}

fn default_imap_port() -> u16 {
    993
}
fn default_smtp_port() -> u16 {
    465
}
fn default_imap_folder() -> String {
    "INBOX".into()
}
fn default_idle_timeout() -> u64 {
    1740
}
fn default_true() -> bool {
    true
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            imap_host: String::new(),
            imap_port: default_imap_port(),
            imap_folder: default_imap_folder(),
            smtp_host: String::new(),
            smtp_port: default_smtp_port(),
            smtp_tls: true,
            username: String::new(),
            password: String::new(),
            from_address: String::new(),
            idle_timeout_secs: default_idle_timeout(),
            allowed_senders: Vec::new(),
        }
    }
}

/// Email channel on Windows currently supports SMTP send only.
pub struct EmailChannel {
    pub config: EmailConfig,
}

impl EmailChannel {
    pub fn new(config: EmailConfig) -> Self {
        Self { config }
    }

    fn create_smtp_transport(&self) -> Result<SmtpTransport> {
        let creds = Credentials::new(self.config.username.clone(), self.config.password.clone());
        let transport = if self.config.smtp_tls {
            SmtpTransport::relay(&self.config.smtp_host)?
                .port(self.config.smtp_port)
                .credentials(creds)
                .build()
        } else {
            SmtpTransport::builder_dangerous(&self.config.smtp_host)
                .port(self.config.smtp_port)
                .credentials(creds)
                .build()
        };
        Ok(transport)
    }
}

#[async_trait]
impl Channel for EmailChannel {
    fn name(&self) -> &str {
        "email"
    }

    async fn send(&self, message: &SendMessage) -> Result<()> {
        let (subject, body) = if let Some(ref subj) = message.subject {
            (subj.as_str(), message.content.as_str())
        } else if message.content.starts_with("Subject: ") {
            if let Some(pos) = message.content.find('\n') {
                (&message.content[9..pos], message.content[pos + 1..].trim())
            } else {
                ("ZeroClaw Message", message.content.as_str())
            }
        } else {
            ("ZeroClaw Message", message.content.as_str())
        };

        let email = Message::builder()
            .from(self.config.from_address.parse()?)
            .to(message.recipient.parse()?)
            .subject(subject)
            .singlepart(SinglePart::plain(body.to_string()))?;

        let transport = self.create_smtp_transport()?;
        transport.send(&email)?;
        info!("Email sent to {}", message.recipient);
        Ok(())
    }

    async fn listen(&self, _tx: mpsc::Sender<ChannelMessage>) -> Result<()> {
        warn!(
            "Email IMAP listener is disabled on Windows due compiler instability in async-imap path."
        );
        Err(anyhow!(
            "Email IMAP listener is currently unavailable on Windows in this build."
        ))
    }

    async fn health_check(&self) -> bool {
        debug!("Email IMAP health check unavailable on Windows build");
        false
    }
}
