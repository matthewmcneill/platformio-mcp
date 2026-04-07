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

/** Directory for actively tracking background execution buffers */
const LOG_DIR = path.join(process.cwd(), '.agents', 'logs');

/** Record dictionary locking currently operating serial port mappings */
const activeDaemons: Record<string, { port: SerialPort, stream1: fs.WriteStream, stream2: fs.WriteStream }> = {};

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
    daemon.stream1.end();
    daemon.stream2.end();
    if (daemon.port.isOpen) {
      daemon.port.close();
    }
    delete activeDaemons[port];
    try {
      serialManager.unlockPort(port);
    } catch(e) {}
  }
}

/**
 * Binds to a specified UART interface and autonomously pushes data into the 
 * persistence pipeline as well as the web UI via events.
 * 
 * @param port - Optional serial interface (fallback to auto-discovery).
 * @param baud - UART synchronization speed.
 * @returns Status of initial creation and filepath targeting.
 */
export async function startSpoolingDaemon(port?: string, baud: number = 115200) {
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
  const serial = new SerialPort({ path: activePort, baudRate: baud });

  activeDaemons[activePort] = { port: serial, stream1, stream2 };

  serial.on('data', (data: Buffer) => {
    const text = data.toString('utf8');
    stream1.write(text);
    stream2.write(text);
    portalEvents.emitSerialLog(activePort as string, text); // Stream directly to UI!
  });

  serial.on('error', (err: any) => {
    console.error(`[Spooler] Error on ${activePort}: ${err.message}`);
    stopSpoolingDaemon(activePort as string);
  });

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
