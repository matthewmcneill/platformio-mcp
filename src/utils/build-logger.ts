/**
 * Build Logger Utility
 * Manages persistence and rotation for compiler and flash output logs.
 *
 * Provides:
 * - buildLogger: Singleton instance of BuildLogger.
 * - BuildLogger: Class for managing build-specific log streams.
 */

import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR, ensureDir } from "./paths.js";

/**
 * Handles log file persistence and rotation for build/flash operations.
 */
export class BuildLogger {
  private activeStream: fs.WriteStream | null = null;
  private latestStream: fs.WriteStream | null = null;
  private currentLogFile: string | null = null;

  constructor() {
    ensureDir(LOGS_DIR);
  }

  /**
   * Rotates build logs to prevent disk bloat.
   * @param maxHistory Maximum number of dated build logs to retain.
   */
  private rotateLogs(maxHistory = 30): void {
    if (!fs.existsSync(LOGS_DIR)) return;

    const files = fs
      .readdirSync(LOGS_DIR)
      .filter((f) => f.startsWith("build-") && f.endsWith(".log"))
      .map((f) => ({
        name: f,
        path: path.join(LOGS_DIR, f),
        ctime: fs.statSync(path.join(LOGS_DIR, f)).ctime.getTime(),
      }))
      .sort((a, b) => b.ctime - a.ctime); // Newest first

    if (files.length > maxHistory) {
      const toDelete = files.slice(maxHistory);
      for (const f of toDelete) {
        try {
          fs.unlinkSync(f.path);
        } catch (e) {
          console.error(`[BuildLogger] Failed to delete old log ${f.name}:`, e);
        }
      }
    }
  }

  /**
   * Starts a new build log session, rotating old ones and updating 'latest-build.log'.
   * @param projectDir Optional project-specific directory (currently fallbacks to global LOGS_DIR).
   */
  public startNewLog(projectDir?: string): string {
    const targetDir = projectDir ? path.join(projectDir, "logs") : LOGS_DIR;
    ensureDir(targetDir);

    this.rotateLogs();

    // End previous streams if any
    if (this.activeStream) this.activeStream.end();
    if (this.latestStream) this.latestStream.end();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(targetDir, `build-${timestamp}.log`);
    const latestLog = path.join(targetDir, "latest-build.log");

    this.currentLogFile = logFile;
    this.activeStream = fs.createWriteStream(logFile, { flags: "a" });
    this.latestStream = fs.createWriteStream(latestLog, { flags: "w" });

    return logFile;
  }

  /**
   * Writes a chunk of output to both the dated log and the latest log.
   * @param chunk The text to write.
   */
  public writeLog(chunk: string): void {
    if (this.activeStream) this.activeStream.write(chunk);
    if (this.latestStream) this.latestStream.write(chunk);
  }

  /**
   * Returns the path to the currently active log file.
   */
  public getCurrentLogFile(): string | null {
    return this.currentLogFile;
  }

  /**
   * Returns the path to the most recent log file (dated or generic).
   */
  public getLatestLogFile(): string | null {
    if (this.currentLogFile && fs.existsSync(this.currentLogFile)) {
      return this.currentLogFile;
    }

    const latestGeneric = path.join(LOGS_DIR, "latest-build.log");
    if (fs.existsSync(latestGeneric)) {
      return latestGeneric;
    }

    return null;
  }
}

/**
 * Singleton instance of the BuildLogger.
 */
export const buildLogger = new BuildLogger();
