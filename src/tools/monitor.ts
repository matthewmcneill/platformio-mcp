/**
 * Serial Monitor Spooler Daemon
 * Background persistence and web-portal event forwarding for serial logs.
 * 
 * Provides:
 * - startSpoolingDaemon: Initiates an asynchronous serial hook directly to disk.
 * - stopSpoolingDaemon: Safely kills the daemon and unlocks the port.
 * - queryLogs: Pulls historical/grep'd records from the spool buffer safely.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SerialPort } from 'serialport';
import { validateSerialPort, validateBaudRate } from '../utils/validation.js';
import { PlatformIOError } from '../utils/errors.js';
import { serialManager } from '../utils/serial-manager.js';
import { getFirstDevice } from './devices.js';
import { portalEvents } from '../api/events.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Directory for actively tracking background execution buffers */
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

type DaemonContext = {
  port: SerialPort | null;
  baudRate: number;
  stream1: fs.WriteStream;
  stream2: fs.WriteStream;
  intentionallyClosed: boolean;
  reconnectTimer?: NodeJS.Timeout;
  logFile: string;
  autoReconnect: boolean;
};
const activeDaemons: Record<string, DaemonContext> = {};

export function getSpoolerState() {
  const ports = Object.keys(activeDaemons);
  if (ports.length > 0) {
    const daemon = activeDaemons[ports[0]];
    return {
      active: true,
      port: ports[0],
      logFile: daemon.logFile,
      autoReconnect: daemon.autoReconnect
    };
  }
  return { active: false, autoReconnect: true };
}

/**
 * Clears outdated serial traces beyond the rotation limit to prevent disk bloat.
 * 
 * @param maxHistory - Maximum total bounded files to retain.
 */
function rotateLogs(maxHistory = 30) {
  if (!fs.existsSync(LOG_DIR)) return;
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('device-monitor-') && f.endsWith('.log'))
    .map(f => ({ name: f, path: path.join(LOG_DIR, f), ctime: fs.statSync(path.join(LOG_DIR, f)).ctime.getTime() }))
    .sort((a, b) => b.ctime - a.ctime); // Newest first

  if (files.length > maxHistory) {
    const toDelete = files.slice(maxHistory);
    for (const f of toDelete) {
      try { fs.unlinkSync(f.path); } catch (e) {}
    }
  }
}

/**
 * Destroys any active serialport daemon to cleanly relinquish the mutex lock.
 * 
 * @param port - Identifier of the engaged port to abandon.
 */
export function stopSpoolingDaemon(port: string) {
  if (activeDaemons[port]) {
    const daemon = activeDaemons[port];
    daemon.intentionallyClosed = true;
    if (daemon.reconnectTimer) clearTimeout(daemon.reconnectTimer);

    daemon.stream1.end();
    daemon.stream2.end();
    if (daemon.port && daemon.port.isOpen) {
      try { daemon.port.close(); } catch(e) {}
    }
    delete activeDaemons[port];
    try {
      serialManager.unlockPort(port);
    } catch(e) {}
    portalEvents.emitSpoolerState?.(getSpoolerState());
  }
}

function startReconnectPolling(targetPort: string) {
  const daemon = activeDaemons[targetPort];
  if (!daemon || daemon.intentionallyClosed || daemon.reconnectTimer) return;

  const startTime = Date.now();

  const attemptConnect = () => {
    if (daemon.intentionallyClosed || !daemon.autoReconnect) return;

    // Determine backoff logic: 500ms for first 30 seconds, 2000ms after
    const elapsed = Date.now() - startTime;
    const pollInterval = elapsed < 30000 ? 500 : 2000;

    const serial = new SerialPort({ path: targetPort, baudRate: daemon.baudRate, autoOpen: false });
    
    serial.open((err) => {
      if (err) {
        // Failed to connect, queue next attempt
        daemon.reconnectTimer = setTimeout(attemptConnect, pollInterval);
      } else {
        // Successfully reconnected
        console.error(`[Spooler] Successfully restored physical interface to ${targetPort}`);
        daemon.reconnectTimer = undefined;
        daemon.port = serial;
        attachSerialEvents(serial, targetPort);
      }
    });
  };

  daemon.reconnectTimer = setTimeout(attemptConnect, 500);
}

