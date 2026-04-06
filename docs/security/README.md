# Security Docs

This section is the canonical home for auth, passkey, Supabase security, secrets guidance, and security scanning runbooks.

## Canonical Docs

- [Code Scanning & Security Quality Guide](./code-scanning-guide.md)
- [CodeQL Remediation Report](./codeql-remediation-report.md)
- [Docker Image Vulnerability Remediation](./docker-image-vulnerability-remediation.md)
- [Auth Architecture](./auth-architecture-canonical.md)
- [Auth Readiness Checklist](./auth-readiness-checklist.md)
- [Environment and Secrets](./environment-and-secrets.md)
- [Passkey External Callback Contract](./passkey-external-callback-contract.md)
- [Passkey Rollout Plan](./passkey-rollout-plan.md)
- [Stack-Trace Exposure Remediation](./stack-trace-exposure-remediation.md)
- [Supabase Apply and Verify](./supabase-apply-and-verify.md)
- [Supabase Custom SMTP Runbook](./supabase-custom-smtp-runbook.md)
- [Supabase RLS Hardening](./supabase-rls-hardening.md)

## Notes

- Security docs stay in this section even when they affect frontend, backend, or Runtime Control.
- Runtime ownership docs should link here for security-sensitive contracts instead of duplicating the rules.
- Root-level vulnerability report files were retired in favor of the canonical docs in this folder.
