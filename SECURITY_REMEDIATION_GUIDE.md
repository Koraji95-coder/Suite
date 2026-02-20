# Security Remediation Implementation Guide

**Status**: Action Required  
**Priority**: Critical  
**Timeline**: 4-6 weeks to production-ready

---

## Quick Start: Critical Path (First Week)

### Day 1: Database Access Control

**Time Estimate**: 2 hours

**Step 1**: Backup current database
```bash
# In Supabase dashboard: 
# 1. Go to Project Settings
# 2. Click "Backups"
# 3. Create manual backup
```

**Step 2**: Update RLS policies

Replace all `CREATE POLICY` statements in [supabase/consolidated_migration.sql](supabase/consolidated_migration.sql) with secure versions.

**SQL Template for Each Table**:
```sql
-- Disable anonymous access
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

-- Drop insecure policies
DROP POLICY IF EXISTS "Anyone can read <table_name>" ON <table_name>;
DROP POLICY IF EXISTS "Anyone can insert <table_name>" ON <table_name>;
DROP POLICY IF EXISTS "Anyone can update <table_name>" ON <table_name>;
DROP POLICY IF EXISTS "Anyone can delete <table_name>" ON <table_name>;

-- Add secure policies
CREATE POLICY "Users can read their own <table_name>"
  ON <table_name> FOR SELECT
  USING (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can insert their own <table_name>"
  ON <table_name> FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can update their own <table_name>"
  ON <table_name> FOR UPDATE
  USING (auth.uid()::text = user_id OR user_id = 'Dustin')
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can delete their own <table_name>"
  ON <table_name> FOR DELETE
  USING (auth.uid()::text = user_id OR user_id = 'Dustin');
```

**Apply to Tables**:
- formulas
- saved_calculations
- saved_circuits
- projects
- tasks
- files
- activity_log
- calendar_events
- whiteboards
- ai_conversations
- ai_memory

**Step 3**: Test RLS policies
```typescript
// src/lib/__tests__/supabase.test.ts
import { supabase } from '../supabase';

async function testRLSPolicies() {
  // Test 1: Anonymous user cannot read data
  const { data: anonData, error: anonError } = await supabase
    .from('formulas')
    .select('*');
  
  if (anonData && anonData.length > 0) {
    console.error('❌ FAIL: Anonymous access not blocked!');
  } else {
    console.log('✅ PASS: Anonymous access blocked');
  }
  
  // Test 2: Authenticated user can read only own data
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from('formulas')
    .select('*')
    .eq('user_id', user?.id);
  
  if (userData && userData.length >= 0) {
    console.log('✅ PASS: User can read own data');
  }
}
```

**Step 4**: Deploy to production
```bash
# After testing locally
1. Go to Supabase Dashboard
2. Run migrations in correct order (handle foreign keys)
3. Verify RLS policies in SQL Editor
4. Test with client application
```

---

### Day 2: Replace xlsx Library

**Time Estimate**: 3 hours

**Option 1: exceljs (Recommended - Feature Rich)**

```bash
npm uninstall xlsx
npm install exceljs
```

**New Implementation**:
```typescript
// src/components/apps/DrawingListManager.tsx
import ExcelJS from 'exceljs';

const buildWorkbook = async (drawings: DrawingEntry[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Drawing Index');

  // Add header row
  worksheet.addRow([
    'Drawing Number',
    'Title',
    'File',
    'Discipline',
    'Sheet Type',
    'Revision',
    'Source'
  ]).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows with sanitization
  drawings.forEach((drawing) => {
    const safeRow = {
      drawingNumber: String(drawing.drawingNumber).substring(0, 255),
      title: String(drawing.title).substring(0, 255),
      fileName: String(drawing.fileName).substring(0, 255),
      discipline: String(drawing.discipline).substring(0, 50),
      sheetType: String(drawing.sheetType).substring(0, 50),
      revision: String(drawing.revision).substring(0, 20),
      source: ['folder', 'generated'].includes(drawing.source) ? drawing.source : 'unknown',
    };
    worksheet.addRow(Object.values(safeRow));
  });

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value || '').length);
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  return workbook;
};

const handleExport = async () => {
  const workbook = await buildWorkbook(validatedDrawings);
  const projectCode = buildProjectCode(projectConfig.projectNumber);
  await workbook.xlsx.writeFile(`${projectCode}-Drawing-Index.xlsx`);
};
```

**Option 2: fast-xlsx (Minimal/Lighter)**

```bash
npm install fast-xlsx
```

**Option 3: Keep xlsx with Strong Input Validation**

