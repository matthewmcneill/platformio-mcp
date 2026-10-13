# PROJECT: Lab Simplification

## Meta
- **Base Branch:** `fix/v3.1.0-local-patches` (our fork's patched v3.1.0)
- **Remote:** `fork` (github.com/matthewmcneill/platformio-mcp)
- **Upstream Issues:** #40, #27, #39
- **Status:** COMPLETE — all 3 WOs executed, committed, pushed to fork
- **User Approval:** 2026-10-13T21:08 — user approved decomposition ("proceed")

- **Created:** 2026-10-13

## Objective

Reduce the lab infrastructure friction that blocks single-user desk workflows. Three stacked PRs targeting the fork, each independently mergeable:

1. **PR1 — Standalone Profile** (#40): Add a `standalone` policy profile that allows all operations without approvals, and conditionally bypasses target resolution when the caller supplies explicit `environment` + `port`.
2. **PR2 — Fix `extends` INI Parsing** (#27): Make `parseTargetEnvironments` resolve PlatformIO's `extends` inheritance so environments inheriting `board` from a parent don't fail with "does not declare a board".
3. **PR3 — Fix ESP32-S3 CDC Resolution** (#39): Add Espressif native USB VID:PIDs, filter macOS noise ports, and accept `uploadPort`/`upload_port` parameter aliases.

## Conflict Analysis

| WO | Files Touched | Overlaps With |
|----|---------------|---------------|
| WO1 | `types.ts` (PolicyProfileName), `policy-schema.ts`, `profiles.ts`, `flash.ts`, `tests/policy-profile.test.ts` | WO3 touches `types.ts` but a different schema (UploadFirmwareParams) |
| WO2 | `target-resolution.ts` (parseTargetEnvironments), `agent.ts` (parseEnvironmentsFromIni), new test file | WO3 touches `target-resolution.ts` but different functions (device filtering) |
| WO3 | `types.ts` (UploadFirmwareParams), `hardware-maps.ts`, `target-resolution.ts` (device filter), new test additions | — |

**Decision: Serialize as a linear stack** (WO1 → WO2 → WO3). The `types.ts` and `target-resolution.ts` overlaps make parallel execution risky. Stacking is clean — each WO builds on the prior.

## Work Order Ledger

- **[x] [wo1-standalone-profile](wo1-standalone-profile/WORKORDER.md):** Add `standalone` policy profile + bypass target resolution when env+port explicit. *PR1: Standalone Profile*
- **[x] [wo2-extends-parsing](wo2-extends-parsing/WORKORDER.md):** Fix `parseTargetEnvironments` to resolve `extends` inheritance + fix duplicate parser in `agent.ts`. *PR2: Extends INI Parsing*
- **[x] [wo3-esp32s3-cdc](wo3-esp32s3-cdc/WORKORDER.md):** Add Espressif VID:PIDs, filter macOS noise ports, accept `uploadPort` aliases. *PR3: ESP32-S3 CDC Resolution*

## Modules & Components

| Module | Path | Touched By |
|--------|------|------------|
| Policy Types | `src/core/policy/types.ts` | WO1 |
| Policy Schema | `src/core/policy/policy-schema.ts` | WO1 |
| Policy Profiles | `src/core/policy/profiles.ts` | WO1 |
| Flash Core | `src/core/flash.ts` | WO1 |
| Target Resolution | `src/core/target-resolution.ts` | WO2, WO3 |
| Agent Tools | `src/tools/agent.ts` | WO2 |
| MCP Types | `src/types.ts` | WO3 |
| Hardware Maps | `src/utils/hardware-maps.ts` | WO3 |

## Session Log

### 2026-10-13 — Initial Planning
- Evaluated all 6 lab subsystems (policy, locks, leasing, target resolution, enrollment, approvals) in [lab-infrastructure-evaluation.md](../../../lab-infrastructure-evaluation.md).
- Identified 5 of 8 upstream issues caused by lab friction.
- Research confirmed: `standalone` profile requires touching 3 files (types, schema, profiles) + 1 conditional bypass in `flash.ts`. INI parser bug is in `parseTargetEnvironments` (lines 76-114) with a duplicate parser in `agent.ts` (lines 101-128). ESP32-S3 bug has 4 root causes: missing VID:PID `303A:1001`, macOS noise port `/dev/cu.debug-console` not filtered, `uploadPort` stripped by Zod, no Espressif pattern in boardPatterns.
