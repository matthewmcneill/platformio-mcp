/**
 * Serial Monitor Spooler Daemon
 * Background persistence and web-portal event forwarding for serial logs.
 *
 * Provides:
 * - startSpoolingDaemon: Initiates an asynchronous serial hook directly to disk.
 * - stopSpoolingDaemon: Safely kills the daemon and unlocks the port.
 * - queryLogs: Pulls historical/grep'd records from the spool buffer safely.
 */

import fs from "node:fs";
import path from "node:path";
import { ChildProcess } from "node:child_process";
import { validateSerialPort, validateBaudRate } from "../utils/validation.js";
import { PlatformIOError } from "../utils/errors.js";
import { serialManager } from "../utils/serial-manager.js";
import { getFirstDevice } from "./devices.js";
import { portalEvents } from "../api/events.js";
import { fileURLToPath } from "url";
import { killProcessesUsingPort } from "../utils/process-manager.js";
import { portSemaphoreManager } from "../utils/semaphore.js";
import { platformioExecutor } from "../platformio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for server log artifacts
const DEFAULT_LOG_DIR = path.join(__dirname, "..", "..", "logs");

// Spooler diagnostic file target
const DIAGNOSTIC_LOG = path.join(DEFAULT_LOG_DIR, "mcp-internal.log");

function logDiag(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  if (!fs.existsSync(DEFAULT_LOG_DIR)) {
    fs.mkdirSync(DEFAULT_LOG_DIR, { recursive: true });
  }
  fs.appendFileSync(DIAGNOSTIC_LOG, line);
  console.error(msg);
}

/**
 * State and context mapping for an actively spooled hardware port.
 */
type DaemonContext = {
  proc: ChildProcess | null; // The background PlatformIO execution wrapper process
  baudRate: number; // Communication speed override
  environment?: string; // Configured environment properties map
  hwid: string | null; // HWID to track the device across macOS descriptor re-enumerations
  stream1: fs.WriteStream; // Primary global disk append stream
  stream2: fs.WriteStream; // Secondary project-local disk append stream
  intentionallyClosed: boolean; // Flag to prevent auto-reconnect loops when manually closed
  reconnectTimer?: NodeJS.Timeout; // Node timer for evaluating hardware re-enumeration checks
  logFile: string; // Active absolute path to the local primary written file
  autoReconnect: boolean; // User configuration controlling automatic restart
  status: "Logging" | "Connecting" | "Idle" | "Flashing"; // Public state presented to web UI
};

// Global pool of hardware streams managed by the MCP server
const activeDaemons: Record<string, DaemonContext> = {};

export function getSpoolerStates() {
  const states: Record<string, any> = {};
  
  for (const portName of Object.keys(activeDaemons)) {
    const daemon = activeDaemons[portName];
    let status = daemon.status;
    
    if (portSemaphoreManager.isPortClaimed(portName)) {
      status = "Flashing";
    }

    states[portName] = {
      active: true,
      status,
      port: portName,
      logFile: daemon.logFile,
      autoReconnect: daemon.autoReconnect,
    };
  }
  
  return states;
}

/**
 * Clears outdated serial traces beyond the rotation limit to prevent disk bloat.
 *
 * @param maxHistory - Maximum total bounded files to retain.
 */
function rotateLogs(targetDir: string, maxHistory = 30) {
  if (!fs.existsSync(targetDir)) return;
  const files = fs
    .readdirSync(targetDir)
    .filter((f) => f.startsWith("device-monitor-") && f.endsWith(".log"))
    .map((f) => ({
      name: f,
      path: path.join(targetDir, f),
      ctime: fs.statSync(path.join(targetDir, f)).ctime.getTime(),
    }))
    .sort((a, b) => b.ctime - a.ctime); // Newest first

  if (files.length > maxHistory) {
    const toDelete = files.slice(maxHistory);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(f.path);
      } catch (e) {}
    }
  }
}

