---
name: hardware-testing
description: Use this skill to read, analyze, and wait for hardware serial logs from ESP32 or other microcontrollers during debugging. Use this when you are asked to read flash logs, wait for boot conditions, or extract errors.
---

# Hardware Testing Skill

This skill provides tooling for an agent to responsibly interact with the hardware's continuous logging daemon, without blocking its own execution context or triggering infinite loops.

## Core Script: `read-logs.py`
Use `python .agents/skills/hardware-testing/scripts/read-logs.py` to sample logs effectively.

### Usage
- **Snapshot Reading (Default):**
  Reads the last 100 lines. Safe and fast.
  `python .agents/skills/hardware-testing/scripts/read-logs.py logs/latest-monitor.log -n 50`

- **Conditional Tailing (Until):**
  If you need to wait for the device to boot and finish a dataload, you can wait for a specific log line via regex:
  `python .agents/skills/hardware-testing/scripts/read-logs.py logs/latest-monitor.log --until "Full dataload complete" --timeout 30`

- **Time-based Tailing:**
  Wait and stream logs for 10 seconds:
  `python .agents/skills/hardware-testing/scripts/read-logs.py logs/latest-monitor.log --timeout 10`

### Guidelines
- Always prefer `--until` with a `--timeout` fallback (e.g. 30s) when waiting for boot states. This protects you from infinite hangs.
- Rely on `read-logs.py` rather than raw `tail` commands, as it provides pattern matching and graceful exits.
