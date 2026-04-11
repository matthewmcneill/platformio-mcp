/**
 * Firmware Upload Tools
 * Firmware upload operations and sequencing tools.
 *
 * Provides:
 * - uploadFirmware: Targets serial devices and drops compiled hex/bin.
 * - uploadAndMonitor: Drops firmware and attaches realtime observer.
 * - buildAndUpload: Compiles and dispatches binaries.
 */

import { platformioExecutor } from "../platformio.js";
import type { UploadResult } from "../types.js";
import {
  validateProjectPath,
  validateEnvironmentName,
  validateSerialPort,
} from "../utils/validation.js";
import { findDeviceByPort, listDevices } from "./devices.js";
import { UploadError, PlatformIOError } from "../utils/errors.js";
import { parseStderrErrors } from "../utils/errors.js";
import { serialManager } from "../utils/serial-manager.js";
import { diagnoseError } from "../utils/diagnostics.js";
import { startSpoolingDaemon, stopSpoolingDaemon } from "./monitor.js";
import { portalEvents } from "../api/events.js";
import { portSemaphoreManager } from "../utils/semaphore.js";
import { buildLogger } from "../utils/build-logger.js";
import type { SerialDevice } from "../types.js";

/**
 * Polling helper that waits for a device to re-appear after a hardware reset/flash.
 * Useful for ESP32-S3 and other native USB boards that re-enumerate.
 */
async function waitForReenumeration(
  originalDevice: SerialDevice,
  timeoutMs: number = 10000,
): Promise<string> {
  const startTime = Date.now();
  const pollingInterval = 500;

  // Wait a moment for the device to actually detach
  await new Promise((resolve) => setTimeout(resolve, 1000));

  while (Date.now() - startTime < timeoutMs) {
    const devices = await listDevices();

    // Priority 1: Check if it's still on the original port
    const onOriginal = devices.find((d) => d.port === originalDevice.port);
    if (onOriginal) return originalDevice.port;

    // Priority 2: Check if it's on a new port but has the same HWID
    const onNew = devices.find((d) => d.hwid === originalDevice.hwid);
    if (onNew) {
      return onNew.port;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }

  // Fallback to original port if discovery times out
  return originalDevice.port;
}


/**
 * Uploads filesystem (SPIFFS/LittleFS) to a connected device.
 *
 * @param projectDir - Path to the project root slated for upload.
 * @param port - Optional override for destination serial connection.
 * @param environment - Target PIO runtime context block.
 * @param verbose - If true, returns full upload payload.
 * @returns Upload completion status and output streams.
 */
export async function uploadFilesystem(
  projectDir: string,
  port?: string,
  environment?: string,
  verbose?: boolean,
  startSpoolingAfter?: boolean,
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, {
      environment,
    });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  try {
    // Prepare logging environment
    const logFile = buildLogger.startNewLog(validatedPath);
    portalEvents.clearBuildLog(validatedPath, logFile);

    // Step 1: Resolve port, Kill Spooler, Lock UART
    let activePort = port;
    let targetDevice: SerialDevice | null = null;

    if (activePort) {
      targetDevice = await findDeviceByPort(activePort);
    } else {
      const { getFirstDevice } = await import("./devices.js");
      targetDevice = await getFirstDevice();
      if (!targetDevice)
        throw new PlatformIOError(
          "No serial devices detected for upload.",
          "PORT_NOT_FOUND",
        );
      activePort = targetDevice.port;
    }

    const { getSpoolerStates } = await import("./monitor.js");
    const spoolerStates = getSpoolerStates();
    const portStatus = spoolerStates[activePort];
    const shouldAutoReconnect =
      startSpoolingAfter ||
      (portStatus?.active && portStatus?.autoReconnect);

    const lockTarget = activePort;
    await stopSpoolingDaemon(lockTarget);
    
    // Explicitly claim the physical UART via semaphore
    portSemaphoreManager.claimPort(lockTarget, "Filesystem Upload");
    serialManager.lockPort(lockTarget);

    try {
      const uploadArgs: string[] = ["run", "--target", "uploadfs"];
      if (environment) uploadArgs.push("--environment", environment);
      uploadArgs.push("--upload-port", lockTarget);

      portalEvents.emitBuildLog(
        validatedPath,
        `Phase 1: Building and flashing filesystem image to ${lockTarget}...\n`,
      );

      const uploadResult = await platformioExecutor.execute(
        "run",
        uploadArgs.slice(1),
        {
          cwd: validatedPath,
          timeout: 600000, // 10 minutes (covers build + flash)
          onOutput: (chunk) => {
            buildLogger.writeLog(chunk);
            portalEvents.emitBuildLog(validatedPath, chunk);
          },
        },
      );

      const uploadSuccess = uploadResult.exitCode === 0;

      return {
        success: uploadSuccess,
        port: activePort,
        output: uploadSuccess && !verbose ? undefined : uploadResult.stdout,
        errors: uploadSuccess
          ? undefined
          : parseStderrErrors(uploadResult.stderr),
        diagnostics: uploadSuccess
          ? undefined
          : diagnoseError(uploadResult.stderr),
      };
    } finally {
      serialManager.unlockPort(lockTarget);
      // Relinquish physical control - this triggers the monitor watchdog to resume
      portSemaphoreManager.releasePort(lockTarget);
      
      if (shouldAutoReconnect) {
        let reconnectPort = lockTarget;

        // Re-enumeration Handshake: If the port is likely a native USB S3/C3/etc, 
        // wait for it to re-appear possibly on a new name.
        if (targetDevice) {
           reconnectPort = await waitForReenumeration(targetDevice);
        }

        startSpoolingDaemon(reconnectPort).catch((e) =>
          console.error("Auto-spooler failed to restart after upload", e),
        );
      }
    }
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(`Filesystem upload failed: ${error.message}`, {
        projectDir,
        port,
        environment,
      });
    }
    throw new UploadError(`Failed to upload filesystem: ${error}`, {
      projectDir,
      port,
      environment,
    });
  }
}

