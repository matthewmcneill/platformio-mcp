/**
 * Application Root Component
 * Wires up socket connections and manages the global React state.
 *
 * Provides:
 * - App: Main React Component
 */
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import AgentActivity from './components/agent-activity.js';
import BuildTerminal from './components/build-terminal.js';
import SerialLog from './components/serial-log.js';
import SettingsPanel from './components/settings-panel.js';

// Connect to the background PIO local express server
const socket: Socket = io(window.location.origin.includes('localhost:5173') ? 'http://localhost:8080' : '/');

export type AgentEvent = {
  timestamp: number;
  toolName: string;
  args: Record<string, any>;
  success: boolean;
};

export type LogEvent = {
  timestamp: number;
  projectId?: string;
  port?: string;
  logLine?: string;
  data?: string;
};

export type SpoolerState = {
  active: boolean;
  status: 'Idle' | 'Logging' | 'Flashing' | 'Connecting';
  port?: string;
  logFile?: string;
  autoReconnect: boolean;
};

export type LockState = {
  isLocked: boolean;
  sessionId?: string;
  reason?: string;
};

function App() {
  const [status, setStatus] = useState<'online' | 'offline'>('offline');
  const [activities, setActivities] = useState<AgentEvent[]>([]);
  const [buildLogs, setBuildLogs] = useState<LogEvent[]>([]);
  const [buildLogFile, setBuildLogFile] = useState<string | null>(null);
  const [serialLogs, setSerialLogs] = useState<Record<string, LogEvent[]>>({});
  const [spoolerStates, setSpoolerStates] = useState<Record<string, SpoolerState>>({});
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [lockState, setLockState] = useState<LockState>({ isLocked: false });

  useEffect(() => {
    socket.on('server_status', (data) => {
      setStatus(data.status);
    });

    socket.on('agent_activity', (data: AgentEvent) => {
      setActivities(prev => {
        const next = [data, ...prev];
        return next.slice(0, 100); // keep last 100 events
      });
    });

    socket.on('build_log', (data: LogEvent) => {
      setBuildLogs(prev => {
        const next = [...prev, data];
        return next.slice(-500); // keep last 500 lines
      });
    });

    socket.on('build_clear', (data: { logFile?: string }) => {
      setBuildLogs([]);
      setBuildLogFile(data.logFile || null);
    });

    socket.on('build_state', (data: { logFile?: string }) => {
      setBuildLogFile(data.logFile || null);
    });

    socket.on('serial_log', (data: LogEvent) => {
      if (!data.port) return;
      setSerialLogs(prev => {
        const portLogs = prev[data.port!] || [];
        const next = [...portLogs, data];
        return {
          ...prev,
          [data.port!]: next.slice(-1000) // keep last 1000 lines per port
        };
      });
    });

    socket.on('spooler_states', (data: Record<string, SpoolerState>) => {
      setSpoolerStates(data);
    });

    socket.on('workspace_state', (data: { projectDir: string }) => {
      setActiveWorkspace(data.projectDir);
    });

    socket.on('lock_state', (data: LockState) => {
      setLockState(data);
    });

    return () => {
      socket.off('server_status');
      socket.off('agent_activity');
      socket.off('build_log');
      socket.off('build_clear');
      socket.off('build_state');
      socket.off('serial_log');
      socket.off('spooler_states');
      socket.off('workspace_state');
      socket.off('lock_state');
    };
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <h1>PIO MCP Server</h1>
          <div className={`status-badge ${status}`}>
            <span className="dot"></span>
            {status.toUpperCase()}
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        <div className="grid-column left-column">
          <AgentActivity activities={activities} />
          <SettingsPanel status={status} socket={socket} lockState={lockState} />
        </div>
        <div className="grid-column right-column">
          <BuildTerminal logs={buildLogs} logFile={buildLogFile || undefined} />
          <SerialLog logs={serialLogs} spoolerStates={spoolerStates} activeWorkspace={activeWorkspace} lockState={lockState} />
        </div>
      </main>
    </div>
  )
}

export default App;