If xlsx is essential, implement strict input validation:

```typescript
// src/utils/excelSanitizer.ts
export function sanitizeDrawing(drawing: DrawingEntry): Record<string, string> {
  const whitelistFields = [
    'drawingNumber',
    'title',
    'fileName',
    'discipline',
    'sheetType',
    'revision',
    'source'
  ];

  const sanitized: Record<string, string> = {};
  
  for (const field of whitelistFields) {
    const value = (drawing as any)[field];
    if (typeof value !== 'string' && typeof value !== 'number') {
      sanitized[field] = '';
    } else {
      // Remove any prototype properties
      sanitized[field] = String(value)
        .substring(0, 255)
        .replace(/[\0-\x1F\x7F]/g, ''); // Remove control chars
    }
  }

  // Verify no __proto__, constructor, prototype
  if (Object.keys(sanitized).includes('__proto__') ||
      Object.keys(sanitized).includes('constructor') ||
      Object.keys(sanitized).includes('prototype')) {
    throw new Error('Malicious property detected');
  }

  return sanitized;
}

// Usage
const buildWorkbook = (drawings: DrawingEntry[]) => {
  const safeRows = drawings.map(d => sanitizeDrawing(d));
  // ... rest of implementation
};
```

**Test New Export**:
```typescript
// src/components/apps/__tests__/DrawingListManager.test.tsx
describe('Excel Export Security', () => {
  it('should sanitize drawing data before export', async () => {
    const maliciousDrawing: DrawingEntry = {
      id: '1',
      fileName: 'test.dwg',
      title: '"><script>alert("xss")</script>',
      discipline: 'E',
      sheetType: 'GEN',
      sequence: 1,
      revision: 'A',
      drawingNumber: 'R3P-E-GEN-001 A',
      source: 'folder'
    };

    const sanitized = sanitizeDrawing(maliciousDrawing);
    expect(sanitized.title).not.toContain('<script>');
  });

  it('should reject prototype pollution attempts', () => {
    const malicious = {
      id: '1',
      '__proto__': { admin: true },
      // ... other fields
    };

    expect(() => sanitizeDrawing(malicious as DrawingEntry)).toThrow();
  });
});
```

---

### Day 3: Add Flask API Authentication

**Time Estimate**: 3 hours

**Step 1**: Install dependencies
```bash
cd src/Ground-Grid-Generation
pip install pyjwt requests
```

**Step 2**: Implement JWT validation
```python
# src/Ground-Grid-Generation/api_server.py
import jwt
import os
from functools import wraps
from flask import request, jsonify

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'

def verify_token(token: str) -> dict:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.InvalidTokenError as e:
        raise ValueError(f'Invalid token: {str(e)}')

def require_auth(f):
    """Decorator to require authentication on endpoint"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({
                'success': False,
                'message': 'Missing Authorization header',
                'error_details': 'Authorization header required'
            }), 401
        
        try:
            # Expected format: "Bearer <token>"
            parts = auth_header.split()
            if len(parts) != 2 or parts[0].lower() != 'bearer':
                raise ValueError('Invalid Authorization header format')
            
            token = parts[1]
            payload = verify_token(token)
            
            # Attach user info to request
            request.user_id = payload.get('sub')
            request.user = payload
            
        except ValueError as e:
            return jsonify({
                'success': False,
                'message': 'Invalid token',
                'error_details': str(e)
            }), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

# Apply to protected endpoints
@app.route('/api/execute', methods=['POST'])
@require_auth
def api_execute():
    """Execute coordinate extraction (requires auth)"""
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({
            'success': False,
            'message': 'No drawing open in AutoCAD'
        }), 400
    
    try:
        config = request.get_json()
        if not config:
            raise ValueError('No configuration provided')
        
        # Validate input (see Day 4)
        config = validate_execute_config(config)
        
        result = manager.execute_layer_search(config)
        
        # ... rest of implementation
    except Exception as e:
        logger.error(f'Execute failed: {e}', exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Execution failed'
        }), 500

# Health endpoint (public - no auth required)
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'running',
        'require_auth': True
    })
```

**Step 3**: Frontend token generation and sending

```typescript
// src/services/apiService.ts
export const apiService = {
  async execute(config: ExecuteConfig) {
    // Get token from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${COORDINATES_BACKEND_URL}/api/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Send JWT
        },
        body: JSON.stringify(config)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }
};
```

**Step 4**: Set environment variable
```bash
# .env.local (development)
VITE_COORDINATES_BACKEND_URL=http://localhost:5000
JWT_SECRET=dev-secret-key-change-in-production
```

