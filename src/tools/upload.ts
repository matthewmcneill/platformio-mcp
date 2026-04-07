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

/**
 * Uploads firmware to a connected device.
 * 
 * @param projectDir - Path to the project root slated for upload.
 * @param port - Optional override for destination serial connection.
 * @param environment - Target PIO runtime context block.
 * @returns Upload completion status and output streams.
 */
export async function uploadFirmware(
  projectDir: string,
  port?: string,
  environment?: string
): Promise<UploadResult> {
  const validatedPath = validateProjectPath(projectDir);

  if (environment && !validateEnvironmentName(environment)) {
    throw new UploadError(`Invalid environment name: ${environment}`, { environment });
  }

  if (port && !validateSerialPort(port)) {
    throw new UploadError(`Invalid serial port: ${port}`, { port });
  }

  const lockTarget = port || 'auto';
  stopSpoolingDaemon(lockTarget); // Always halt spooler prior to claiming the lock
  serialManager.lockPort(lockTarget);

  try {
    const args: string[] = ['run', '--target', 'upload'];

    // Add environment if specified
    if (environment) {
      args.push('--environment', environment);
    }

    // Add upload port if specified
    if (port) {
      args.push('--upload-port', port);
    }

    const result = await platformioExecutor.execute('run', args.slice(1), {
      cwd: validatedPath,
      timeout: 300000, // 5 minutes
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
      output: success ? undefined : result.stdout,
      errors,
      diagnostics
    };
  } catch (error) {
    if (error instanceof PlatformIOError) {
      throw new UploadError(
        `Upload failed: ${error.message}`,
        { projectDir, port, environment }
      );
    }
    throw new UploadError(
      `Failed to upload firmware: ${error}`,
      { projectDir, port, environment }
    );
  } finally {
    serialManager.unlockPort(lockTarget);
  }
}

/**
 * Uploads firmware and starts serial monitor (upload + monitor).
 * 
 * @param projectDir - Applicable codebase tree.
 * @param port - Specific hardware port to flash and watch.
 * @param environment - Bound environment parameters execution context.
 * @returns Terminal logging outputs array sequence from upload.
 */
export async function uploadAndMonitor(
  projectDir: string,
  port?: string,
  environment?: string
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
      output: success ? undefined : result.stdout,
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
 * @returns Compound build sequence operation payload object.
 */
export async function buildAndUpload(
  projectDir: string,
  port?: string,
  environment?: string
): Promise<UploadResult> {
  // Upload target automatically builds first if needed
  return uploadFirmware(projectDir, port, environment);
}
