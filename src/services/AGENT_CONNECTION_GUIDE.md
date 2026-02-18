# Agent Service Connection Guide

This guide explains how to connect Suite's frontend to the ZeroClaw agent (Koro).

## Architecture

```
AgentPanel (React)
    ↓ (calls)
agentService.ts (TypeScript bridge)
    ↓ (HTTP POST requests)
ZeroClaw Gateway (http://127.0.0.1:3000)
    ↓ (processes)
Koro Agent (AI, gpt-4-turbo)
    ↓ (returns)
Solution (Python code, analysis, files)
```

## How Connection Works

### Step 1: Start Agent
```bash
zeroclaw gateway
# Returns pairing code like: 123456
```

### Step 2: Pair in Suite
User enters pairing code in AgentPanel → calls `agentService.pair(code)`

### Step 3: Agent Processes Requests
AgentPanel buttons call methods → agentService sends HTTP → agent responds

## Implementation Steps (for Bolt)

### 1. **Update `/src/services/agentService.ts`**

Create a class that:
- Stores gateway URL (`http://127.0.0.1:3000/gateway`)
- Stores bearer token after pairing
- Implements all 7 main methods
- Handles errors and timeouts

```typescript
class AgentService {
  private baseUrl = 'http://127.0.0.1:3000/gateway';
  private token: string | null = null;

  async pair(code: string): Promise<boolean> {
    // POST /gateway/pair
    // Response: { token, agentId }
  }

  async sendMessage(msg: string): Promise<AgentResponse> {
    // POST /gateway/message with Bearer token
    // Response: { response, status }
  }

  // ... other methods
}
```

### 2. **Update `/src/components/AgentPanel.tsx`**

Wire up button handlers:
```tsx
const handleAnalyzeDrawings = async () => {
  setLoading(true);
  const result = await agentService.analyzeDrawingList(filePath);
  setResult(result);
  setLoading(false);
};
```

### 3. **Use Types from `/src/types/agent.ts`**

Import and use defined interfaces:
```typescript
import type { AgentResponse, DrawingListAnalysisResult } from '../types/agent';
```

## Gateway Endpoints

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| Pair | `POST /gateway/pair` | `{ pairingCode }` | `{ token, agentId }` |
| Message | `POST /gateway/message` | `{ message }` | `{ response, status }` |
| Execute | `POST /gateway/execute-tool` | `{ toolName, arguments }` | `{ success, data }` |

## Error Handling

```typescript
try {
  const result = await agentService.analyzeDrawingList(path);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Agent taking too long
  } else if (error.code === 'UNPAIRED') {
    // Not paired yet
  } else if (error.code === 'NETWORK') {
    // Agent not running
  }
}
```

## Testing Connection

```bash
# 1. Verify agent is running
curl http://127.0.0.1:3000/health

# 2. Test pairing
curl -X POST http://127.0.0.1:3000/gateway/pair \
  -H "Content-Type: application/json" \
  -d '{"pairingCode":"123456"}'

# 3. Test message
curl -X POST http://127.0.0.1:3000/gateway/message \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, agent!"}'
```

## Environment Variables

Add to `.env`:
```
VITE_AGENT_GATEWAY_URL=http://127.0.0.1:3000
VITE_AGENT_TIMEOUT_MS=30000
VITE_AGENT_RETRY_ATTEMPTS=3
```

## Debugging Tips

1. **Agent not responding?**
   - Check if `zeroclaw gateway` is running
   - Check agent logs: `~/.zeroclaw/workspace/sessions/`

2. **Pairing code invalid?**
   - Code expires after 10 minutes
   - Get new code by restarting: `zeroclaw gateway`

3. **Token expired?**
   - Clear localStorage: `localStorage.removeItem('agentToken')`
   - Re-pair with new code

4. **Task taking too long?**
   - Check agent memory usage: `ps aux | grep zeroclaw`
   - Review task complexity
   - Increase timeout if needed

## Full Documentation

See:
- **[BOLT_AGENT_INTEGRATION_PROMPT.md](../BOLT_AGENT_INTEGRATION_PROMPT.md)** - Complete spec with acceptance criteria
- **[src/types/agent.ts](../types/agent.ts)** - All TypeScript interfaces
- **[src/components/AgentPanel.tsx](../components/AgentPanel.tsx)** - UI component to wire up

## What Bolt Needs to Do

1. ✅ Read agentService.ts and replace stub methods with real HTTP calls
2. ✅ Wire up AgentPanel button handlers to call agentService methods
3. ✅ Add loading/error states to UI
4. ✅ Format and display results
5. ✅ Test pairing flow end-to-end
6. ✅ Test each main task (analyze, generate, etc.)

## Success Criteria

- [ ] Pairing flow works (enter code, get connected)
- [ ] All 7 buttons are functional
- [ ] Results display in UI
- [ ] Errors show helpful messages
- [ ] Loading states work
- [ ] Handles agent crashes gracefully
- [ ] TypeScript no errors
- [ ] No console errors
