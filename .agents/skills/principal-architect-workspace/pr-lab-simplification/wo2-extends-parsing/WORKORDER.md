---
name: lab-simplification-wo2
description: Handoff instructions for Work Order 2 — Fix extends INI parsing
complexity: standard
---

# WO2 — Fix `extends` INI Parsing (Issue #27)

## Role Definition
> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

## Objective
Fix `parseTargetEnvironments()` in `target-resolution.ts` so that PlatformIO environments using `extends = env:base` (or `extends = base, common`) correctly inherit the `board` field from their parent. Also fix the duplicate parser `parseEnvironmentsFromIni()` in `agent.ts`.

## Context
PlatformIO supports INI-style inheritance where a child `[env:child]` can declare `extends = env:parent` to inherit all settings. The current custom parser ignores the `extends` key entirely, causing `resolveTarget` to fail with `"Environment 'child' does not declare a board"` — even though `pio run` works fine.

A guard was added at lines 194–208 of `target-resolution.ts` (commit `22a9d73b`) that detects `extends` and delegates to `getProjectConfig()`. However, `parseTargetEnvironments` itself remains broken when called directly, and a duplicate parser in `agent.ts` (`parseEnvironmentsFromIni`, lines 101–128) is still used by `agent_validate_project` and `inferBoardIdForProject`.

## Strict Boundary Box
- **DO NOT** modify `src/utils/hardware-maps.ts` or `src/types.ts` — those are WO3.
- **DO NOT** modify policy engine files (`profiles.ts`, `types.ts` policy types, `evaluate-policy.ts`).
- **DO NOT** change how `resolveTarget` calls `getProjectConfig` (the async fallback is fine to keep).
- **DO NOT** modify device filtering or VID:PID matching — that is WO3.
- Scope is strictly: INI text parsing and `extends` inheritance resolution.

## Tooling Constraints
- Use `npx tsc --noEmit` for type checking.
- Use `npx vitest run tests/target-resolution.test.ts` for target resolution tests.
- Use `npm run build` for final build verification.

## Line-Item Instructions

- [ ] **`src/core/target-resolution.ts` — `TargetEnvironment` interface (around line 22-26):**
  Add an optional `extends` field:
  ```typescript
  export interface TargetEnvironment {
    name: string;
    board?: string;
    framework?: string;
    extends?: string[];
  }
  ```

- [ ] **`src/core/target-resolution.ts` — `parseTargetEnvironments()` (lines 76-114):**
  1. **Capture `extends`:** After the existing `board` and `framework` checks (around line 106-110), add:
     ```typescript
     } else if (active && key === "extends") {
       active.extends = value.split(",").map(v => v.trim().replace(/^env:/i, "")).filter(Boolean);
     }
     ```
  2. **Capture non-env sections as potential parents:** Modify the section regex (line 88) to also capture `[base]`, `[common]`, `[env]` (the global env section). Store these in a separate lookup map (e.g. `baseSections: Record<string, { board?: string; framework?: string }>`) so they can be resolved by name.
     - Alternative: use a second regex: `const baseSection = /^\[([^\]]+)\]$/u.exec(line);` and only store `board`/`framework` from non-`env:` sections.
  3. **Resolve inheritance after parsing:** After the main parse loop, iterate over environments. For any env with `extends`, walk the chain (with cycle detection via a `Set`), copying `board` and `framework` from the first ancestor that defines them. Lookup order: named environments first, then base sections.

- [ ] **`src/tools/agent.ts` — `parseEnvironmentsFromIni()` (lines 101-128):**
  Refactor to either:
  - **Option A (preferred):** Delete `parseEnvironmentsFromIni` and import+use `parseTargetEnvironments` from `target-resolution.ts` instead. Adapt the callers at lines 260, 274-279 (`agent_validate_project`) and lines 706, 738 (`inferBoardIdForProject`) to use the `TargetEnvironment[]` return type.
  - **Option B:** Apply the same `extends` fix inline (not preferred — duplicate code).

- [ ] **`tests/target-resolution.test.ts` — Add `extends` test cases:**
  1. Test: INI with `[env:base]` defining `board = esp32dev` and `[env:child]` with `extends = env:base` → `parseTargetEnvironments` returns child with `board === "esp32dev"`.
  2. Test: INI with `[common]` defining `board = esp32dev` and `[env:child]` with `extends = common` → child inherits board.
  3. Test: Multi-level: `[env:a]` → `extends = env:b` → `[env:b]` has `extends = env:c` → `[env:c]` has `board = esp32dev`. Child `a` should resolve `board === "esp32dev"`.
  4. Test: Circular `extends` (a → b → a) does not infinite loop — should log a warning and leave `board` undefined.
  5. Test: Child overrides parent's `board` — child's explicit `board` wins over inherited value.

## Verification Requirement
1. `npx tsc --noEmit` must pass.
2. `npx vitest run tests/target-resolution.test.ts` must pass (existing + new tests).
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
