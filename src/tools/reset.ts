/**
 * Device Reset Tool
 * Hardware-resets a microcontroller by toggling DTR/RTS on its serial port.
 *
 * Provides:
 * - resetDevice: Toggles DTR/RTS to reset a connected microcontroller.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "url";
import { getFirstDevice } from "./devices.js";
import { stopMonitor } from "./monitor.js";
import { PlatformIOError } from "../utils/errors.js";
import { validateSerialPort } from "../utils/validation.js";
import { logDiagnostic as logDiag } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the Python binary from PlatformIO's bundled virtual environment,
 * which is guaranteed to have pyserial installed. Falls back to system python3
 * if the PIO venv is not found.
 * @returns Absolute path to a python3 binary with pyserial available.
 */
function resolvePioPython(): string {
  const penvPython = path.join(
    os.homedir(),
    ".platformio",
    "penv",
    "bin",
    "python3",
  );
  if (fs.existsSync(penvPython)) return penvPython;

  // Windows fallback
  const penvPythonWin = path.join(
    os.homedir(),
    ".platformio",
    "penv",
    "Scripts",
    "python.exe",
  );
  if (fs.existsSync(penvPythonWin)) return penvPythonWin;

  return "python3"; // Last resort — will fail if pyserial not installed
}

/**
 * Hardware-resets the microcontroller on the specified serial port by toggling
 * DTR/RTS. This clears stuck CH340/CH9102 flow-control state and forces a
 * clean ESP32 boot via the auto-reset circuit.
 *
 * @param port - Serial port to reset. Auto-detected if not provided.
 * @param projectDir - Optional project directory for workspace context.
 * @returns Result object with success flag, port, and message.
 */
export async function resetDevice(
  port?: string,
  projectDir?: string,
): Promise<{ success: boolean; port: string; message: string }> {
  let activePort = port;

  if (!activePort) {
    const device = await getFirstDevice();
    if (!device) {
      throw new PlatformIOError(
        "No serial devices detected for reset.",
        "PORT_NOT_FOUND",
      );
    }
    activePort = device.port;
  }

  if (!validateSerialPort(activePort)) {
    throw new PlatformIOError(
      `Invalid serial port format: ${activePort}`,
      "INVALID_PORT",
    );
  }

  // Stop any running monitor — can't toggle DTR while the port is held open
  logDiag(`[ResetDevice] Stopping any active monitor on ${activePort}...`, projectDir);
  await stopMonitor(activePort, projectDir);
  await new Promise(r => setTimeout(r, 500)); // Allow port release

  const scriptPath = path.join(__dirname, "..", "..", "src", "utils", "dtr_reset.py");
  const pythonBin = resolvePioPython();

  return new Promise((resolve, reject) => {
    logDiag(`[ResetDevice] Toggling DTR/RTS on ${activePort} via ${pythonBin}...`, projectDir);
    execFile(pythonBin, [scriptPath, activePort], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        logDiag(`[ResetDevice] DTR/RTS toggle failed: ${error.message}`, projectDir);
        reject(new PlatformIOError(
          `Failed to reset device on ${activePort}: ${stderr || error.message}`,
          "RESET_FAILED",
        ));
        return;
      }
      const message = stdout.trim() || `Device reset on ${activePort}`;
      logDiag(`[ResetDevice] ${message}`, projectDir);
      resolve({ success: true, port: activePort!, message });
    });
  });
}

