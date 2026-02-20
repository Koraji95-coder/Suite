# Suite - Engineering Intelligence Platform

**r3pSuite**: Comprehensive electrical standards and drawing management system with integrated autonomous AI capabilities.

## 🚀 Quick Links

- **[Zero Agent Setup](AGENT_QUICK_START.md)** - Enable autonomous AI analysis of drawing lists
- **[Security Audit](SECURITY_AUDIT_REPORT.md)** - Full vulnerability analysis and remediation
- **[Implementation Status](IMPLEMENTATION_COMPLETE.md)** - Detailed changelog of fixes and improvements
- **[ZeroClaw Architecture](zeroclaw-main/README.md)** - Autonomous AI agent framework documentation

## ✨ Key Features

### Core Functionality
- 📋 Complete drawing list management
- ⚡ Electrical standards compliance checking
- 🎨 Ground grid generation and visualization
- 📊 Project workspace organization
- 🔐 Role-based access control with Supabase

### AI-Powered Capabilities (via ZeroClaw)
- 🤖 **Autonomous Analysis** - Agent-driven analysis of drawing lists against IEEE standards
- 📚 **Smart Learning** - Learns your company's electrical standards
- 🔍 **Standards Research** - Automatic research and compliance verification
- 💾 **Code Generation** - Generates Python tools and Excel templates
- 🎯 **Self-Improvement** - Agent analyzes and improves its own performance

## 📖 Getting Started

### 1. Standard Setup
```bash
npm install
npm run dev
```

### 2. Enable Zero Agent (Optional but Recommended)
See [AGENT_QUICK_START.md](AGENT_QUICK_START.md) for:
- API key setup (OpenRouter, OpenAI, Anthropic, etc.)
- 30-second automated onboarding
- Autonomous drawing list analysis

### 3. Run Security Hardening
See [SECURITY_REMEDIATION_GUIDE.md](SECURITY_REMEDIATION_GUIDE.md) to:
- Address critical vulnerabilities (xlsx, API key defaults)
- Implement error handling improvements
- Configure security headers

## 🏗️ Project Structure

```
Suite/
├── src/                          # TypeScript React application
│   ├── components/               # React components
│   ├── services/                 # API + agent communication
│   ├── contexts/                 # State management
│   ├── Ground-Grid-Generation/   # CAD integration + coordinate extraction
│   ├── pages/                    # Route pages
│   └── lib/                      # Utilities + Supabase
├── zeroclaw-main/                # Autonomous AI agent framework (Rust)
├── supabase/                     # Database migrations + RLS policies
├── scripts/                      # Build + setup scripts
├── analysis_outputs/             # Agent analysis results
└── vite.config.ts                # Project configuration
```

## 🔒 Security

Suite implements comprehensive security controls:
- **Database**: Row-level security (RLS) via Supabase
- **API**: X-API-Key authentication for all endpoints
- **Frontend**: Content Security Policy (CSP) headers
- **Rate Limiting**: 200/day, 50/hour per user
- **Type Safety**: Full TypeScript strict mode

See [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) for detailed security analysis.

## 📚 Documentation

- **[AGENT_QUICK_START.md](AGENT_QUICK_START.md)** - Zero Agent setup and integration
- **[AGENT_CAPABILITIES.md](AGENT_CAPABILITIES.md)** - What the agent can do
- **[SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md)** - Complete security analysis
- **[SECURITY_REMEDIATION_GUIDE.md](SECURITY_REMEDIATION_GUIDE.md)** - How to fix vulnerabilities
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - Detailed changelog

## 🛠️ Tech Stack

**Frontend**
- React 19 with TypeScript
- Vite for fast builds
- Tailwind CSS for styling
- D3 + Three.js for visualization
- Supabase for database

**Backend (Optional)**
- Python Flask for AutoCAD integration
- WebSocket for real-time coordinate extraction
- Node.js for build scripts

**AI Agent**
- ZeroClaw (Rust) for autonomous reasoning
- 23+ LLM provider support (OpenAI, Anthropic, OpenRouter, etc.)
- Memory and tool execution capabilities

## 🤝 Contributing

1. Check [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) for known issues
2. Follow TypeScript strict mode conventions
3. Update relevant documentation in docs/ folder
4. Run security checks before committing

## 📝 License

See LICENSE file for details.

---

**Ready to get started?** Check [AGENT_QUICK_START.md](AGENT_QUICK_START.md) to enable Zero Agent in 30 seconds!
