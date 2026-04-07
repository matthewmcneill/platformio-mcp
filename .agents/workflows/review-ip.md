---
description: Forces the application or reapplication of the implementation-plan-review.md rule to the latest implementation plan.
---

1. Locate the latest `implementation_plan.md` in the current session's artifact directory (e.g., `<appDataDir>/brain/<conversation-id>/implementation_plan.md`).
2. Read and strictly apply the following architectural checklists:
   - **House Style**: Consult `house-style-documentation` skill for `camelCase` naming and standard section headers (Goal, Review Required, Proposed Changes, Verification).
   - **Architectural Standards**: Consult `architectural-refactoring` skill for SRP, OCP, DIP, minimal global state, and injection patterns.
   - **UI Design**: If proposing UI changes, consult `embedded-web-designer` skill and include an ASCII mockup.
   - **Resource Impact**: Consult `embedded-systems` skill and evaluate Flash/ROM, RAM, Stack, Heap, PSRAM, and Power consumption.
4. Update the `implementation_plan.md` file to:
   - Reflect any findings or recommendations from these reviews using GitHub alerts (IMPORTANT/WARNING).
   - Update the status of the audit checklist at the top of the file for each skill.
5. Notify the user once the review and updates are complete.