function attachSerialEvents(serial: SerialPort, targetPort: string) {
  let buffer = '';

  serial.on('data', (data: Buffer) => {
    const daemon = activeDaemons[targetPort];
    if (!daemon) return;
    
    buffer += data.toString('utf8');
    const lines = buffer.split('\n');
    
    // The last chunk is always the remainder (incomplete line)
    buffer = lines.pop() || '';

    // Push each finalized line as an atomic event
    lines.forEach(line => {
      const text = line + '\n';
      daemon.stream1.write(text);
      daemon.stream2.write(text);
      portalEvents.emitSerialLog(targetPort, line.replace(/\r$/, '')); // Stream clean line to UI
    });
  });

  const handleDisconnect = (err?: Error) => {
    const daemon = activeDaemons[targetPort];
    if (!daemon || daemon.intentionallyClosed) return;

    if (err) {
      console.error(`[Spooler] Unexpected runtime error on ${targetPort}: ${err.message}`);
    } else {
      console.error(`[Spooler] Interface ${targetPort} closed natively. Spooler auto-recovering...`);
    }

    if (daemon.port?.isOpen) {
        try { daemon.port.close(); } catch(e) {}
    }
    daemon.port = null;
    startReconnectPolling(targetPort);
  };

  serial.on('error', (err: any) => handleDisconnect(err));
  serial.on('close', () => handleDisconnect());
}

/**
 * Binds to a specified UART interface and autonomously pushes data into the 
 * persistence pipeline as well as the web UI via events.
 * 
 * @param port - Optional serial interface (fallback to auto-discovery).
 * @param baud - UART synchronization speed.
 * @returns Status of initial creation and filepath targeting.
 */
export async function startSpoolingDaemon(port?: string, baud: number = 115200, autoReconnect: boolean = true) {
  let activePort = port;
  if (!activePort) {
    const defaultDevice = await getFirstDevice();
    if (!defaultDevice) throw new PlatformIOError('No serial devices detected to monitor.', 'PORT_NOT_FOUND');
    activePort = defaultDevice.port;
  }

  if (!validateSerialPort(activePort)) throw new PlatformIOError(`Invalid serial port format: ${activePort}`, 'INVALID_PORT');
  if (baud && !validateBaudRate(baud)) throw new PlatformIOError(`Invalid baud rate: ${baud}`, 'INVALID_BAUD');

  // Relinquish previous bindings safely if re-invoked
  stopSpoolingDaemon(activePort);

  if (serialManager.isLocked(activePort)) throw new PlatformIOError(`Port is currently locked: ${activePort}`, 'PORT_BUSY');
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  
  rotateLogs(30);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `device-monitor-${timestamp}.log`);
  const latestLog = path.join(LOG_DIR, 'latest-monitor.log');
  
  const stream1 = fs.createWriteStream(logFile, { flags: 'a' });
  const stream2 = fs.createWriteStream(latestLog, { flags: 'w' }); // Wipe and write new trace
  
  serialManager.lockPort(activePort);
  
  // Track daemon context before instantiating generic port bounds
  activeDaemons[activePort] = { 
    port: null, 
    baudRate: baud,
    stream1, 
    stream2,
    intentionallyClosed: false,
    logFile,
    autoReconnect
  };

  const serial = new SerialPort({ path: activePort, baudRate: baud });
  activeDaemons[activePort].port = serial;

  attachSerialEvents(serial, activePort);

  portalEvents.emitSpoolerState?.(getSpoolerState());

  return { success: true, port: activePort, logFile };
}

/**
 * Tool for agents to scan historical offline device payloads.
 * 
 * @param lines - How far backward to crop the document.
 * @param searchPattern - Regex evaluation sequence to prune arbitrary output.
 * @returns Serialized matches of the latest buffer output.
 */
export async function queryLogs(lines: number = 100, searchPattern?: string) {
  const latestLog = path.join(LOG_DIR, 'latest-monitor.log');
  if (!fs.existsSync(latestLog)) {
    return { success: false, content: 'No active or recent logs found.' };
  }

  const content = fs.readFileSync(latestLog, 'utf8');
  let outputLines = content.split('\n');

  if (searchPattern) {
    try {
      const regex = new RegExp(searchPattern, 'i');
      outputLines = outputLines.filter(line => regex.test(line));
    } catch(e) {
       return { success: false, content: `Invalid regex search pattern provided: ${searchPattern}` }
    }
  }

  if (outputLines.length > lines) {
    outputLines = outputLines.slice(-lines);
  }

  return { success: true, content: outputLines.join('\n') };
}
