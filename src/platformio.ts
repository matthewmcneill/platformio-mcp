/**
 * PlatformIO CLI Executor
 * Wraps the PlatformIO CLI commands and provides robust typed execution.
 * 
 * Provides:
 * - execPioCommand: Executes a raw PlatformIO CLI command.
 * - parsePioJsonOutput: Parses and validates command output via Zod.
 * - checkPlatformIOInstalled: Checks if PIO is locally available.
 * - getPlatformIOVersion: Retrieves PIO version.
 * - PlatformIOExecutor: Class encapsulating PIO CLI operations.
 * - platformioExecutor: Global instance of PlatformIOExecutor.
 * - DEFAULT_TIMEOUT: Standard timeout configuration for PIO commands.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import type { CommandResult } from './types.js';
import {
  PlatformIONotInstalledError,
  PlatformIOError,
  CommandTimeoutError,
  isPlatformIONotFoundError,
} from './utils/errors.js';

const execFileAsync = promisify(execFile);

// Default timeout for commands (5 minutes for builds)
const DEFAULT_TIMEOUT = 300000; // 5 minutes

/**
 * Executes a PlatformIO CLI command.
 * 
 * @param args - CLI arguments to pass to the PlatformIO binary.
 * @param options - Execution configuration options (timeout, cwd).
 * @returns Result containing standard outputs and exit code.
 */
export async function execPioCommand(
  args: string[],
  options: {
    cwd?: string;
    timeout?: number;
    parseJson?: boolean;
  } = {}
): Promise<CommandResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  try {
    // Try 'pio' first, then fall back to 'platformio'
    let result;
    try {
      result = await execFileAsync('pio', args, {
        cwd: options.cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });
    } catch (firstError) {
      // If 'pio' not found, try 'platformio'
      if (isPlatformIONotFoundError(firstError)) {
        try {
          result = await execFileAsync('platformio', args, {
            cwd: options.cwd,
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          });
        } catch (secondError) {
          if (isPlatformIONotFoundError(secondError)) {
            throw new PlatformIONotInstalledError();
          }
          throw secondError;
        }
      } else {
        throw firstError;
      }
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: 0,
    };
  } catch (error: any) {
    // Handle timeout
    if (error.killed && error.signal === 'SIGTERM') {
      throw new CommandTimeoutError(args.join(' '), timeout);
    }

    // Handle not found
    if (isPlatformIONotFoundError(error)) {
      throw new PlatformIONotInstalledError();
    }

    // Handle execution error with exit code
    if (error.code && error.stdout !== undefined) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code,
      };
    }

    throw error;
  }
}

/**
 * Parses JSON output from PlatformIO and validates with Zod schema.
 * 
 * @param output - Raw JSON string from CLI stdout.
 * @param schema - Zod schema to validate against for type safety.
 * @returns The strongly typed validated object payload.
 */
export function parsePioJsonOutput<T>(output: string, schema: z.ZodSchema<T>): T {
  if (!output || output.trim().length === 0) {
    throw new PlatformIOError('Empty output from PlatformIO command');
  }

  try {
    const parsed = JSON.parse(output);
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PlatformIOError(
        `Failed to parse PlatformIO output: ${error.message}`,
        'PARSE_ERROR',
        { zodError: error.issues, output: output.substring(0, 500) }
      );
    }
    if (error instanceof SyntaxError) {
      throw new PlatformIOError(
        `Invalid JSON output from PlatformIO: ${error.message}`,
        'INVALID_JSON',
        { output: output.substring(0, 500) }
      );
    }
    throw error;
  }
}

/**
 * Checks if PlatformIO CLI is installed and accessible.
 * 
 * @returns True if PlatformIO is available in the environment path; false otherwise.
 */
export async function checkPlatformIOInstalled(): Promise<boolean> {
  try {
    const result = await execPioCommand(['--version'], { timeout: 5000 });
    return result.exitCode === 0 && result.stdout.includes('PlatformIO');
  } catch (error) {
    if (error instanceof PlatformIONotInstalledError) {
      return false;
    }
    throw error;
  }
}

/**
 * Gets the PlatformIO version.
 * 
 * @returns The semantic version string of the local PlatformIO installation.
 */
export async function getPlatformIOVersion(): Promise<string> {
  try {
    const result = await execPioCommand(['--version'], { timeout: 5000 });
    if (result.exitCode === 0) {
      // Output format: "PlatformIO Core, version X.Y.Z"
      const match = result.stdout.match(/version\s+([\d\.]+)/i);
      return match ? match[1] : result.stdout.trim();
    }
    throw new PlatformIOError('Failed to get PlatformIO version');
  } catch (error) {
    if (error instanceof PlatformIONotInstalledError) {
      throw error;
    }
    throw new PlatformIOError('Failed to get PlatformIO version');
  }
}

/**
 * Class that encapsulates PlatformIO CLI operations
 */
export class PlatformIOExecutor {
  constructor() {}

  /**
   * Executes a PlatformIO command.
   * 
   * @param command - The PIO subcommand string.
   * @param args - Arguments array for the command.
   * @param options - Execution directives for the child process.
   * @returns Structured runtime output results.
   */
  async execute(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<CommandResult> {
    const fullArgs = [command, ...args];
    return execPioCommand(fullArgs, options);
  }

  /**
   * Checks if PlatformIO is installed.
   * 
   * @returns A boolean resolving true if PlatformIO is ready.
   */
  async checkInstallation(): Promise<boolean> {
    return checkPlatformIOInstalled();
  }

  /**
   * Gets PlatformIO version.
   * 
   * @returns The resolved PIO version.
   */
  async getVersion(): Promise<string> {
    return getPlatformIOVersion();
  }

  /**
   * Executes a command and parses JSON output.
   * 
   * @param command - Core PlatformIO subcommand logic.
   * @param args - Configuration and CLI flag values.
   * @param schema - Schema for JSON output validation.
   * @param options - Operational execution directives.
   * @returns Parsed and validated JSON node entity.
   */
  async executeWithJsonOutput<T>(
    command: string,
    args: string[],
    schema: z.ZodSchema<T>,
    options?: { cwd?: string; timeout?: number }
  ): Promise<T> {
    // Ensure --json-output is included
    const fullArgs = [...args];
    if (!fullArgs.includes('--json-output')) {
      fullArgs.push('--json-output');
    }

    const result = await this.execute(command, fullArgs, options);

    if (result.exitCode !== 0) {
      throw new PlatformIOError(
        `PlatformIO command failed: ${command} ${args.join(' ')}`,
        'COMMAND_FAILED',
        { stderr: result.stderr, exitCode: result.exitCode }
      );
    }

    return parsePioJsonOutput(result.stdout, schema);
  }
}

/**
 * Global executor instance
 */
export const platformioExecutor = new PlatformIOExecutor();
