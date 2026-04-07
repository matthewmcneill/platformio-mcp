---
trigger: always_on
---

# 01 - Global Constraints

This rule applies to all agent activities in the project.

## Explicit Execution Permission
You are ONLY permitted to skip the formal `PLANNING` mode, `task.md`, and `implementation_plan.md` artifacts for purely trivial tasks (e.g., quick investigations, simple bug fixes, single-line edits) where a session has already previously approved of execution. However, you are **STRICTLY PROHIBITED** from executing any code modifications autonomously without explicit permission.

### Workflow:
1. **Investigate & Propose**: Once you find the issue and determine the trivial fix, briefly explain what you found and what you plan to change.
2. **Stop and Ask**: You MUST stop and ask for permission.
3. **Wait for Approval**: Do NOT use file editing tools until the user responds affirmatively.

### Scratch Files Constraint:
- When writing scripts or temporary files, you MUST write them to `.agents/tmp/`. You are **STRICTLY PROHIBITED** from using `/tmp/`.

## Repository-Relative Portability
You are **STRICTLY PROHIBITED** from using absolute paths to the project repository (e.g., `/Users/myuser/Documents/...`) in ANY scripts, temporary files, plan documents (`implementation_plan.md`, `context_bridge.md`, `task.md`, `PLAN.md`), or terminal commands.
All authoring MUST use repository-relative paths to ensure portability across developer machines. 

*(Exception: The internal session workspace `<appDataDir>/brain/<conversation-id>/...` must use absolute paths)*