# Design Specification: Autonomous PlatformIO MCP Server

## [Overview]

We are extending the `jl-codes/platformio-mcp` baseline repository into a stateful, highly intelligent Model Context Protocol (MCP) server. 

The baseline serves as a universal bridge wrapping the PlatformIO CLI, providing access to 1,000+ embedded development boards and basic project orchestration. However, to operate within an autonomous AI agent environment (such as Google Antigravity) without severe token-exhaustion or port collision issues, the server architecture is being enhanced with four primary structural tenets:

1. **Token-Optimized Build Pipeline:** Stripping verbose GCC output on successful compilations and returning strictly structured metrics (RAM/Flash).
2. **Intelligent Diagnostics:** Capturing full linker and compiler dumps upon failure, and routing them through regex matchers to isolate the exact cause, minimizing the payload size returned to the LLM. 
3. **In-Memory Serial Port Management:** Enforcing sequential access to physical `tty` ports using an internal Singleton, preventing `Upload` failures and bypassing host OS file-locking hacks.
4. **Active Bound-Time Serial Monitoring:** Reading serial logs directly within the Node.js server thread asynchronously, allowing automated system debugging.

---

## [Types]

TypeScript interfaces and Zod schemas define the rigorous structured I/O for the MCP operations.

**Board & Project Types:**
```typescript
interface BoardInfo {
  id: string; // "esp32dev"
  name: string;
  platform: string;
  mcu: string;
  frequency: string;
  flash: number;
  ram: number;
  frameworks?: string[];
}

interface ProjectConfig {
  board: string;
  framework?: string;
  projectDir?: string;
}
```

**Diagnostic Types (Agentic Upgrade):**
```typescript
interface DiagnosticSummary {
  errorType: 'MissingHeader' | 'MemoryOverflow' | 'PortBusy' | 'SyntaxError' | 'Unknown';
  summary: string;
  truncatedStderr: string;
}
```

**Execution Types (Agentic Upgrade):**
```typescript
interface SerialDevice {
  port: string;
  description: string;
  hwid: string; // The raw VID:PID string
  detectedBoard?: string; // Human-readable mapping if recognized
}

interface BuildResult {
  success: boolean;
  environment: string;
  ramUsageBytes?: number;     // Extracted upon successful exitCode 0
  flashUsageBytes?: number;   // Extracted upon successful exitCode 0
  diagnostics?: DiagnosticSummary; // Supplied if exitCode != 0
  rawOutput?: string;         // Used only in fallback or verbose mode
}

interface UploadResult {
  success: boolean;
  port?: string;
  diagnostics?: DiagnosticSummary;
}

interface MonitorResult {
  success: boolean;
  bufferOutput: string;      // Sampled log chunks
  panicTriggered: boolean;   // True if ESP32 guru meditation/crash detected during sample
}
```

---

## [Files]

The architecture incorporates the baseline abstractions, augmented with our stateful features.

**Core Definitions:**
1. **`src/index.ts`** - Main entry point, stdio transport, tool registry.
2. **`src/types.ts`** - All definitions and zod schemas.
3. **`src/platformio.ts`** - Exec layer wrapping `child_process.execFile`.

**Implementation Tools:**
4. **`src/tools/boards.ts`** - `list_boards`, `get_board_info`
5. **`src/tools/devices.ts`** - `list_devices`
6. **`src/tools/projects.ts`** - `init_project` 
7. **`src/tools/build.ts`** - **[MODIFIED]** `build_project`, `clean_project` (incorporates regex RAM/Flash stripping)
8. **`src/tools/upload.ts`** - **[MODIFIED]** `upload_firmware` (co-opts `SerialManager` mutex logic)
9. **`src/tools/monitor.ts`** - **[MODIFIED]** Replaces instructional string output with active `serialport` reading.
10. **`src/tools/libraries.ts`** - Library management.

