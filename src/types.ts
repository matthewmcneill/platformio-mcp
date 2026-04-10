/**
 * Global Type Definitions
 * Type definitions and Zod schemas for PlatformIO MCP Server.
 *
 * Provides:
 * - CommandResult: Execution stdout/stderr schema.
 * - BoardInfo: Detailed board specification parameters.
 * - SerialDevice: Detected serial port schema.
 * - ProjectConfig: Project initialization shape.
 * - BuildResult: Build status structure.
 * - UploadConfig: Upload execution parameters.
 * - MonitorConfig: Serial monitor options.
 * - LibraryInfo: PlatformIO registry library metadata.
 */

import { z } from "zod";
import type { DiagnosticSummary } from "./utils/diagnostics.js";

// ============================================================================
// Command Result Types
// ============================================================================

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ============================================================================
// Board Types
// ============================================================================

export interface BoardInfo {
  id: string;
  name: string;
  platform: string;
  mcu: string;
  frequency?: string;
  flash?: number;
  ram?: number;
  fcpu?: number;
  rom?: number;
  frameworks?: string[];
  vendor?: string;
  url?: string;
}

export const BoardInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  mcu: z.string(),
  frequency: z.string().optional(),
  flash: z.number().optional(),
  ram: z.number().optional(),
  fcpu: z.number().optional(),
  rom: z.number().optional(),
  frameworks: z.array(z.string()).optional(),
  vendor: z.string().optional(),
  url: z.string().optional(),
});

// PlatformIO boards JSON output is an array of board objects
export const BoardsArraySchema = z.array(BoardInfoSchema);

// ============================================================================
// Device Types
// ============================================================================

export interface SerialDevice {
  port: string;
  description: string;
  hwid: string;
  detectedBoard?: string;
}

export const SerialDeviceSchema = z.object({
  port: z.string(),
  description: z.string(),
  hwid: z.string(),
  detectedBoard: z.string().optional(),
});

export const DevicesArraySchema = z.array(SerialDeviceSchema);

// ============================================================================
// Project Types
// ============================================================================

export interface ProjectConfig {
  board: string;
  framework?: string;
  projectDir?: string;
  platformOptions?: Record<string, string>;
}

export const ProjectConfigSchema = z.object({
  board: z.string().min(1, "Board ID is required"),
  framework: z.string().optional(),
  projectDir: z.string().optional(),
  platformOptions: z.record(z.string(), z.string()).optional(),
});

export interface ProjectInitResult {
  success: boolean;
  path: string;
  message: string;
}

// ============================================================================
// Build Types
// ============================================================================

export interface BuildResult {
  success: boolean;
  environment: string;
  output?: string;
  errors?: string[];
  ramUsageBytes?: number;
  flashUsageBytes?: number;
  diagnostics?: DiagnosticSummary;
}

export interface CleanResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadConfig {
  projectDir: string;
  port?: string;
  environment?: string;
}

export const UploadConfigSchema = z.object({
  projectDir: z.string().min(1, "Project directory is required"),
  port: z.string().optional(),
  environment: z.string().optional(),
});

export interface UploadResult {
  success: boolean;
  port?: string;
  output?: string;
  errors?: string[];
  diagnostics?: DiagnosticSummary;
}

// ============================================================================
// Monitor Types
// ============================================================================

export interface MonitorConfig {
  port?: string;
  baud?: number;
  projectDir?: string;
  durationSeconds?: number;
}

export const MonitorConfigSchema = z.object({
  port: z.string().optional(),
  baud: z.number().positive().optional(),
  projectDir: z.string().optional(),
  durationSeconds: z.number().positive().optional().default(5),
});

export interface MonitorResult {
  success: boolean;
  bufferOutput: string;
  panicTriggered: boolean;
}

// ============================================================================
// Library Types
// ============================================================================

export interface LibraryAuthor {
  name: string;
  email?: string;
  maintainer?: boolean;
}

export interface LibraryRepository {
  type: string;
  url: string;
}

export interface LibraryInfo {
  id?: number;
  name: string;
  description?: string;
  keywords?: string[];
  authors?: LibraryAuthor[];
  repository?: LibraryRepository;
  version?: string;
  frameworks?: any[];
  platforms?: any[];
  homepage?: string;
}

export const LibraryInfoSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  authors: z
    .array(
      z.object({
        name: z.string(),
        email: z.string().optional(),
        maintainer: z.boolean().optional(),
      }),
    )
    .optional(),
  repository: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
  version: z.string().optional(),
  frameworks: z.array(z.any()).optional(),
  platforms: z.array(z.any()).optional(),
  homepage: z.string().optional(),
});

export const LibrariesArraySchema = z.array(LibraryInfoSchema);
export const LibrariesObjectSchema = z.record(
  z.string(),
  z.array(LibraryInfoSchema),
);

export const LibrarySearchResponseSchema = z.object({
  searchQuery: z.string().optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  items: z.array(LibraryInfoSchema),
});

export interface LibrarySearchConfig {
  query: string;
  limit?: number;
}

export const LibrarySearchConfigSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  limit: z.number().positive().optional(),
});

export interface LibraryInstallConfig {
  library: string;
  projectDir?: string;
  version?: string;
}

export const LibraryInstallConfigSchema = z.object({
  library: z.string().min(1, "Library name is required"),
  projectDir: z.string().optional(),
  version: z.string().optional(),
});

