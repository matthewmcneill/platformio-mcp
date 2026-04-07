/**
 * In-Memory Serial Port Management.
 * Singleton tracking tty port states across operations.
 * 
 * Provides:
 * - SerialManager: Singleton class to lock/unlock serial ports during operations
 * - serialManager: Default exported instance
 */

export class SerialManager {
  private static instance: SerialManager;
  private activeLocks: Map<string, boolean>;

  private constructor() {
    this.activeLocks = new Map<string, boolean>();
  }

  /**
   * Retrieves the global singleton instance
   */
  public static getInstance(): SerialManager {
    if (!SerialManager.instance) {
      SerialManager.instance = new SerialManager();
    }
    return SerialManager.instance;
  }

  /**
   * Attempts to claim a logic lock on a hardware port.
   * Throws an error if another operation currently holds the port.
   * @param port The tty / COM port to lock
   */
  public lockPort(port: string): void {
    if (this.activeLocks.get(port)) {
      throw new Error(`PortBusy: ${port} is currently locked by another process.`);
    }
    this.activeLocks.set(port, true);
  }

  /**
   * Releases a claim on a hardware port.
   * @param port The tty / COM port to unlock
   */
  public unlockPort(port: string): void {
    this.activeLocks.set(port, false);
  }

  /**
   * Checks if a hardware port is currently locked.
   * @param port The tty / COM port to check
   * @returns boolean True if locked
   */
  public isLocked(port: string): boolean {
    return !!this.activeLocks.get(port);
  }
}

export const serialManager = SerialManager.getInstance();