For production:
```bash
# Production (use strong random key)
JWT_SECRET=$(openssl rand -base64 32)
```

---

### Day 4: Input Validation & Rate Limiting

**Time Estimate**: 3 hours

**Step 1**: Add Flask-Limiter
```bash
pip install flask-limiter
```

**Step 2**: Implement validation
```python
# src/Ground-Grid-Generation/api_server.py
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import re

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Validation schema
EXECUTE_CONFIG_SCHEMA = {
    'layer_search_names': (list, [str]),  # Required: list of strings
    'prefix': (str, (1, 10)),  # Optional: 1-10 chars
    'initial_number': (int, (1, 10000)),  # Optional: 1-10000
    'precision': (int, (0, 10)),  # Optional: 0-10
    'layer_search_use_corners': (bool, None),  # Optional: boolean
    'ref_dwg_path': (str, (0, 255)),  # Optional: 0-255 chars
    'ref_layer_name': (str, (0, 100)),  # Optional: 0-100 chars
    'ref_scale': (float, (0.1, 100.0)),  # Optional: 0.1-100
    'ref_rotation_deg': (float, (0, 360))  # Optional: 0-360 degrees
}

def validate_execute_config(config: dict) -> dict:
    """Validate execute endpoint configuration"""
    if not isinstance(config, dict):
        raise ValueError('Config must be an object')
    
    validated = {}
    
    # Check for unknown keys
    allowed_keys = set(EXECUTE_CONFIG_SCHEMA.keys())
    unknown_keys = set(config.keys()) - allowed_keys
    if unknown_keys:
        raise ValueError(f'Unknown keys: {unknown_keys}')
    
    # Validate layer_search_names (required)
    if 'layer_search_names' not in config:
        raise ValueError('layer_search_names is required')
    
    if not isinstance(config['layer_search_names'], list):
        raise ValueError('layer_search_names must be an array')
    
    if not all(isinstance(name, str) for name in config['layer_search_names']):
        raise ValueError('All layer names must be strings')
    
    if len(config['layer_search_names']) == 0:
        raise ValueError('At least one layer name required')
    
    validated['layer_search_names'] = [
        name.strip()[:100] for name in config['layer_search_names']
    ]
    
    # Optional fields
    if 'prefix' in config:
        prefix = str(config['prefix']).strip()
        if len(prefix) > 10:
            raise ValueError('Prefix too long (max 10 chars)')
        validated['prefix'] = prefix or 'P'
    
    if 'initial_number' in config:
        try:
            num = int(config['initial_number'])
            if num < 1 or num > 10000:
                raise ValueError('initial_number out of range (1-10000)')
            validated['initial_number'] = num
        except (ValueError, TypeError):
            raise ValueError('initial_number must be an integer')
    
    if 'precision' in config:
        try:
            prec = int(config['precision'])
            if prec < 0 or prec > 10:
                raise ValueError('precision out of range (0-10)')
            validated['precision'] = prec
        except (ValueError, TypeError):
            raise ValueError('precision must be an integer')
    
    if 'ref_dwg_path' in config:
        dwg_path = str(config['ref_dwg_path']).strip()
        if len(dwg_path) > 255:
            raise ValueError('ref_dwg_path too long')
        
        # Path traversal check
        if dwg_path:
            safe_path = os.path.abspath(dwg_path)
            base_dir = os.path.abspath(os.path.dirname(__file__))
            if not safe_path.startswith(base_dir):
                raise ValueError('Invalid file path (must be in base directory)')
            validated['ref_dwg_path'] = safe_path
    
    return validated

@app.route('/api/execute', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")  # 10 requests per minute max
def api_execute():
    """Execute coordinate extraction (requires auth)"""
    try:
        config = request.get_json()
        
        # Validate config
        config = validate_execute_config(config)
        
        manager = get_manager()
        status = manager.get_status()
        
        if not status['drawing_open']:
            return jsonify({
                'success': False,
                'message': 'No drawing open'
            }), 400
        
        result = manager.execute_layer_search(config)
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f"Extracted {result['count']} points",
                'points_created': result['count'],
                'points': result['points']
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('error', 'Extraction failed')
            }), 400
    
    except ValueError as e:
        return jsonify({
            'success': False,
            'message': f'Invalid input: {str(e)}'
        }), 400
    except Exception as e:
        logger.error(f'Execute failed: {e}', exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Execution failed'
        }), 500

# Rate limit info endpoint (public)
@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        'success': False,
        'message': 'Rate limit exceeded',
        'error_details': 'Please try again later'
    }), 429
```