**Utilities & Automation (Agentic Upgrades):**
11. **`src/utils/validation.ts`** - Input path validation and sanitization.
12. **`src/utils/errors.ts`** - Standardizes API exceptions.
13. **`src/utils/diagnostics.ts`** - **[NEW]** Contains C++/PlatformIO regex matchers (Portions adapted from `@toponextech/smartembed-mcp-server` under MIT attribution) for categorizing build errors.
14. **`src/utils/hardwareMaps.ts`** - **[NEW]** Contains USB VID:PID dictionary to enrich hardware IDs into human-readable board names.
15. **`src/utils/SerialManager.ts`** - **[NEW]** Singleton tracking `tty` port states across operations.

---

## [Functions]

Crucial function logic for achieving autonomous bridging:

**Device Recognition (src/tools/devices.ts):**
*   `listDevices(): Promise<SerialDevice[]>` - Scans `tty` ports and automatically cross-references `hwid` against the `hardwareMaps.ts` database to populate the `detectedBoard` string.

**Intelligent Execution (src/tools/build.ts):**
*   `buildProject(path): Promise<BuildResult>` - Silences native stdout. Traps exitCode `0` to parse `RAM: X bytes` logs. On failure, passes `stderr` directly into `diagnoseError()`.

**In-Memory Locking (src/tools/upload.ts):**
*   `uploadFirmware(path, port): Promise<UploadResult>` - Validates upload targets securely. MUST execute `SerialManager.lockPort(port)` before compilation begins, and release it in the finalizer.

**Stateful Monitoring (src/tools/monitor.ts):**
*   `readSerial(port, baud, durationSeconds): Promise<MonitorResult>` - Binds a Node.js `serialport` receiver to the socket. Buffers the output for `durationSeconds`, instantly breaking validation and returning `panicTriggered = true` if `abort()` or `Guru Meditation Error` is identified in the steam.

**Diagnostics Extraction (src/utils/diagnostics.ts):**
*   `diagnoseError(stderr: string): DiagnosticSummary` - Iterates over constant REGEX dictionary arrays to formulate context-aware crash summaries.

---

## [Classes]

**Main Orchestrator:**
*   `class PlatformIOServer` - Handles the Stdio Transport binding and SDK dispatch.

**In-Memory Semaphore (Agentic Upgrade):**
*   **`class SerialManager`** (Singleton)
    *   `Map<string, boolean> activeLocks`
    *   `lockPort(port: string): void` (Throws `PortBusy` if already claimed)
    *   `unlockPort(port: string): void`
    *   `isLocked(port: string): boolean`

---

## [Dependencies]

**Production Assets:**
*   `@modelcontextprotocol/sdk@^0.5.0`
*   `zod@^3.22.0` (Validation Engine)
*   **`serialport`** (Required for asynchronous Node.js monitoring tools)

**Development Assets:**
*   `typescript`, `tsx`, `vitest`

---

## [Implementation Order]

We proceed on the assumption that the `jl-codes/platformio-mcp` base has been cloned and instantiated locally.

**Phase 1: Architecture Refactoring Setup**
1. Ensure dependencies (specifically `npm install serialport`) and `@types/serialport` are loaded into the project configuration.
2. Initialize and configure the TypeScript compilation system.

**Phase 2: Establish Muxing and Diagnostic Core**
3. Create `SerialManager.ts` to expose the lock singleton. 
4. Create `diagnostics.ts` containing the standard array of compiler regex filters and header checks. Include the mandatory MIT License header attribution.

**Phase 3: Rewiring the Handlers**
5. Modify `src/tools/upload.ts` to implement the `SerialManager` guards.
6. Modify `src/tools/build.ts` to truncate positive output streams to `BuildResult` objects. Connect failure clauses to `diagnoseError()`.

**Phase 4: Replacing The Monitor Tool**
7. Rewrite `src/tools/monitor.ts` logic utilizing the robust `serialport` APIs. Wire in the `durationSeconds` polling capability and panic string listeners. 

**Phase 5: Agent-Driven Validation**
8. Unit test the structural changes via TS typechecking. Use mock firmware directories to execute positive tests ensuring token-reduction happens as defined by the structural definitions.