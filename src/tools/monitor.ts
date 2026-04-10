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
import { SerialPort } from "serialport";
import { validateSerialPort, validateBaudRate } from "../utils/validation.js";
import { PlatformIOError } from "../utils/errors.js";
import { serialManager } from "../utils/serial-manager.js";
import { getFirstDevice } from "./devices.js";
import { portalEvents } from "../api/events.js";
import { fileURLToPath } from "url";
import { killProcessesUsingPort } from "../utils/process-manager.js";
import { portSemaphoreManager } from "../utils/semaphore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_LOG_DIR = path.join(__dirname, "..", "..", "logs");

type DaemonContext = {
  port: SerialPort | null;
  baudRate: number;
  stream1: fs.WriteStream;
  stream2: fs.WriteStream;
  intentionallyClosed: boolean;
  reconnectTimer?: NodeJS.Timeout;
  logFile: string;
  autoReconnect: boolean;
};
const activeDaemons: Record<string, DaemonContext> = {};

export function getSpoolerStates() {
  const states: Record<string, any> = {};
  
  for (const portName of Object.keys(activeDaemons)) {
    const daemon = activeDaemons[portName];
    let status: "Logging" | "Flashing" | "Connecting" | "Idle" = "Connecting";
    
    if (daemon.port?.isOpen) {
      status = "Logging";
    } else if (portSemaphoreManager.isPortClaimed(portName)) {
      status = "Flashing";
    } else if (daemon.intentionallyClosed) {
      status = "Idle";
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

/**
 * Destroys any active serialport daemon to cleanly relinquish the mutex lock.
 *
 * @param port - Identifier of the engaged port to abandon.
 */
export async function stopSpoolingDaemon(port: string, teardown: boolean = true) {
  if (activeDaemons[port]) {
    const daemon = activeDaemons[port];
    daemon.intentionallyClosed = true;
    if (daemon.reconnectTimer) clearTimeout(daemon.reconnectTimer);

    daemon.stream1.end();
    daemon.stream2.end();

    if (daemon.port && daemon.port.isOpen) {
      await new Promise<void>((resolve) => {
        daemon.port?.close((err) => {
          if (err)
            console.error(
              `[Spooler] Error closing port ${port}: ${err.message}`,
            );
          resolve();
        });
      });
    }

    if (teardown) {
      delete activeDaemons[port];
      try {
        serialManager.unlockPort(port);
      } catch (e) {}
    }
    
    portalEvents.emitSpoolerStates?.(getSpoolerStates());
  }

  // Crucial: Clear ANY process using this port before we let PIO take it
  // We do this AFTER closing our own port to ensure we don't try to kill ourselves
  // but catch any stray monitors or other apps.
  killProcessesUsingPort(port);
}

function startReconnectPolling(targetPort: string) {
  const daemon = activeDaemons[targetPort];
  if (!daemon || daemon.intentionallyClosed || daemon.reconnectTimer) return;

  const startTime = Date.now();

  const attemptConnect = async () => {
    if (daemon.intentionallyClosed || !daemon.autoReconnect) return;

    // Phase 1: Check Semaphore before even looking at the hardware
    if (portSemaphoreManager.isPortClaimed(targetPort)) {
      portalEvents.emitSerialLog?.(targetPort, "[Spooler] Port is claimed by local agent. Yielding...");
      portalEvents.emitSpoolerStates?.(getSpoolerStates());
      // Rapid retry check while we are yielding (10ms)
      daemon.reconnectTimer = setTimeout(attemptConnect, 10);
      return;
    }

    // Determine backoff logic: 500ms for first 30 seconds, 2000ms after
    const elapsed = Date.now() - startTime;
    const pollInterval = elapsed < 30000 ? 50 : 2000;

    const serial = new SerialPort({
      path: targetPort,
      baudRate: daemon.baudRate,
      autoOpen: false,
    });

    serial.open((err) => {
      if (err) {
        // Failed to connect, queue next attempt
        daemon.reconnectTimer = setTimeout(attemptConnect, pollInterval);
      } else {
        // Successfully reconnected - ROTATE LOGS
        console.error(
          `[Spooler] Successfully restored physical interface to ${targetPort}`,
        );
        daemon.reconnectTimer = undefined;
        daemon.port = serial;

        // Rotate log files on reclamation
        const newStreams = rotateSpoolerStreams(targetPort);
        daemon.stream1 = newStreams.stream1;
        daemon.stream2 = newStreams.stream2;
        daemon.logFile = newStreams.logFile;

        attachSerialEvents(serial, targetPort);
        portalEvents.emitSpoolerStates?.(getSpoolerStates());
      }
    });
  };

  daemon.reconnectTimer = setTimeout(attemptConnect, 10);
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

function attachSerialEvents(serial: SerialPort, targetPort: string) {
  let buffer = "";

  serial.on("data", (data: Buffer) => {
    const daemon = activeDaemons[targetPort];
    if (!daemon) return;

    buffer += data.toString("utf8");
    const lines = buffer.split("\n");

    // The last chunk is always the remainder (incomplete line)
    buffer = lines.pop() || "";

    // Push each finalized line as an atomic event
    lines.forEach((line) => {
      const text = line + "\n";
      daemon.stream1.write(text);
      daemon.stream2.write(text);
      portalEvents.emitSerialLog(targetPort, line.replace(/\r$/, "")); // Stream clean line to UI
    });
  });

  const handleDisconnect = (err?: Error) => {
    const daemon = activeDaemons[targetPort];
    if (!daemon || daemon.intentionallyClosed) return;

    if (err) {
      console.error(
        `[Spooler] Unexpected runtime error on ${targetPort}: ${err.message}`,
      );
    } else {
      console.error(
        `[Spooler] Interface ${targetPort} closed natively. Spooler auto-recovering...`,
      );
    }

    if (daemon.port?.isOpen) {
      try {
        daemon.port.close();
      } catch (e) {}
    }
    daemon.port = null;
    portalEvents.emitSpoolerStates?.(getSpoolerStates());
    startReconnectPolling(targetPort);
  };

  serial.on("open", () => {
    portalEvents.emitSpoolerStates?.(getSpoolerStates());
  });
  serial.on("error", (err: any) => handleDisconnect(err));
  serial.on("close", () => handleDisconnect());
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
) {
  let activePort = port;
  if (!activePort) {
    const defaultDevice = await getFirstDevice();
    if (!defaultDevice)
      throw new PlatformIOError(
        "No serial devices detected to monitor.",
        "PORT_NOT_FOUND",
      );
    activePort = defaultDevice.port;
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
  activeDaemons[activePort] = {
    port: null,
    baudRate: baud,
    stream1: initialStreams.stream1,
    stream2: initialStreams.stream2,
    intentionallyClosed: false,
    logFile: initialStreams.logFile,
    autoReconnect,
  };

  const serial = new SerialPort({ path: activePort, baudRate: baud });
  activeDaemons[activePort].port = serial;

  attachSerialEvents(serial, activePort);

  portalEvents.emitSpoolerStates?.(getSpoolerStates());

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
