---
name: lab-simplification-wo3
description: Handoff instructions for Work Order 3 — Fix ESP32-S3 CDC target resolution
complexity: standard
---

# WO3 — Fix ESP32-S3 CDC Target Resolution (Issue #39)

## Role Definition
> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

## Objective
Fix `upload_firmware` and `agent_resolve_target` so ESP32-S3 boards with native USB CDC (`VID:PID=303A:1001`) are correctly detected and resolved. This involves 4 distinct root causes that all must be addressed.

## Context
ESP32-S3/C3/C6/H2 boards using Espressif's native USB JTAG/serial debug unit are invisible to the target resolution system because:
1. `303A:1001` is missing from `vidPidDatabase`
2. macOS enumerates `/dev/cu.debug-console` which breaks single-device fallback (`devices.length === 1` check)
3. `uploadPort` parameter is stripped by Zod (schema only defines `port`)
4. No Espressif board pattern exists in `boardPatterns`

An existing noise port regex `NOISE_PORT_HINT` already exists in `src/adapters/device-compat.ts:31` but is not used in target resolution.

## Strict Boundary Box
- **DO NOT** modify policy engine files.
- **DO NOT** modify `parseTargetEnvironments` or `extends` handling — that was WO2.
- **DO NOT** change lock management, serial sessions, or dashboard UI.
- Scope: hardware maps, device filtering in target resolution, and Zod parameter schemas.

## Tooling Constraints
- Use `npx tsc --noEmit` for type checking.
- Use `npx vitest run tests/target-resolution.test.ts tests/hardware-maps.test.ts` for relevant tests (create `hardware-maps.test.ts` if it doesn't exist).
- Use `npm run build` for final build verification.

## Line-Item Instructions

- [ ] **`src/utils/hardware-maps.ts` — `vidPidDatabase` (lines 15-30):**
  Add Espressif native USB entries:
  ```typescript
  "303a:1001": {
    boards: ["esp32-s3-devkitc-1", "esp32s3box", "esp32-s3-devkitm-1"],
    confidence: "high",
  },
  "303a:1002": {
    boards: ["esp32-s2-saola-1"],
    confidence: "high",
  },
  "303a:0002": {
    boards: ["esp32-s2-saola-1"],
    confidence: "medium",
  },
  ```
  **Important:** VID:PID keys must be lowercase (the lookup normalises to lowercase).

- [ ] **`src/utils/hardware-maps.ts` — `boardPatterns` (lines 35-78):**
  Add an Espressif USB JTAG pattern:
  ```typescript
  {
    patterns: [/USB JTAG\/serial debug unit/i, /Espressif/i],
    boardType: "ESP32-S3/C3",
    boards: ["esp32-s3-devkitc-1", "esp32-c3-devkitm-1"],
  },
  ```

- [ ] **`src/core/target-resolution.ts` — Device noise filter (lines 264-267):**
  Replace the current Bluetooth-only filter with a comprehensive noise port filter. Reference the existing `NOISE_PORT_HINT` regex from `src/adapters/device-compat.ts`:
  ```typescript
  const NOISE_PORT_PATTERN = /bluetooth|blth|debug-console|jabra|airpods|iphone/i;
  const devices = (discoveredDevices ?? (await listDevicesCore())).filter(
    (device) => {
      if (NOISE_PORT_PATTERN.test(device.port)) return false;
      if (device.hwid === "n/a" && device.description === "n/a") return false;
      return true;
    },
  );
  ```
  This ensures `/dev/cu.debug-console` is excluded, fixing the `devices.length === 1` single-device fallback.

- [ ] **`src/types.ts` — `UploadFirmwareParamsSchema` (lines 557-601):**
  Add `uploadPort` and `upload_port` as optional aliases and transform them onto `port`:
  ```typescript
  export const UploadFirmwareParamsSchema = z
    .object({
      projectDir: z.string().min(1).describe("Path to the PlatformIO project directory"),
      port: z.string().optional().describe("Upload port (auto-detected if not specified)"),
      uploadPort: z.string().optional().describe("Upload port alias (mapped to port)"),
      upload_port: z.string().optional().describe("Upload port alias (mapped to port)"),
      environment: z.string().optional().describe("PlatformIO environment name"),
      // ... keep all other existing fields ...
    })
    .transform((data) => ({
      ...data,
      port: data.port ?? data.uploadPort ?? data.upload_port,
    }));
  ```
  **Important:** Also check `UploadFilesystemParamsSchema` (around line 605) and apply the same alias pattern if it has the same issue.

- [ ] **`src/core/target-resolution.ts` — Port normalization (lines 268-275):**
  Normalize `/dev/tty.*` to `/dev/cu.*` when matching ports on macOS:
  ```typescript
  const normalizePort = (p: string) =>
    p.replace(/^\/dev\/tty\./, "/dev/cu.");

  let candidates = input.port
    ? devices.filter(
        (d) => normalizePort(d.port) === normalizePort(input.port!),
      )
    : devices.filter(
        (d) =>
          d.detectedBoard?.toLowerCase() ===
          selectedEnvironment?.board?.toLowerCase(),
      );
  ```

- [ ] **Tests — Add test cases for the new VID:PID entries and noise filtering:**
  1. Test: `mapVidPidToBoard("USB VID:PID=303A:1001", "USB JTAG/serial debug unit")` returns boards containing an ESP32-S3 variant.
  2. Test: Device list with `/dev/cu.usbmodem101` (ESP32-S3) + `/dev/cu.debug-console` (macOS noise) → after filtering, only the ESP32-S3 remains.
  3. Test: `UploadFirmwareParamsSchema.parse({ projectDir: "/tmp", uploadPort: "/dev/cu.usbmodem101" })` produces `port === "/dev/cu.usbmodem101"`.

## Verification Requirement
1. `npx tsc --noEmit` must pass.
2. All relevant test files must pass.
3. `npm run build` must complete cleanly.
4. Before committing, ask the user if they are happy with the changes.

## Issue Surfacing
If you discover a defect, upstream bug, or concern outside your boundary box, surface it in your Completion Report below — do not file issues directly.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
(pending)

### Changes Made
(pending)

### Decisions Made
(pending)

### Dead Ends & Warnings
(pending)

### Out-of-Scope Findings
(pending)

### Blockers
(pending)