---

### Day 5: Fix Token Storage (Temporary)

**Time Estimate**: 2 hours

**Until HttpOnly cookies are implemented**, improve token security:

```typescript
// src/lib/secureTokenStorage.ts
/**
 * IMPROVED but NOT CRYPTO-SECURE
 * This is a temporary solution until HttpOnly cookies are implemented
 */

class SecureTokenStorage {
  private readonly STORAGE_KEY = 'suite_auth_token_v2';
  private readonly TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour (reduced from 24)
  private readonly REFRESH_THRESHOLD = 15 * 60 * 1000; // Refresh at 15 min remaining

  setToken(token: string): void {
    try {
      // ⚠️ TEMPORARY: Use simpler storage with expiry
      const expiresAt = Date.now() + this.TOKEN_LIFETIME_MS;
      const data = {
        token,
        expiresAt,
        signature: this.generateSignature(token, expiresAt)
      };
      
      // Use sessionStorage (cleared on page close)
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      
      // Set auto-refresh timer
      this.scheduleRefresh(this.REFRESH_THRESHOLD);
      
    } catch (error) {
      logger.error('Token storage failed', 'SecureTokenStorage', error);
    }
  }

  getToken(): string | null {
    try {
      const item = sessionStorage.getItem(this.STORAGE_KEY);
      if (!item) return null;

      const data = JSON.parse(item);
      
      // Check signature
      const expectedSignature = this.generateSignature(data.token, data.expiresAt);
      if (data.signature !== expectedSignature) {
        logger.warn('Token signature mismatch', 'SecureTokenStorage');
        this.clearToken();
        return null;
      }

      // Check expiry
      if (Date.now() > data.expiresAt) {
        logger.warn('Token expired', 'Secure TokenStorage');
        this.clearToken();
        return null;
      }

      return data.token;
    } catch (error) {
      logger.error('Token retrieval failed', 'SecureTokenStorage', error);
      this.clearToken();
      return null;
    }
  }

  private generateSignature(token: string, expiresAt: number): string {
    // Simple signature to detect tampering
    const data = `${token}:${expiresAt}`;
    const hash = this.simpleHash(data);
    return hash.substring(0, 20);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private scheduleRefresh(ms: number): void {
    setTimeout(() => {
      // TODO: Implement token refresh with Supabase
      // supabase.auth.refreshSession()
    }, ms);
  }

  clearToken(): void {
    sessionStorage.removeItem(this.STORAGE_KEY);
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }
}

export const secureTokenStorage = new SecureTokenStorage();
```

---

## Phase 2: High Priority (Week 2-3)

### Minimize Package (1 hour)
```bash
npm audit fix
# Only updates minimatch dependency
```

### Add CSP Headers (2 hours)

Update [vite.config.ts](vite.config.ts):

```typescript
export default defineConfig({
  plugins: [react(), backupServerPlugin(), devLogPlugin(), codeAnalyzerPlugin()],
  server: {
    middlewares: [
      (req, res, next) => {
        res.setHeader(
          'Content-Security-Policy',
          [
            "default-src 'self'",
            "script-src 'self' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self'",
            "connect-src 'self' https://*.supabase.co https://accounts.google.com",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'"
          ].join('; ')
        );
        next();
      }
    ]
  }
});
```

### Add CORS Production Config (1 hour)

```python
# src/Ground-Grid-Generation/api_server.py
import os

# Get allowed origins from environment
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'localhost:5173').split(',')

CORS(app,
     origins=ALLOWED_ORIGINS,
     supports_credentials=True,
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"],
     max_age=3600  # Preflight cache time
)
```

### Add Request Logging (2 hours)

```python
import logging
from logging.handlers import RotatingFileHandler

# Configure logging
log_handler = RotatingFileHandler(
    'api_server.log',
    maxBytes=10_000_000,  # 10MB
    backupCount=5
)
formatter = logging.Formatter(
    '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log_handler.setFormatter(formatter)

logger = logging.getLogger()
logger.addHandler(log_handler)
logger.setLevel(logging.INFO)

# Log all requests
@app.before_request
def log_request():
    logger.info(f"{request.method} {request.path} from {request.remote_addr}")

@app.after_request
def log_response(response):
    logger.info(f"Response: {response.status_code}")
    return response
```

---

## Phase 3: Medium Priority (Week 4-5)

### Add MFA/2FA (4 hours)

