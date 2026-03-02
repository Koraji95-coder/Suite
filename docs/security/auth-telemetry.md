# Auth Telemetry

Date: March 2, 2026  
Repo: `Suite`

## Event Taxonomy

Auth method telemetry is written to `activity_log.action` with this format:

- `security:auth_method:<method>:<event>`

Current method/event values in use:

- `security:auth_method:email_link:sign_in_link_requested`
- `security:auth_method:email_link:sign_up_link_requested`
- `security:auth_method:email_link:sign_in_request_failed`
- `security:auth_method:email_link:sign_up_request_failed`
- `security:auth_method:email_link:sign_in_completed`

Reserved for rollout:

- `security:auth_method:passkey:*`

Passkey events now emitted by UI start handlers:

- `security:auth_method:passkey:sign_in_started`
- `security:auth_method:passkey:sign_in_redirected`
- `security:auth_method:passkey:sign_in_failed`
- `security:auth_method:passkey:enroll_started`
- `security:auth_method:passkey:enroll_redirected`
- `security:auth_method:passkey:enroll_failed`
- `security:auth_method:passkey:sign_in_completed`
- `security:auth_method:passkey:enroll_completed`

## Source Locations

- Telemetry helper: `src/services/securityEventService.ts`
- Email-link request success/completion: `src/auth/AuthContext.tsx`
- Email-link request failures: `src/routes/LoginPage.tsx`, `src/routes/SignupPage.tsx`
- Passkey sign-in start flow: `src/routes/LoginPage.tsx`
- Passkey enrollment start flow: `src/routes/settings/AccountSettings.tsx`

## Baseline Queries (Supabase SQL)

Volume by event:

```sql
select
  date_trunc('hour', timestamp) as hour,
  action,
  count(*) as events
from public.activity_log
where action like 'security:auth_method:%'
  and timestamp >= now() - interval '14 days'
group by 1, 2
order by 1 desc, 2 asc;
```

Email-link request failures:

```sql
select
  date_trunc('day', timestamp) as day,
  action,
  count(*) as events
from public.activity_log
where action in (
  'security:auth_method:email_link:sign_in_request_failed',
  'security:auth_method:email_link:sign_up_request_failed'
)
  and timestamp >= now() - interval '30 days'
group by 1, 2
order by 1 desc, 2 asc;
```

Daily sign-in link request vs completion counts:

```sql
select
  date_trunc('day', timestamp) as day,
  sum(case when action = 'security:auth_method:email_link:sign_in_link_requested' then 1 else 0 end) as requested,
  sum(case when action = 'security:auth_method:email_link:sign_in_completed' then 1 else 0 end) as completed
from public.activity_log
where action in (
  'security:auth_method:email_link:sign_in_link_requested',
  'security:auth_method:email_link:sign_in_completed'
)
  and timestamp >= now() - interval '30 days'
group by 1
order by 1 desc;
```
