/**
 * Serial Monitor Tools
 * Serial monitor tools and process spawning.
 * 
 * Provides:
 * - startMonitor: Provides generalized monitor process handler.
 * - getMonitorCommand: Generates standard PIO monitor string.
 * - getMonitorCommandWithFilters: Appends diagnostic filters to CLI list.
 * - getRawMonitorInstructions: Appends raw bitstream payload parsing options.
 */

import type { MonitorResult } from '../types.js';
import { validateSerialPort, validateBaudRate, validateProjectPath } from '../utils/validation.js';
import { PlatformIOError } from '../utils/errors.js';

/**
 * Provides information and command for starting a serial monitor.
 * Note: The actual monitor is interactive and can't run in the background,
 * so we return instructions for the user.
 * 
 * @param port - Optional specific serial port to interface with.
 * @param baud - Optional baud rate communication speed.
 * @param projectDir - Optional target local PIO project root.
 * @returns Metadata wrapper payload containing instruction context.
 */
export async function startMonitor(
  port?: string,
  baud?: number,
  projectDir?: string
): Promise<MonitorResult> {
  // Validate inputs
  if (port && !validateSerialPort(port)) {
    throw new PlatformIOError(`Invalid serial port: ${port}`, 'INVALID_PORT', { port });
  }

  if (baud && !validateBaudRate(baud)) {
    throw new PlatformIOError(`Invalid baud rate: ${baud}`, 'INVALID_BAUD', { baud });
  }

  if (projectDir) {
    try {
      validateProjectPath(projectDir);
    } catch (error) {
      throw new PlatformIOError(`Invalid project directory: ${error}`, 'INVALID_PATH', { projectDir });
    }
  }

  // Build the command
  let command = 'pio device monitor';

  if (port) {
    command += ` --port ${port}`;
  }

  if (baud) {
    command += ` --baud ${baud}`;
  }

  if (projectDir) {
    command = `cd ${projectDir} && ${command}`;
  }

  const message = 
    'Serial monitor requires interactive terminal access. ' +
    'Please run the following command in your terminal:\n\n' +
    `  ${command}\n\n` +
    'Press Ctrl+C to exit the monitor.\n\n' +
    'Note: If port and baud rate are not specified, PlatformIO will auto-detect them ' +
    'from your platformio.ini configuration.';

  return {
    success: true,
    message,
    command,
  };
}

/**
 * Gets the monitor command string for a project.
 * 
 * @param port - Optional serial com path.
 * @param baud - Optional serial rate.
 * @param projectDir - Associated project reference path.
 * @returns Ready-to-execute terminal CLI string.
 */
export function getMonitorCommand(
  port?: string,
  baud?: number,
  projectDir?: string
): string {
  let command = 'pio device monitor';

  if (port) {
    command += ` --port ${port}`;
  }

  if (baud) {
    command += ` --baud ${baud}`;
  }

  if (projectDir) {
    command = `cd ${projectDir} && ${command}`;
  }

  return command;
}

/**
 * Gets monitor command with custom filters.
 * 
 * @param options - Assorted filtering configuration options.
 * @returns Generated CLI invocation text.
 */
export function getMonitorCommandWithFilters(options: {
  port?: string;
  baud?: number;
  projectDir?: string;
  filters?: string[];
  echo?: boolean;
  eol?: 'CR' | 'LF' | 'CRLF';
}): string {
  let command = 'pio device monitor';

  if (options.port) {
    command += ` --port ${options.port}`;
  }

  if (options.baud) {
    command += ` --baud ${options.baud}`;
  }

  if (options.echo !== undefined) {
    command += ` --echo`;
  }

  if (options.eol) {
    command += ` --eol ${options.eol}`;
  }

  if (options.filters && options.filters.length > 0) {
    for (const filter of options.filters) {
      command += ` --filter ${filter}`;
    }
  }

  if (options.projectDir) {
    command = `cd ${options.projectDir} && ${command}`;
  }

  return command;
}

/**
 * Provides instructions for using the raw monitor mode.
 * 
 * @param port - Specified raw port to watch.
 * @param baud - UART rate synchronization value.
 * @returns Structured instructional summary for the developer.
 */
export function getRawMonitorInstructions(port: string, baud: number): MonitorResult {
  if (!validateSerialPort(port)) {
    throw new PlatformIOError(`Invalid serial port: ${port}`, 'INVALID_PORT', { port });
  }

  if (!validateBaudRate(baud)) {
    throw new PlatformIOError(`Invalid baud rate: ${baud}`, 'INVALID_BAUD', { baud });
  }

  const command = `pio device monitor --port ${port} --baud ${baud} --raw`;

  const message = 
    'Raw monitor mode provides unfiltered serial output.\n' +
    'Run the following command in your terminal:\n\n' +
    `  ${command}\n\n` +
    'Press Ctrl+C to exit the monitor.';

  return {
    success: true,
    message,
    command,
  };
}
