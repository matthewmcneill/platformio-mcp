/**
 * Portal Event Bus
 * Provides an event emitter singleton to stream data to the web dashboard.
 *
 * Provides:
 * - portalEvents: Global singleton event emitter for portal communication.
 */
import { EventEmitter } from 'events';

class PortalEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Allow higher limits as we could have many tools emitting concurrently during heavy loads
    this.setMaxListeners(50);
  }

  /**
   * Emit an agentic activity event.
   * @param toolName The name of the tool called
   * @param args The arguments passed to the tool
   * @param success Whether the execution was successful
   */
  emitActivity(toolName: string, args: Record<string, any>, success: boolean) {
    this.emit('agent_activity', {
      timestamp: Date.now(),
      toolName,
      args,
      success
    });
  }

  /**
   * Emit a build log stream
   */
  emitBuildLog(projectId: string, logLine: string) {
    this.emit('build_log', {
      timestamp: Date.now(),
      projectId,
      logLine
    });
  }

  /**
   * Emit a serial monitor read
   */
  emitSerialLog(port: string, data: string) {
    this.emit('serial_log', {
      timestamp: Date.now(),
      port,
      data
    });
  }

  /**
   * Emit general server status
   */
  emitServerStatus(status: 'online' | 'offline') {
    this.emit('server_status', {
      timestamp: Date.now(),
      status
    });
  }

  /**
   * Emit hardware queue lock status 
   */
  emitLockState(state: { isLocked: boolean; sessionId?: string; reason?: string }) {
    this.emit('lock_state', {
      timestamp: Date.now(),
      ...state
    });
  }

  /**
   * Emit spooler connection and config properties
   */
  emitSpoolerState(state: { active: boolean, port?: string, logFile?: string, autoReconnect: boolean }) {
    this.emit('spooler_state', state);
  }

  private lastKnownProjectDir?: string;

  /**
   * Caches and emits the last known dynamically targeted workspace directory.
   */
  emitWorkspaceState(projectDir: string) {
    this.lastKnownProjectDir = projectDir;
    this.emit('workspace_state', {
      timestamp: Date.now(),
      projectDir
    });
  }

  getLastKnownWorkspace() {
    return this.lastKnownProjectDir;
  }
}


/**
 * Singleton instance of the portal event emitter.
 * Used internally by MCP tools to stream live metrics.
 */
export const portalEvents = new PortalEventEmitter();
