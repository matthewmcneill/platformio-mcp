---
description: Start the continuous device monitor with automated logging
---

Execute this script to start the continuous device monitor. It will:
1. Detect the attached device (Arduino Nano ESP32 or ESP32 Dev).
2. Spool logs to `logs/device-monitor-<timestamp>.log`.
3. Automatically reconnect when the port is released (e.g., after a firmware upload).
4. Maintain a `logs/latest-monitor.log` file for live viewing.

```bash
#!/bin/bash
./scripts/device-monitor.py
```