export async function stopSpoolingDaemon(port: string, teardown: boolean = true) {
  logDiag(`[Spooler Diagnostic] stopSpoolingDaemon called for port ${port}. Teardown: ${teardown}.`);
  if (activeDaemons[port]) {
    logDiag(`[Spooler Diagnostic] Daemon context found for ${port}. Checking process...`);
    const daemon = activeDaemons[port];
    daemon.intentionallyClosed = true;
    daemon.status = "Idle";

    if (daemon.reconnectTimer) {
       logDiag(`[Spooler Diagnostic] Clearing reconnect polling timer.`);
       clearTimeout(daemon.reconnectTimer);
    }

    daemon.stream1.end();
    daemon.stream2.end();

    if (daemon.proc) {
      logDiag(`[Spooler Diagnostic] Process exists. Sending SIGINT (Ctrl+C equivalent)...`);
      daemon.proc.kill("SIGINT");
      // Wait for it to die gracefully (up to 2 seconds)
      for (let i = 0; i < 20; i++) {
        if (daemon.proc.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (daemon.proc && daemon.proc.exitCode === null) {
        logDiag(`[Spooler Diagnostic] Process still alive, sending SIGKILL...`);
        daemon.proc.kill("SIGKILL");
      }
      daemon.proc = null;
    }

    if (teardown) {
      logDiag(`[Spooler Diagnostic] Deleting activeDaemons context.`);
      delete activeDaemons[port];
      try {
        serialManager.unlockPort(port);
      } catch (e) {}
    }
    
    portalEvents.emitSpoolerStates?.(getSpoolerStates());
  } else {
    logDiag(`[Spooler Diagnostic] No daemon context found for ${port} during stop command.`);
  }

  // Final safety cleanup
  logDiag(`[Spooler Diagnostic] Triggering killProcessesUsingPort on ${port}...`);
  killProcessesUsingPort(port);
  logDiag(`[Spooler Diagnostic] killProcessesUsingPort completed.`);
}

function startReconnectPolling(targetPort: string) {
  const daemon = activeDaemons[targetPort];
  if (!daemon || daemon.intentionallyClosed || daemon.reconnectTimer) return;

  const attemptConnect = async () => {
    let currentDaemon = activeDaemons[targetPort];
    if (!currentDaemon || currentDaemon.intentionallyClosed || !currentDaemon.autoReconnect) return;

    if (portSemaphoreManager.isPortClaimed(targetPort)) {
      currentDaemon.status = "Idle";
      portalEvents.emitSpoolerStates?.(getSpoolerStates());
      currentDaemon.reconnectTimer = setTimeout(attemptConnect, 1000);
      return;
    }

    currentDaemon.status = "Connecting";
    portalEvents.emitSpoolerStates?.(getSpoolerStates());

    try {
      let activePort = targetPort;
      // If we know the HWID, poll to see if it changed ports
      if (currentDaemon.hwid) {
        const { waitForDeviceByHwid } = await import("./devices.js");
        const newPort = await waitForDeviceByHwid(currentDaemon.hwid, 3000);
        if (newPort && newPort !== targetPort) {
          logDiag(`[Spooler] Device HWID ${currentDaemon.hwid} reappeared on new port: ${newPort}. Updating daemon registry.`);
          // Migrate daemon context
          activeDaemons[newPort] = currentDaemon;
          delete activeDaemons[targetPort];
          activePort = newPort;
          // Update the targetPort closure variable so future loops hitting attemptConnect use the right key
          targetPort = newPort;
        }
      }

      // Re-trigger the main spawning logic
      await spawnPioMonitor(activePort);
    } catch (e) {
      currentDaemon.reconnectTimer = setTimeout(attemptConnect, 2000);
    }
  };

  daemon.reconnectTimer = setTimeout(attemptConnect, 1000);
}

/**
 * Utility to generate a fresh pair of log streams for a port.
 */
function rotateSpoolerStreams(activePort: string) {
  const daemon = activeDaemons[activePort];
  const targetDir = daemon ? path.dirname(daemon.logFile) : DEFAULT_LOG_DIR;

  rotateLogs(targetDir, 30);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(targetDir, `device-monitor-${timestamp}.log`);
  const latestLog = path.join(targetDir, "latest-monitor.log");

  // Close old streams if they exist
  if (daemon) {
    daemon.stream1.end();
    daemon.stream2.end();
  }

  const stream1 = fs.createWriteStream(logFile, { flags: "a" });
  const stream2 = fs.createWriteStream(latestLog, { flags: "w" });

  return { stream1, stream2, logFile };
}

async function spawnPioMonitor(targetPort: string) {
  const daemon = activeDaemons[targetPort];
  if (!daemon || daemon.intentionallyClosed) return;

  const monitorArgs = [
    "--port", targetPort,
    "--quiet",
    "--raw"
  ];

  // If we have an environment, use it to respect platformio.ini settings
  if (daemon.environment) {
    monitorArgs.push("--environment", daemon.environment);
  } else {
    // Fallback to explicit baud if no environment is specified
    monitorArgs.push("--baud", daemon.baudRate.toString());
  }

  logDiag(`[Spooler] Spawning pio monitor (Env: ${daemon.environment || "None"}) via executor for ${targetPort}`);

  const proc = platformioExecutor.spawn("device", ["monitor", ...monitorArgs], {
    useFakeTty: true
  });

  daemon.proc = proc;
  daemon.status = "Logging";

  let buffer = "";
  proc.stdout?.on("data", (data: Buffer) => {
    const text = data.toString("utf8");
    buffer += text;
    
    // Split by line for WebSocket events, but write raw to files
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    lines.forEach((line) => {
      const cleanLine = line.replace(/\r$/, "");
      portalEvents.emitSerialLog(targetPort, cleanLine);
      daemon.stream1.write(line + "\n");
      daemon.stream2.write(line + "\n");
    });
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const errorText = data.toString("utf8").trim();
    if (errorText) {
      logDiag(`[Spooler Monitor Stderr] ${errorText}`);
      // Also send first line of error to portal to help user debug
      portalEvents.emitSerialLog(targetPort, `[Error] ${errorText.split("\n")[0]}`);
    }
  });

  proc.on("error", (err) => {
    logDiag(`[Spooler] Child process spawn error: ${err.message}`);
    portalEvents.emitSerialLog(targetPort, `[Error] Failed to spawn monitor: ${err.message}`);
  });

  proc.on("close", (code) => {
    if (daemon.intentionallyClosed) {
      logDiag(`[Spooler] Monitor process exited as expected (code ${code}).`);
    } else {
      logDiag(`[Spooler] Monitor process exited unexpectedly (code ${code}). Reconnecting...`);
      daemon.proc = null;
      daemon.status = "Connecting";
      portalEvents.emitSpoolerStates?.(getSpoolerStates());
      startReconnectPolling(targetPort);
    }
  });

  portalEvents.emitSpoolerStates?.(getSpoolerStates());
}

/**
 * Binds to a specified UART interface and autonomously pushes data into the
 * persistence pipeline as well as the web UI via events.
 *
 * @param port - Optional serial interface (fallback to auto-discovery).
 * @param baud - UART synchronization speed.
 * @returns Status of initial creation and filepath targeting.
 */
export async function startSpoolingDaemon(
  port?: string,
  baud: number = 115200,
  autoReconnect: boolean = true, // Mandatory default now
  projectDir?: string,
  environment?: string,
) {
  let activePort = port;
  let activeHwid: string | null = null;
  
  if (!activePort) {
    const defaultDevice = await getFirstDevice();
    if (!defaultDevice)
      throw new PlatformIOError(
        "No serial devices detected to monitor.",
        "PORT_NOT_FOUND",
      );
    activePort = defaultDevice.port;
    activeHwid = defaultDevice.hwid;
  } else {
    const { findDeviceByPort } = await import("./devices.js");
    const matchedDevice = await findDeviceByPort(activePort);
    activeHwid = matchedDevice?.hwid || null;
  }

  if (!validateSerialPort(activePort))
    throw new PlatformIOError(
      `Invalid serial port format: ${activePort}`,
      "INVALID_PORT",
    );
  if (baud && !validateBaudRate(baud))
    throw new PlatformIOError(`Invalid baud rate: ${baud}`, "INVALID_BAUD");

  // Relinquish previous bindings safely if re-invoked
  await stopSpoolingDaemon(activePort);

  if (serialManager.isLocked(activePort))
    throw new PlatformIOError(
      `Port is currently locked: ${activePort}`,
      "PORT_BUSY",
    );

  const targetDir = projectDir
    ? path.join(projectDir, "logs")
    : DEFAULT_LOG_DIR;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Use the common stream rotation logic
  const initialStreams = rotateSpoolerStreams(activePort);

  serialManager.lockPort(activePort);

  // Track daemon context before instantiating generic port bounds
  const daemon: DaemonContext = {
    proc: null,
    baudRate: baud,
    environment,
    hwid: activeHwid,
    stream1: initialStreams.stream1,
    stream2: initialStreams.stream2,
    intentionallyClosed: false,
    logFile: initialStreams.logFile,
    autoReconnect,
    status: "Connecting"
  };
  activeDaemons[activePort] = daemon;

  await spawnPioMonitor(activePort);

  return { success: true, port: activePort, logFile: initialStreams.logFile };
}

/**
 * Tool for agents to scan historical offline device payloads.
 *
 * @param lines - How far backward to crop the document.
 * @param searchPattern - Regex evaluation sequence to prune arbitrary output.
 * @returns Serialized matches of the latest buffer output.
 */
export async function queryLogs(
  lines: number = 100,
  searchPattern?: string,
  projectDir?: string,
  port?: string, // New port-specific query support
) {
  const targetDir = projectDir
    ? path.join(projectDir, "logs")
    : DEFAULT_LOG_DIR;
    
  let targetFile = path.join(targetDir, "latest-monitor.log");
  
  // If a specific port is requested, try to find the active log file for it
  if (port && activeDaemons[port]) {
    targetFile = activeDaemons[port].logFile;
  }

  if (!fs.existsSync(targetFile)) {
    return {
      success: false,
      content: `No active or recent logs found for ${port || "general session"} in ${targetDir}.`,
    };
  }

  const content = fs.readFileSync(targetFile, "utf8");
  let outputLines = content.split("\n");

  if (searchPattern) {
    try {
      const regex = new RegExp(searchPattern, "i");
      outputLines = outputLines.filter((line) => regex.test(line));
    } catch (e) {
      return {
        success: false,
        content: `Invalid regex search pattern provided: ${searchPattern}`,
      };
    }
  }

  if (outputLines.length > lines) {
    outputLines = outputLines.slice(-lines);
  }

  return { success: true, content: outputLines.join("\n") };
}
