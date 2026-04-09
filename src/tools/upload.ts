/**
 * Firmware Upload Tools
 * Firmware upload operations and sequencing tools.
 * 
 * Provides:
 * - uploadFirmware: Targets serial devices and drops compiled hex/bin.
 * - uploadAndMonitor: Drops firmware and attaches realtime observer.
 * - buildAndUpload: Compiles and dispatches binaries.
 */

import { platformioExecutor } from '../platformio.js';
import type { UploadResult } from '../types.js';
import { validateProjectPath, validateEnvironmentName, validateSerialPort } from '../utils/validation.js';
import { UploadError, PlatformIOError } from '../utils/errors.js';
import { parseStderrErrors } from '../utils/errors.js';
import { serialManager } from '../utils/serial-manager.js';
import { diagnoseError } from '../utils/diagnostics.js';
import { startSpoolingDaemon, stopSpoolingDaemon } from './monitor.js';
import { portalEvents } from '../api/events.js';

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
  skipBuild?: boolean,
  startSpoolingAfter?: boolean
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, { environment });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  try {
    if (!skipBuild) {
      const buildArgs: string[] = ['run', '--target', 'buildfs'];
      if (environment) buildArgs.push('--environment', environment);

      // Phase A: Compile first WITHOUT locking UART
      portalEvents.emitBuildLog(validatedPath, "Phase 1: Building filesystem image...\n");
      const buildResult = await platformioExecutor.execute('run', buildArgs.slice(1), {
        cwd: validatedPath,
        timeout: 300000, // 5 minutes
        onOutput: (chunk) => portalEvents.emitBuildLog(validatedPath, chunk),
      });

      if (buildResult.exitCode !== 0) {
        return {
          success: false,
          port,
          output: verbose ? buildResult.stdout : undefined,
          errors: parseStderrErrors(buildResult.stderr),
          diagnostics: diagnoseError(buildResult.stderr)
        };
      }
    }

    // Phase B: Resolve port, Kill Spooler, Lock UART, Upload
    let activePort = port;
    if (!activePort) {
      const { getFirstDevice } = await import('./devices.js');
      const defaultDevice = await getFirstDevice();
      if (!defaultDevice) throw new PlatformIOError('No serial devices detected for upload.', 'PORT_NOT_FOUND');
      activePort = defaultDevice.port;
    }

    const { getSpoolerState } = await import('./monitor.js');
    const spoolerStatus = getSpoolerState();
    const shouldAutoReconnect = startSpoolingAfter || (spoolerStatus.active && spoolerStatus.autoReconnect);

    const lockTarget = activePort;
    stopSpoolingDaemon(lockTarget);
    serialManager.lockPort(lockTarget);

    portalEvents.emitBuildLog(validatedPath, `\nPhase 2: Flashing filesystem image to ${lockTarget}...\n`);
    
    let uploadSuccess = false;
    let uploadResult;
    try {
      const uploadArgs: string[] = ['run', '--target', 'nobuild', '--target', 'uploadfs'];
      if (environment) uploadArgs.push('--environment', environment);
      uploadArgs.push('--upload-port', lockTarget);

      uploadResult = await platformioExecutor.execute('run', uploadArgs.slice(1), {
        cwd: validatedPath,
        timeout: 120000, // 2 minutes
        onOutput: (chunk) => portalEvents.emitBuildLog(validatedPath, chunk),
      });

      uploadSuccess = uploadResult.exitCode === 0;
    } finally {
      serialManager.unlockPort(lockTarget);
      if (shouldAutoReconnect) {
        startSpoolingDaemon(lockTarget).catch(e => console.error("Auto-spooler failed to restart after upload", e));
      }
    }

    return {
      success: uploadSuccess,
      port: activePort,
      output: (uploadSuccess && !verbose) ? undefined : uploadResult.stdout,
      errors: uploadSuccess ? undefined : parseStderrErrors(uploadResult.stderr),
      diagnostics: uploadSuccess ? undefined : diagnoseError(uploadResult.stderr)
    };
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(`Filesystem upload failed: ${error.message}`, { projectDir, port, environment });
    }
    throw new UploadError(`Failed to upload filesystem: ${error}`, { projectDir, port, environment });
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
  skipBuild?: boolean,
  startSpoolingAfter?: boolean
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, { environment });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  try {
    if (!skipBuild) {
      const buildArgs: string[] = ['run'];
      if (environment) buildArgs.push('--environment', environment);

      // Phase A: Compile first WITHOUT locking UART
      portalEvents.emitBuildLog(validatedPath, "Phase 1: Compiling firmware...\n");
      const buildResult = await platformioExecutor.execute('run', buildArgs.slice(1), {
        cwd: validatedPath,
        timeout: 300000, // 5 minutes
        onOutput: (chunk) => portalEvents.emitBuildLog(validatedPath, chunk),
      });

      if (buildResult.exitCode !== 0) {
        return {
          success: false,
          port,
          output: verbose ? buildResult.stdout : undefined,
          errors: parseStderrErrors(buildResult.stderr),
          diagnostics: diagnoseError(buildResult.stderr)
        };
      }
    }

    // Phase B: Resolve port, Kill Spooler, Lock UART, Upload
    let activePort = port;
    if (!activePort) {
      const { getFirstDevice } = await import('./devices.js');
      const defaultDevice = await getFirstDevice();
      if (!defaultDevice) throw new PlatformIOError('No serial devices detected for upload.', 'PORT_NOT_FOUND');
      activePort = defaultDevice.port;
    }

    const { getSpoolerState } = await import('./monitor.js');
    const spoolerStatus = getSpoolerState();
    const shouldAutoReconnect = startSpoolingAfter || (spoolerStatus.active && spoolerStatus.autoReconnect);

    const lockTarget = activePort;
    stopSpoolingDaemon(lockTarget);
    serialManager.lockPort(lockTarget);

    portalEvents.emitBuildLog(validatedPath, `\nPhase 2: Flashing firmware to ${lockTarget}...\n`);
    
    let uploadSuccess = false;
    let uploadResult;
    try {
      const uploadArgs: string[] = ['run', '--target', 'nobuild', '--target', 'upload'];
      if (environment) uploadArgs.push('--environment', environment);
      uploadArgs.push('--upload-port', lockTarget);

      uploadResult = await platformioExecutor.execute('run', uploadArgs.slice(1), {
        cwd: validatedPath,
        timeout: 120000, // 2 minutes
        onOutput: (chunk) => portalEvents.emitBuildLog(validatedPath, chunk),
      });

      uploadSuccess = uploadResult.exitCode === 0;
    } finally {
      serialManager.unlockPort(lockTarget);
      if (shouldAutoReconnect) {
        startSpoolingDaemon(lockTarget).catch(e => console.error("Auto-spooler failed to restart after upload", e));
      }
    }

    return {
      success: uploadSuccess,
      port: activePort,
      output: (uploadSuccess && !verbose) ? undefined : uploadResult.stdout,
      errors: uploadSuccess ? undefined : parseStderrErrors(uploadResult.stderr),
      diagnostics: uploadSuccess ? undefined : diagnoseError(uploadResult.stderr)
    };
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(`Upload failed: ${error.message}`, { projectDir, port, environment });
    }
    throw new UploadError(`Failed to upload firmware: ${error}`, { projectDir, port, environment });
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
  verbose?: boolean
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, { environment });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  const lockTarget = port || 'auto';
  stopSpoolingDaemon(lockTarget);
  serialManager.lockPort(lockTarget);

  try {
    const args: string[] = ['run', '--target', 'upload', '--target', 'monitor'];

    if (environment) {
      args.push('--environment', environment);
    }

    if (port) {
      args.push('--upload-port', port);
      args.push('--monitor-port', port);
    }

    const result = await platformioExecutor.execute('run', args.slice(1), {
      cwd: validatedPath,
      timeout: 300000,
      onOutput: (chunk) => portalEvents.emitBuildLog(validatedPath, chunk),
    });

    const success = result.exitCode === 0;
    const errors = success ? undefined : parseStderrErrors(result.stderr);
    const diagnostics = success ? undefined : diagnoseError(result.stderr);

    if (success) {
      startSpoolingDaemon(lockTarget).catch(e => console.error("Auto-spooler failed to restart after upload", e));
    }

    return {
      success,
      port,
      output: (success && !verbose) ? undefined : result.stdout,
      errors,
      diagnostics
    };
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(
        `Upload and monitor failed: ${error.message}`,
        { projectDir, port, environment }
      );
    }
    throw new UploadError(
      `Failed to upload and monitor: ${error}`,
      { projectDir, port, environment }
    );
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
  verbose?: boolean
): Promise<UploadResult> {
  // Upload target automatically builds first if needed
  return uploadFirmware(projectDir, port, environment, verbose);
}
