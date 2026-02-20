# Security Quick Reference Guide for Developers

**Status**: Active Security Monitoring  
**Last Updated**: February 20, 2026

---

## Quick Links

- 📋 [Full Security Audit Report](SECURITY_AUDIT_REPORT.md)
- 🔧 [Remediation Implementation Guide](SECURITY_REMEDIATION_GUIDE.md)
- 🚨 [Incident Response Playbook](#incident-response)

---

## Daily Security Checklist

### Before Committing Code

```bash
# 1. Check for secrets
grep -r "password\|token\|secret\|key" src/ --include="*.ts" --include="*.tsx"
# Should only match comments or env var references

# 2. Run linter
npm run lint

# 3. Run type check
npm run typecheck

# 4. Check dependencies
npm audit

# 5. Before pushing
git diff --cached | grep -E "password|secret|token|api[_-]?key"
```

### Code Review Checklist

When reviewing other developers' code, watch for:

```
Security Code Review Items:
[ ] No hardcoded secrets/passwords
[ ] All user input validated before use
[ ] No dangerouslySetInnerHTML or innerHTML
[ ] No eval(), Function(), or dynamic code execution
[ ] SQL queries use parameterized queries
[ ] File operations validate paths (no traversal)
[ ] Auth tokens only in secure storage
[ ] API calls include authorization headers
[ ] Error messages don't leak sensitive info
[ ] No console.log of sensitive data
[ ] Dependencies are from trusted sources
```

---

## Common Vulnerability Patterns & How to Avoid

### Pattern 1: Injecting User Data Into HTML

❌ **VULNERABLE**:
```typescript
// BAD: Creates XSS vulnerability
function renderComment(comment: string) {
  return <div dangerouslySetInnerHTML={{ __html: comment }} />;
}
```

✅ **SECURE**:
```typescript
// GOOD: React escapes content automatically
function renderComment(comment: string) {
  return <div>{comment}</div>;
}
```

### Pattern 2: Building Database Queries

❌ **VULNERABLE**:
```typescript
// BAD: SQL injection risk
const userId = getUserInput();
const query = `SELECT * FROM users WHERE id = '${userId}'`;
const result = await database.query(query);
```

✅ **SECURE**:
```typescript
// GOOD: Parameterized query
const userId = getUserInput();
const result = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);
```

### Pattern 3: File Path Operations

❌ **VULNERABLE**:
```typescript
// BAD: Path traversal possible
const userPath = getUserInput(); // Could be "../../../etc/passwd"
const content = fs.readFileSync(userPath, 'utf-8');
```

✅ **SECURE**:
```typescript
// GOOD: Validate path is within safe directory
const userPath = getUserInput();
const safePath = path.resolve(userPath);
const baseDir = path.resolve('/safe/base/dir');

if (!safePath.startsWith(baseDir)) {
  throw new Error('Invalid path');
}

const content = fs.readFileSync(safePath, 'utf-8');
```

### Pattern 4: Storing Sensitive Data

❌ **VULNERABLE**:
```typescript
// BAD: Vulnerable to XSS
localStorage.setItem('authToken', token);
```

✅ **SECURE**:
```typescript
// GOOD: Cleared on page close, somewhat protected
sessionStorage.setItem('authToken', token);

// BETTER: Use HttpOnly cookies (server sets)
// Browser prevents JavaScript access
Set-Cookie: auth=<token>; HttpOnly; Secure; SameSite=Strict
```

### Pattern 5: Form Submission

❌ **VULNERABLE**:
```typescript
// BAD: No CSRF protection
function handleSubmit(data: FormData) {
  return fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}
```

✅ **SECURE**:
```typescript
// GOOD: Include CSRF token
async function handleSubmit(data: FormData) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.textContent;
  
  return fetch('/api/submit', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}
```

### Pattern 6: API Authentication

❌ **VULNERABLE**:
```typescript
// BAD: No auth, anyone can call
@app.route('/api/execute', methods=['POST'])
def api_execute():
    config = request.get_json()
    return execute_extraction(config)
```

✅ **SECURE**:
```typescript
// GOOD: Requires authentication
@app.route('/api/execute', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")
def api_execute():
    if not verify_token(request.headers.get('Authorization')):
        return {'error': 'Unauthorized'}, 401
    
    config = validate_config(request.get_json())
    return execute_extraction(config)
```

---

## Secure Coding Standards

### Input Validation

Always validate and sanitize user input:

```typescript
// Standard validation pattern
function processUserInput(input: unknown): string {
  // 1. Type check
  if (typeof input !== 'string') {
    throw new Error('Invalid type');
  }

  // 2. Length check
  if (input.length > 255) {
    throw new Error('Input too long');
  }

  // 3. Pattern validation
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    throw new Error('Invalid characters');
  }

  // 4. Trim whitespace
  return input.trim();
}
```

### Error Handling

Never expose sensitive information in error messages:

```typescript
// ❌ BAD: Exposes file paths, system info
catch (error) {
  return { error: error.message }; // "File not found: /home/user/secret.key"
}

// ✅ GOOD: Generic message to user, detailed logging server-side
catch (error) {
  logger.error('Database error', { userId, error: error.stack });
  return { error: 'Operation failed. Please try again.' };
}
```

### Logging Sensitive Data

```typescript
// ❌ BAD: Logs token
logger.info('User authenticated', { token });

// ✅ GOOD: Logs identifier only
logger.info('User authenticated', { userId: user.id });
```

---

## Weekly Security Tasks

### Monday
- [ ] Review `npm audit` results
- [ ] Check GitHub security alerts
- [ ] Review new dependency versions

### Wednesday
- [ ] Run security linter: `npm run lint`
- [ ] Check error logs for suspicious patterns
- [ ] Review access logs

### Friday
- [ ] Summary of security issues fixed this week
- [ ] Plan security work for next week
- [ ] Update security documentation

---

## Monthly Security Tasks

### First Monday of Month
- [ ] Run full security test suite
- [ ] Penetration testing (if applicable)
- [ ] Security team sync meeting

### Mid-Month
- [ ] Review and update threat model
- [ ] Audit application logs
- [ ] Check for known CVEs in dependencies

### Last Friday of Month
- [ ] Security retrospective
- [ ] Update security runbooks
- [ ] Team security training

---

## Incident Response Playbook

### When Something Suspicious Happens

**1. STOP - Don't Panic**
- Assess severity (Critical/High/Medium/Low)
- Don't delete logs or evidence
- Don't commit/push the issue

**2. ALERT**
- Notify security team immediately
- Notify team lead
- Document what you found

**3. ISOLATE**
- If account compromised: force password reset
- If code compromised: revert changes
- If data exposed: check what was accessed
- If API compromised: disable endpoint

**4. INVESTIGATE**
- Check logs for access patterns
- Identify affected users/data
- Measure impact
- Determine root cause

**5. CONTAIN**
- Patch the vulnerability
- Rotate compromised credentials
- Update access controls
- Verify fix with tests

**6. RECOVER**
- Deploy fix to production
- Monitor for re-exploitation
- Restore any affected data
- Verify system health

**7. COMMUNICATE**
- Notify affected users
- File incident report
- Update documentation
- Schedule post-incident review

See [Security Incident Report Template](#incident-template)

---

## Resources

### Internal Documentation
- Security Audit Report (this document)
- Remediation Guide
- Architecture & Security Decisions

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### Tools
- `npm audit` - Dependency vulnerability scanning
- ESLint - Code quality and security rules
- Snyk - Continuous vulnerability monitoring
- OWASP ZAP - API security testing

---

## Contact & Escalation

**Security Issues**: security@example.com  
**Urgent (Production Impact)**: Call security on-call  
**Vulnerability Reports**: Follow responsible disclosure policy

---

## Security Incident Report Template

```markdown
# Security Incident Report

**Date Discovered**: YYYY-MM-DD HH:MM UTC
**Reported By**: [Name]
**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low
**Status**: [ ] Open [ ] In Progress [ ] Resolved

## Summary
[1-2 sentence description of the incident]

## Description
[Detailed explanation of what happened]

## Impact
- **Scope**: [What systems/data affected]
- **Users Affected**: [Number of users]
- **Data Affected**: [Types of data exposed]
- **Potential Damage**: [Financial, reputational, etc.]

## Root Cause
[How did this happen?]

## Timeline
- HH:MM - Event discovered
- HH:MM - Team notified
- HH:MM - Investigation began
- HH:MM - Containment actions taken
- HH:MM - Fix deployed
- HH:MM - Verification completed

## Remediation
- [ ] Vulnerability patched
- [ ] Credentials rotated
- [ ] Users notified
- [ ] Access revoked
- [ ] Monitoring enhanced
- [ ] Documentation updated

## Lessons Learned
[What can we do to prevent this in the future?]

## Follow-up Tasks
- [ ] Implement preventive measures
- [ ] Security training update
- [ ] Process improvements
- [ ] Code review changes

**Assigned To**: [Name]  
**Due Date**: YYYY-MM-DD
```

---

## Department Standards

### When You See An Issue

| Issue | Action | Priority |
|-------|--------|----------|
| Hardcoded secret | Issue PR, notify lead, rotate credential | CRITICAL |
| XSS vulnerability | Create issue, fix before merge, test | HIGH |
| Missing input validation | Create issue, add validation | HIGH |
| Weak password/token | Create issue, rotate, update docs | HIGH |
| Unpatched CVE | Create issue, update package | MEDIUM |
| Missing error handling | Create issue, add handling | MEDIUM |
| Suspicious dependency | Create issue, vet package | MEDIUM |
| Outdated documentation | Create issue, update docs | LOW |

---

## Training & Awareness

### Required Reading
- OWASP Top 10 (first 3 items)
- Security Audit Report (this team's findings)
- NIST Secure Software Development Framework

### Required Certifications
- SANS/CompTIA (upon hire)
- Annual security training
- Product-specific security training

### Recommended Courses
- OWASP Web Application Security
- Secure Coding Practices
- Incident Response

---

## FAQ

**Q: Is it safe to commit my .env file?**  
A: NO! Add to .gitignore. Use `.env.example` with placeholder values only.

**Q: How do I store secrets in production?**  
A: Use environment variables set by your deployment platform (Vercel, Railway, etc.), never in code or config files.

**Q: Can I use `eval()` in my code?**  
A: NO! It's a major security risk. Never evaluate user-provided code.

**Q: How do I test security without breaking things?**  
A: Use security testing environment with test data and non-production credentials.

**Q: What if I accidentally commit a secret?**  
A: 1) Rotate the credential immediately, 2) Tell your team, 3) Use `git-secrets` to prevent future commits.

**Q: How do I report a vulnerability responsibly?**  
A: Email security@example.com with details. Don't publicly disclose until fix is deployed.

---

## Glossary

**CSRF**: Cross-Site Request Forgery - Attacker tricks user into making unwanted requests  
**CVE**: Common Vulnerabilities and Exposures - Database of known security issues  
**OWASP**: Open Web Application Security Project - Security guideline organization  
**RLS**: Row-Level Security - Database policy restricting data access  
**XSS**: Cross-Site Scripting - Injecting malicious scripts into web pages  
**HTTPS**: Secure HTTP - Encrypted web protocol  
**JWT**: JSON Web Token - Token-based authentication  
**API Key**: Secret authentication credential for API access  
**Parameterized Query**: SQL query with separate parameters (prevents injection)  
**Obfuscation**: Making data hard to understand (not actual encryption)  

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-20 | Initial security audit and documentation | Koro |
| | | |
| | | |

---

**Remember**: Security is Everyone's Responsibility! 🔐

Questions? Ask your security team or check the full audit report.