/**
 * Uploads firmware to a connected device.
 *
 * @param projectDir - Path to the project root slated for upload.
 * @param port - Optional override for destination serial connection.
 * @param environment - Target PIO runtime context block.
 * @param verbose - If true, returns full upload payload.
 * @returns Upload completion status and output streams.
 */
export async function uploadFirmware(
  projectDir: string,
  port?: string,
  environment?: string,
  verbose?: boolean,
  startSpoolingAfter?: boolean,
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, {
      environment,
    });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  try {
    // Prepare logging environment
    const logFile = buildLogger.startNewLog(validatedPath);
    portalEvents.clearBuildLog(validatedPath, logFile);

  // Step 1: Resolve port, Kill Spooler, Lock UART
  let activePort = port;
  let targetDevice: SerialDevice | null = null;

  if (activePort) {
    targetDevice = await findDeviceByPort(activePort);
  } else {
    const { getFirstDevice } = await import("./devices.js");
    targetDevice = await getFirstDevice();
    if (!targetDevice)
      throw new PlatformIOError(
        "No serial devices detected for upload.",
        "PORT_NOT_FOUND",
      );
    activePort = targetDevice.port;
  }

  const { getSpoolerStates } = await import("./monitor.js");
  const spoolerStates = getSpoolerStates();
  const portStatus = spoolerStates[activePort];
  const shouldAutoReconnect =
    startSpoolingAfter ||
    (portStatus?.active && portStatus?.autoReconnect);

  const lockTarget = activePort;
  await stopSpoolingDaemon(lockTarget);
  
  // Explicitly claim the physical UART via semaphore
  portSemaphoreManager.claimPort(lockTarget, "Firmware Upload");
  serialManager.lockPort(lockTarget);

  try {
    const uploadArgs: string[] = ["run", "--target", "upload"];
    if (environment) uploadArgs.push("--environment", environment);
    uploadArgs.push("--upload-port", lockTarget);

    portalEvents.emitBuildLog(
      validatedPath,
      `Phase 1: Building and flashing firmware to ${lockTarget}...\n`,
    );

    const uploadResult = await platformioExecutor.execute(
      "run",
      uploadArgs.slice(1),
      {
        cwd: validatedPath,
        timeout: 600000, // 10 minutes (covers build + flash)
        onOutput: (chunk) => {
          buildLogger.writeLog(chunk);
          portalEvents.emitBuildLog(validatedPath, chunk);
        },
      },
    );

    const uploadSuccess = uploadResult.exitCode === 0;

    return {
      success: uploadSuccess,
      port: activePort,
      output: uploadSuccess && !verbose ? undefined : uploadResult.stdout,
      errors: uploadSuccess
        ? undefined
        : parseStderrErrors(uploadResult.stderr),
      diagnostics: uploadSuccess
        ? undefined
        : diagnoseError(uploadResult.stderr),
    };
  } finally {
    serialManager.unlockPort(lockTarget);
    // Relinquish physical control - this triggers the monitor watchdog to resume
    portSemaphoreManager.releasePort(lockTarget);
    
    if (shouldAutoReconnect) {
      let reconnectPort = lockTarget;

      // Re-enumeration Handshake
      if (targetDevice) {
        reconnectPort = await waitForReenumeration(targetDevice);
      }

      startSpoolingDaemon(reconnectPort).catch((e) =>
        console.error("Auto-spooler failed to restart after upload", e),
      );
    }
  }
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(`Upload failed: ${error.message}`, {
        projectDir,
        port,
        environment,
      });
    }
    throw new UploadError(`Failed to upload firmware: ${error}`, {
      projectDir,
      port,
      environment,
    });
  }
}