export interface LibraryInstallResult {
  success: boolean;
  library: string;
  message: string;
}

// ============================================================================
// Platform Types
// ============================================================================

export interface PlatformInfo {
  name: string;
  title: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string;
  frameworks?: string[];
  packages?: string[];
}

// ============================================================================
// MCP Tool Parameter Schemas
// ============================================================================

// List boards parameters
export const ListBoardsParamsSchema = z.object({
  filter: z
    .string()
    .optional()
    .describe("Optional filter by platform, framework, or MCU"),
});

// Hardware Lock parameters
export const AcquireLockParamsSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .describe(
      "Unique ID of the agent session acquiring the lock for a multi-step pipeline",
    ),
  reason: z
    .string()
    .optional()
    .describe("Reason for acquiring the lock (e.g., Task Name)"),
});

export const ReleaseLockParamsSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .describe("Unique ID of the agent session releasing the lock"),
});

// Get board info parameters
export const GetBoardInfoParamsSchema = z.object({
  boardId: z.string().min(1).describe("Board ID to retrieve information for"),
});

// Init project parameters
export const InitProjectParamsSchema = z.object({
  board: z.string().min(1).describe("Board ID for the project"),
  framework: z
    .string()
    .optional()
    .describe("Framework to use (e.g., arduino, espidf)"),
  projectDir: z
    .string()
    .describe("Directory path where the project should be created"),
  platformOptions: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional platform-specific options"),
});

// Build project parameters
export const BuildProjectParamsSchema = z.object({
  projectDir: z
    .string()
    .min(1)
    .describe("Path to the PlatformIO project directory"),
  environment: z
    .string()
    .optional()
    .describe("Specific environment to build (from platformio.ini)"),
  sessionId: z
    .string()
    .optional()
    .describe("Agent session ID for pipeline lock validation"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If true, returns the complete verbose build log in the result instead of truncating it on success",
    ),
});

// Clean project parameters
export const CleanProjectParamsSchema = z.object({
  projectDir: z
    .string()
    .min(1)
    .describe("Path to the PlatformIO project directory"),
  sessionId: z
    .string()
    .optional()
    .describe("Agent session ID for pipeline lock validation"),
});

// Upload firmware parameters
export const UploadFirmwareParamsSchema = z.object({
  projectDir: z
    .string()
    .min(1)
    .describe("Path to the PlatformIO project directory"),
  port: z
    .string()
    .optional()
    .describe("Upload port (auto-detected if not specified)"),
  environment: z
    .string()
    .optional()
    .describe("Specific environment to upload (from platformio.ini)"),
  sessionId: z
    .string()
    .optional()
    .describe("Agent session ID for pipeline lock validation"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If true, returns the complete verbose upload log in the result instead of truncating it",
    ),
  startSpoolingAfter: z
    .boolean()
    .optional()
    .describe(
      "If true, forces the background spooler tracking to start automatically after the flash completes",
    ),
});

// Upload filesystem parameters
export const UploadFilesystemParamsSchema = z.object({
  projectDir: z
    .string()
    .min(1)
    .describe("Path to the PlatformIO project directory"),
  port: z
    .string()
    .optional()
    .describe("Upload port (auto-detected if not specified)"),
  environment: z
    .string()
    .optional()
    .describe("Specific environment to upload (from platformio.ini)"),
  sessionId: z
    .string()
    .optional()
    .describe("Agent session ID for pipeline lock validation"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If true, returns the complete verbose upload log in the result instead of truncating it",
    ),
  startSpoolingAfter: z
    .boolean()
    .optional()
    .describe(
      "If true, forces the background spooler tracking to start automatically after the flash completes",
    ),
});

// Start monitor parameters
export const StartMonitorParamsSchema = z.object({
  port: z
    .string()
    .optional()
    .describe("Serial port to monitor (auto-detected if not specified)"),
  baud: z.number().optional().describe("Baud rate for serial communication"),
  projectDir: z
    .string()
    .optional()
    .describe("Project directory (for environment-specific settings)"),
  durationSeconds: z
    .number()
    .optional()
    .describe("Duration to read from the serial port in seconds"),
  sessionId: z
    .string()
    .optional()
    .describe("Agent session ID for pipeline lock validation"),
});

// Search libraries parameters
export const SearchLibrariesParamsSchema = z.object({
  query: z.string().min(1).describe("Search query for libraries"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results to return"),
});

// Install library parameters
export const InstallLibraryParamsSchema = z.object({
  library: z.string().min(1).describe("Library name or ID to install"),
  projectDir: z
    .string()
    .optional()
    .describe("Project directory (installs globally if not specified)"),
  version: z.string().optional().describe("Specific version to install"),
});

// List installed libraries parameters
export const ListInstalledLibrariesParamsSchema = z.object({
  projectDir: z
    .string()
    .optional()
    .describe("Project directory (lists global libraries if not specified)"),
});

// Query logs parameters
export const QueryLogsParamsSchema = z.object({
  lines: z
    .number()
    .optional()
    .default(100)
    .describe("Fetch this many tail lines from the end of the log"),
  searchPattern: z
    .string()
    .optional()
    .describe("Optional Regex pattern to filter the spool for specific keywords."),
  projectDir: z
    .string()
    .optional()
    .describe("Target project checkout to query local .log cache."),
  port: z
    .string()
    .optional()
    .describe("Specific COM port to query logs for."),
});
