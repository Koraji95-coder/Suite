# BOLT IMPLEMENTATION PROMPT
# Connect AgentPanel to Live ZeroClaw Agent

## TASK: Integrate AgentPanel Component with Live ZeroClaw Agent

**PROJECT:** Suite - Electrical Engineering Project Management App  
**AGENT:** ZeroClaw/Koro (locally running at http://127.0.0.1:3000/gateway)  
**COMPONENT:** AgentPanel.tsx - React UI for agent interaction

---

## CONTEXT

### 1. CURRENT STATE:
- AgentPanel.tsx created at: `/workspaces/Suite/src/components/AgentPanel.tsx`
- agentService.ts created at: `/workspaces/Suite/src/services/agentService.ts`
- ZeroClaw agent running locally with gateway at `http://127.0.0.1:3000`
- Agent name: "Koro" (gpt-4-turbo, config at `/home/codespace/.zeroclaw/config.toml`)

### 2. EXISTING IMPLEMENTATION:
- AgentPanel has UI buttons for various tasks (AutoCAD, Drawing List, etc.)
- agentService has skeleton methods ready to call agent
- Pairing flow already in place
- Component renders correctly but buttons are NOT wired to agent

### 3. WHAT'S MISSING:
- agentService methods don't actually call the agent
- No error handling for agent communication
- No loading states for long-running tasks
- Results not formatted for display
- Gateway URL hardcoded (should be configurable)

---

## REQUIREMENTS

### 1. IMPLEMENT agentService.ts METHODS

These methods exist but are stubs - implement them to call ZeroClaw:

**`pair(pairingCode: string): Promise<boolean>`**
- Make POST to `/gateway/pair` with pairing code
- Store returned token in localStorage
- Return true if successful

**`sendMessage(message: string): Promise<AgentResponse>`**
- Send user message to agent
- Stream or get response from agent
- Return AgentResponse with result

**`executePythonScript(scriptPath: string, args?: string[]): Promise<AgentResponse>`**
- Call agent's python executor tool
- Pass file path and arguments
- Return execution result

**`generateFloorPlan(projectId: string): Promise<AgentResponse>`**
- Ask agent to generate floor plan for project
- Return SVG or image data

**`analyzeDrawingList(filePath: string): Promise<AgentResponse>`**
- Send drawing list file to agent for analysis
- Return validation results and corrections

**`generateTransmittal(drawingIds: string[]): Promise<AgentResponse>`**
- Generate transmittal from drawing list
- Return transmittal document path or data

**`analyzeProject(projectId: string): Promise<AgentResponse>`**
- Comprehensive project analysis
- Return insights and recommendations

### 2. ERROR HANDLING:
- Handle network errors (agent not running)
- Handle timeout errors (long-running tasks)
- Handle malformed responses
- Show user-friendly error messages
- Retry logic for failed requests
- Log errors to console for debugging

### 3. LOADING STATES:
- Show loading spinner while agent processes
- Disable buttons during execution
- Show progress for long tasks (>5 seconds)
- Allow cancellation of running tasks

### 4. RESULT FORMATTING:
- Parse agent JSON responses
- Handle text/file/binary results differently
- Display tables for structured data
- Show code with syntax highlighting
- Preview images/PDFs inline

### 5. CONFIGURATION:
- Read AGENT_GATEWAY_URL from env or config
- Default to `http://127.0.0.1:3000/gateway`
- Allow override via environment variable
- Validate URL on startup

---

## TECHNICAL DETAILS

### GATEWAY ENDPOINT STRUCTURE

Base URL: `http://127.0.0.1:3000`

**`POST /gateway/pair`**
```json
Request: { "pairingCode": "string" }
Response: { "token": "string", "agentId": "string" }
```

**`POST /gateway/message`**
```
Headers: { "Authorization": "Bearer <token>" }
Request: { "message": "string" }
Response: { "id": "string", "response": "string", "status": "complete" | "running" }
```

**`POST /gateway/execute-tool`**
```
Headers: { "Authorization": "Bearer <token>" }
Request: { "toolName": "string", "arguments": {...} }
Response: { "success": boolean, "data"?: any, "error"?: string }
```

### AGENT COMMUNICATION FLOW
1. User clicks button in AgentPanel
2. onClick handler calls agentService method
3. Service builds request object
4. Sends HTTP POST to `/gateway/{endpoint}`
5. Agent processes (may take seconds to minutes)
6. Returns JSON response
7. Service parses response
8. Component displays result

### AVAILABLE AGENT TOOLS
- `python_executor`: Execute Python scripts
- `browser`: Search internet (if enabled)
- `file_reader`: Read files in workspace
- `memory`: Store/recall project patterns
- `git`: Access repository

---

## IMPLEMENTATION CHECKLIST

### PHASE 1: CORE CONNECTIVITY
- [ ] Verify ZeroClaw gateway is accessible at startup
- [ ] Implement pair() method with token storage
- [ ] Implement sendMessage() with error handling
- [ ] Test pairing flow in UI
- [ ] Add connection status indicator

### PHASE 2: API METHODS
- [ ] Implement executePythonScript()
- [ ] Implement generateFloorPlan()
- [ ] Implement analyzeDrawingList()
- [ ] Implement generateTransmittal()
- [ ] Implement analyzeProject()
- [ ] Test each method with actual agent

### PHASE 3: UI/UX
- [ ] Add loading spinners
- [ ] Implement error display
- [ ] Format results for readability
- [ ] Add syntax highlighting for code
- [ ] Add file/image preview support
- [ ] Add "Copy Result" button
- [ ] Add "Save Result" functionality

### PHASE 4: ROBUSTNESS
- [ ] Add request timeout handling (30 seconds max)
- [ ] Implement retry logic (3 attempts)
- [ ] Handle streaming responses
- [ ] Add offline detection
- [ ] Add activity logging
- [ ] Monitor for API changes

---

## ACCEPTANCE CRITERIA

✓ AgentPanel displays connection status (connected/disconnected)  
✓ Pairing flow works end-to-end  
✓ All 7 main buttons wire up to agent methods  
✓ Loading states display while processing  
✓ Results display formatted and readable  
✓ Errors show helpful messages  
✓ Component handles agent crashes gracefully  
✓ Works with current ZeroClaw gateway setup  
✓ Code has JSDoc comments  
✓ No console errors  
✓ TypeScript strict mode compliance

---

## REFERENCES

- See `/src/services/AGENT_CONNECTION_GUIDE.md` for step-by-step instructions
- See `/src/types/agent.ts` for TypeScript interface definitions
- See `/src/components/AgentPanel.tsx` for UI component to wire up