/**
 * Uploads firmware and starts serial monitor (upload + monitor).
 *
 * @param projectDir - Applicable codebase tree.
 * @param port - Specific hardware port to flash and watch.
 * @param environment - Bound environment parameters execution context.
 * @param verbose - If true, returns full log flow strings.
 * @returns Terminal logging outputs array sequence from upload.
 */
export async function uploadAndMonitor(
  projectDir: string,
  port?: string,
  environment?: string,
  verbose?: boolean,
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, {
      environment,
    });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  // Resolve port if not provided to ensure we can kill conflicting processes
  let activePort = port;
  let targetDevice: SerialDevice | null = null;
  
  if (activePort) {
    targetDevice = await findDeviceByPort(activePort);
  } else {
    const { getFirstDevice } = await import("./devices.js");
    targetDevice = await getFirstDevice();
    if (targetDevice) {
      activePort = targetDevice.port;
    }
  }

  const lockTarget = activePort || "auto";
  await stopSpoolingDaemon(lockTarget, false);
  serialManager.lockPort(lockTarget);

  try {
    const args: string[] = ["run", "--target", "upload", "--target", "monitor"];

    if (environment) {
      args.push("--environment", environment);
    }

    if (activePort && activePort !== "auto") {
      args.push("--upload-port", activePort);
      args.push("--monitor-port", activePort);
    }

    // Prepare logging environment
    const logFile = buildLogger.startNewLog(validatedPath);
    portalEvents.clearBuildLog(validatedPath, logFile);

    const result = await platformioExecutor.execute("run", args.slice(1), {
      cwd: validatedPath,
      timeout: 300000,
      onOutput: (chunk) => {
        buildLogger.writeLog(chunk);
        portalEvents.emitBuildLog(validatedPath, chunk);
      },
    });

    const success = result.exitCode === 0;
    const errors = success ? undefined : parseStderrErrors(result.stderr);
    const diagnostics = success ? undefined : diagnoseError(result.stderr);

    if (success) {
      let reconnectPort = lockTarget;
      
      // Re-enumeration Handshake
      if (targetDevice) {
        reconnectPort = await waitForReenumeration(targetDevice);
      }
      
      startSpoolingDaemon(reconnectPort).catch((e) =>
        console.error("Auto-spooler failed to restart after upload", e),
      );
    }

    return {
      success,
      port,
      output: success && !verbose ? undefined : result.stdout,
      errors,
      diagnostics,
    };
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(`Upload and monitor failed: ${error.message}`, {
        projectDir,
        port,
        environment,
      });
    }
    throw new UploadError(`Failed to upload and monitor: ${error}`, {
      projectDir,
      port,
      environment,
    });
  } finally {
    serialManager.unlockPort(lockTarget);
  }
}

/**
 * Builds and uploads firmware in one step.
 *
 * @param projectDir - Full reference target codebase directory.
 * @param port - Specific hardware routing destination.
 * @param environment - Optional build settings context block string.
 * @param verbose - If true, returns full operation output logs.
 * @returns Compound build sequence operation payload object.
 */
export async function buildAndUpload(
  projectDir: string,
  port?: string,
  environment?: string,
  verbose?: boolean,
): Promise<UploadResult> {
  // Upload target automatically builds first if needed
  return uploadFirmware(projectDir, port, environment, verbose);
}
