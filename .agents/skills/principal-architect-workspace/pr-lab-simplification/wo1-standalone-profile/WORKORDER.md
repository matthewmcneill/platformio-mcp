---
name: lab-simplification-wo1
description: Handoff instructions for Work Order 1 — Standalone Profile
complexity: standard
---

# WO1 — Standalone Policy Profile

## Role Definition
> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

## Objective
Add a 7th policy profile called `standalone` designed for single-user desk setups. It allows all MCP operations without approvals, relaxes workspace boundary and device lock requirements, and conditionally bypasses target resolution in `uploadFirmwareCore` when the caller provides explicit `environment` + `port` arguments.

## Strict Boundary Box
- **DO NOT** modify `src/core/target-resolution.ts` — that is WO2/WO3 territory.
- **DO NOT** modify `src/utils/hardware-maps.ts` or `src/types.ts` (UploadFirmwareParamsSchema) — those are WO3.
- **DO NOT** touch lock management, device leasing, serial sessions, or dashboard UI code.
- **DO NOT** modify the default fallback profile (must remain `flash_requires_approval`).
- **DO NOT** modify existing profile definitions — only add the new one.

## Tooling Constraints
- Use `npx tsc --noEmit` for type checking.
- Use `npx vitest run tests/policy-profile.test.ts` for profile tests.
- Use `npx vitest run tests/policy-engine.test.ts` for evaluation tests.
- Use `npm run build` for final build verification.

## Line-Item Instructions

- [ ] **`src/core/policy/types.ts`** — Add `"standalone"` to the `PolicyProfileName` union type.

- [ ] **`src/core/policy/policy-schema.ts`** — Add `"standalone"` to the `PolicyProfileNameSchema` Zod enum (around line 17-24).

- [ ] **`src/core/policy/profiles.ts`** — Add a `standalone` entry to the `policyProfiles` record. The profile should:
  - `allow`: Spread all entries from `defaultPolicy.allow` PLUS all action names that `lab_admin` allows (i.e. everything `lab_admin` has, which covers builds, uploads, tests, cleans, resets, all agent tools). The simplest implementation: copy `lab_admin`'s allow list.
  - `approval_required`: `[]` (never prompt).
  - `deny`: `defaultPolicy.deny` only (keep the catastrophic patterns like `erase_flash`).
  - `require_workspace_boundary`: `false`.
  - `require_device_lock_for_upload`: `false`.
  - `redact_secrets_from_logs`: `false`.
  - `audit_all_agent_actions`: `false`.

- [ ] **`src/core/flash.ts`** — In `uploadFirmwareCore()` (around line 18-40), add a conditional bypass before `resolveWriteTarget()`:
  ```typescript
  // Before the existing: const target = await resolveWriteTarget(input);
  // Add:
  import { loadEffectivePolicyState } from "./policy/load-policy.js";

  let target: { port: string; environment: string };
  const policyState = await loadEffectivePolicyState(input.projectDir);
  if (
    policyState.profile === "standalone" &&
    input.environment &&
    input.port
  ) {
    // Standalone mode: trust explicit env+port, skip target resolution ceremony
    target = { port: input.port, environment: input.environment };
  } else {
    target = await resolveWriteTarget(input);
  }
  ```
  Adjust surrounding code to use the `target` variable consistently. The existing `resolveWriteTarget` call (line ~21) should become the else branch.

- [ ] **`tests/policy-profile.test.ts`** — Add tests for the `standalone` profile:
  1. Test that `resolvePolicyProfile({ profile: "standalone" })` returns a config with `approval_required: []`, `require_workspace_boundary: false`, `require_device_lock_for_upload: false`.
  2. Test that `evaluatePolicy("upload_firmware", ...)` returns `status: "allow"` under `standalone` (create a temp workspace with `{ "profile": "standalone" }` policy).
  3. Test that `evaluatePolicy("build_project", ...)` returns `status: "allow"`.
  4. Test that `evaluatePolicy("reset_server_state", ...)` returns `status: "allow"`.
  5. Test that `erase_flash` is still denied (in `defaultPolicy.deny`).

- [ ] **`tests/policy-config.test.ts`** — Verify that `parsePolicyDocument('{"profile":"standalone"}', "policy.json")` parses successfully (not rejected as unknown profile).

## Verification Requirement
1. `npx tsc --noEmit` must pass with zero errors.
2. `npx vitest run tests/policy-profile.test.ts tests/policy-config.test.ts` must pass.
3. `npm run build` must complete cleanly.
4. Before committing, ask the user if they are happy with the changes.

## Issue Surfacing
If you discover a defect, upstream bug, or concern outside your boundary box, surface it in your Completion Report below — do not file issues directly. The Principal Architect will triage and file them under the correct author identity.

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
