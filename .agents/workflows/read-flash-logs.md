---
description: Read and analyze the latest hardware serial logs using a natural language query
---

1. Execute the `python .agents/skills/hardware-testing/scripts/read-logs.py` script to retrieve the latest logs from the device.
2. Determine exactly how to call the script based on the user's constraints attached to the prompt. 
   - If they specify "until X happens" or a boot condition, apply an `--until "RegexForX"` argument with a safe `--timeout 60`.
   - If they specify "for the last 30 seconds" or similar timeframes, apply a `--timeout 30` argument to stream.
   - If no constraints are specified, supply `-n 200` to retrieve a recent snapshot.
3. Read the extracted output and analyze it against any additional user queries (e.g., "look for warnings and errors", "why did it crash").
4. Present your synthesized findings back to the user clearly.
