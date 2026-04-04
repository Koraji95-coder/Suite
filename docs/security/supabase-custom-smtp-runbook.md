# Supabase Custom SMTP Runbook (Gmail)

Use this when Supabase returns `429 email rate limit exceeded` for auth emails.

## 1) Immediate Unblock (No Email Send Required)

Generate a one-time magic link directly with service-role credentials:

```bash
npm run auth:magiclink:generate -- --email dev@example.com --redirect http://localhost:5173/login
```

Open the printed `action_link` in the browser profile you use for Suite.

This bypasses outbound email delivery and works even when SMTP send quota is exhausted.

## 2) Configure Custom SMTP in Supabase

In Supabase Dashboard:

1. Go to `Authentication` -> `Settings` -> `SMTP Settings`.
2. Enable custom SMTP.
3. For Gmail, set:
   - Host: `smtp.gmail.com`
   - Port: `465` (SSL)
   - Username: your full Gmail address
   - Password: Gmail App Password (16-character app key)
   - Sender email: same Gmail mailbox (or a verified alias)
   - Sender name: your product name (for example `Suite`)
4. Save.
5. Send a test auth email from Supabase dashboard.

Repo env convenience keys (for operator reference) now exist in `.env`/`.env.example`:

- `GMAIL_SMTP_USER`
- `GMAIL_SMTP_APP_PASSWORD`
- `SUPABASE_SMTP_HOST`
- `SUPABASE_SMTP_PORT`
- `SUPABASE_SMTP_USER`
- `SUPABASE_SMTP_PASS`
- `SUPABASE_SMTP_SENDER_EMAIL`
- `SUPABASE_SMTP_SENDER_NAME`

For local Supabase, use the repo helpers instead of editing `supabase/config.toml` by hand:

```bash
npm run supabase:mail:gmail
npm run supabase:mail:mailpit
```

Those commands update `.env.local` and restart the local Supabase stack when the SMTP mode changes.

## 3) Increase Email Rate Limits (After Custom SMTP)

If you need higher auth-email throughput, update auth config after custom SMTP is active.

Example Management API call (set your own values):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/<PROJECT_REF>/config/auth" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "rate_limit_email_sent": 120
  }'
```

## 4) App-Side Protections (Already Important)

Keep these enabled to avoid re-triggering limits:

1. Pairing/email actions should be single-click with cooldown.
2. Turnstile/CAPTCHA on auth email endpoints.
3. Abuse throttles and `Retry-After` handling in UI.

## Sources

1. Supabase Auth rate limits and Management API patch example:  
   https://supabase.com/docs/guides/auth/rate-limits
2. Supabase Custom SMTP guide and Gmail troubleshooting:  
   https://supabase.com/docs/guides/auth/auth-smtp  
   https://supabase.com/docs/guides/troubleshooting/auth-error-429-email-rate-limit-exceeded-xbdsQq
