/**
 * OS Process Management Utilities
 * Tools for identifying and terminating conflicting serial port owners.
 *
 * Provides:
 * - killProcessesUsingPort: Terminates PIDs holding a serial lock.
 * - killPioMonitors: Specifically targets stray PlatformIO monitor tasks.
 */

import { execSync } from "node:child_process";
import os from "node:os";

/**
 * Forcefully terminates any process holding a lock on the target serial port.
 * Critical on macOS (Darwin) for avoiding 'Resource Busy' errors during flash.
 *
 * @param port - Path to the serial device (e.g. /dev/cu.usbserial-xxx)
 */
export function killProcessesUsingPort(port: string): void {
  const platform = os.platform();
  if (platform !== "darwin" && platform !== "linux") return;
  if (!port || port === "auto") return;

  try {
    // Darwin uses lsof, Linux uses fuser
    const command =
      platform === "darwin"
        ? `lsof -t "${port}"`
        : `fuser "${port}" 2>/dev/null`;

    console.error(`[ProcessManager Diagnostic] Executing OS process killer: ${command}`);
    const output = execSync(command, { encoding: "utf8" }).trim();
    if (output) {
      // Split by any whitespace or newline
      const pids = output.split(/[\s\n]+/);
      for (const pidStr of pids) {
        if (pidStr) {
          const pid = parseInt(pidStr, 10);
          console.error(`[ProcessManager Diagnostic] Found PID executing on port: ${pid}. MCP PID is: ${process.pid}`);
          if (isNaN(pid) || pid === process.pid) {
             console.error(`[ProcessManager Diagnostic] Bypassing PID ${pid} (Current MCP Server Node Instance / Invalid).`);
             continue;
          }

          console.error(
            `[ProcessManager] Conflict detected. Terminating PID ${pid} holding ${port}`,
          );
          try {
            // Use SIGKILL to ensure it doesn't try to restart or hang on exit
            process.kill(pid, "SIGKILL");
            console.error(`[ProcessManager Diagnostic] Successfully sent SIGKILL to PID ${pid}.`);
          } catch (e) {
            // Process might have already exited
            console.error(`[ProcessManager Diagnostic] Failed to SIGKILL PID ${pid}: ${e}`);
          }
        }
      }
    } else {
      console.error(`[ProcessManager Diagnostic] No conflicting processes found by OS.`);
    }
  } catch (error: any) {
    // Command failed usually means no process found or port doesn't exist
    // We can safely ignore this as the intent is to clear the port
    console.error(`[ProcessManager Diagnostic] OS returned an error (likely no process or port missing): ${error.message}`);
  }
}

/**
 * Specifically targets and kills any running 'pio monitor' or 'platformio device monitor' tasks.
 * This is a secondary safety measure to ensure the PIO ecosystem isn't fighting for the port.
 */
export function killPioMonitors(): void {
  const platform = os.platform();
  if (platform !== "darwin" && platform !== "linux") return;

  try {
    // Find pids for processes that look like pio monitor or raw miniterm
    const command =
      "ps aux | grep -E 'pio|platformio|miniterm' | grep -v 'grep' | grep -E 'monitor|device monitor|miniterm' | awk '{print $2}'";
    const output = execSync(command, { encoding: "utf8" }).trim();

    if (output) {
      const pids = output.split(/[\s\n]+/);
      for (const pidStr of pids) {
        if (pidStr) {
          const pid = parseInt(pidStr, 10);
          if (isNaN(pid) || pid === process.pid) continue;

          console.error(
            `[ProcessManager] Killing stray PIO monitor process: ${pid}`,
          );
          try {
            process.kill(pid, "SIGKILL");
          } catch (e) {}
        }
      }
    }
  } catch (error) {}
}