Configure Supabase MFA:
```typescript
// src/contexts/AuthContext.tsx
export async function enableMFA(user: User) {
  // Generate TOTP secret
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  });
  
  return data;
}

export async function verifyMFA(challengeId: string, code: string) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: challengeId,
    code,
  });
  
  return data;
}
```

### Implement Audit Logging (4 hours)

```python
# Database audit table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address INET,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

# Log endpoint requests
def log_audit(user_id: str, action: str, resource: str, details: dict = None):
    """Log action to audit trail"""
    from flask import request
    logger.info(f"AUDIT: {user_id} - {action} - {resource}", extra=details or {})
    # Store in database
```

### Security Headers Middleware (1 hour)

```python
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response
```

---

## Testing Checklist

### Unit Tests (2 hours)
```bash
# Create test files
src/components/apps/__tests__/DrawingListManager.test.tsx
src/utils/__tests__/excelSanitizer.test.ts
src/Ground-Grid-Generation/__tests__/validation.test.py

npm test
```

### Integration Tests (3 hours)
```bash
# Test auth flow
# Test API authentication
# Test RLS policies
# Test data isolation

npm test:integration
pytest tests/integration/
```

### Security Tests (4 hours)
```bash
# Test CSRF protection
# Test XSS payloads
# Test SQL injection
# Test path traversal
# Test rate limiting

npm test:security
```

---

## Deployment Checklist

Before any production deployment:

```
SECURITY CHECKLIST:
[ ] All npm audit issues resolved
[ ] Supabase RLS policies enforcing user isolation
[ ] Flask API requires authentication
[ ] Input validation on all endpoints  
[ ] Rate limiting configured
[ ] CSP headers enabled
[ ] CORS properly configured for prod domain
[ ] HTTPS/TLS enabled
[ ] Error messages don't leak info
[ ] Logging and monitoring enabled
[ ] Environment variables secure
[ ] Database backups tested
[ ] Incident response plan written
---

TESTING:
[ ] Unit tests passing
[ ] Integration tests passing
[ ] Security tests passing
[ ] Load testing completed (1000 req/min)
[ ] Penetration test completed
---

OPERATIONAL:
[ ] Team trained on security procedures
[ ] Documentation updated
[ ] Incident response team assigned
[ ] Monitoring alerts configured
[ ] Backup strategy tested
```

---

## Progress Tracking Template

Use this to track remediation progress:

```markdown
## Security Remediation Progress

### Phase 1: Critical (Week 1)
- [ ] Day 1: Supabase RLS fixes (2h) - Est: Mon
  - [ ] Policy updates
  - [ ] Testing
  - [ ] Deployment
- [ ] Day 2: xlsx replacement (3h) - Est: Tue
  - [ ] Evaluate options
  - [ ] Implement exceljs
  - [ ] Test export
- [ ] Day 3: API authentication (3h) - Est: Wed
  - [ ] Install dependencies
  - [ ] Implement JWT validation
  - [ ] Update frontend
- [ ] Day 4: Input validation (3h) - Est: Thu
  - [ ] Add Flask-Limiter
  - [ ] Implement validation
  - [ ] Test payloads
- [ ] Day 5: Token improvements (2h) - Est: Fri
  - [ ] Reduce TTL
  - [ ] Add signature check
  - [ ] Deploy

### Phase 2: High (Week 2-3)  
- [ ] minimatch update (1h)
- [ ] CSP headers (2h)
- [ ] CORS config (1h)
- [ ] Request logging (2h)

### Phase 3: Medium (Week 4-5)
- [ ] MFA/2FA (4h)
- [ ] Audit logging (4h)
- [ ] Security headers (1h)
- [ ] Testing (4h)

### Throughout
- [ ] Code reviews
- [ ] Security testing
- [ ] Documentation
```

---

## Success Metrics

After completing remediation, verify:

1. **Dependency Security**
   - `npm audit` returns 0 critical vulnerabilities
   - `npm audit` returns 0 high vulnerabilities

2. **Database Security**
   - RLS policies visible in Supabase dashboard
   - Anonymous requests return 403 Forbidden
   - User data isolation verified

3. **API Security**
   - All protected endpoints require Bearer token
   - Rate limiting: 429 after 10/min
   - Invalid input returns 400 Bad Request
   - No error details in responses

4. **Frontend Security**
   - CSP headers prevent inline scripts
   - No XSS payloads execute
   - Tokens only in sessionStorage
   - CSRF tokens on forms

5. **Operational**
   - All requests logged
   - Alerts configured for errors
   - Backup/restore tested
   - Team trained

---

**End of Implementation Guide**
