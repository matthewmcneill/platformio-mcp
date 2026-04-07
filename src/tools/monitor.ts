/**
 * Serial Monitor Tools
 * Autonomous serial log monitoring and hardware assertion tool.
 * 
 * Provides:
 * - readSerial: Actively binds to a serial port, collects output, and checks for system crash logs.
 */

import { SerialPort } from 'serialport';
import type { MonitorResult } from '../types.js';
import { validateSerialPort, validateBaudRate } from '../utils/validation.js';
import { PlatformIOError } from '../utils/errors.js';
import { serialManager } from '../utils/serial-manager.js';
import { getFirstDevice } from './devices.js';

/**
 * Actively monitors a serial port for a set duration, capturing logs and watching for crash panics.
 * 
 * @param port - Optional specific serial port. If omitted, attempts to auto-discover.
 * @param baud - Baud rate communication speed (defaults to 115200).
 * @param durationSeconds - How long to sample the serial output (defaults to 5).
 * @returns Harvested buffer log and panic flag via MonitorResult.
 */
export async function readSerial(
  port?: string,
  baud: number = 115200,
  durationSeconds: number = 5
): Promise<MonitorResult> {

  // Auto-detect port if none provided
  let activePort = port;
  if (!activePort) {
    const defaultDevice = await getFirstDevice();
    if (!defaultDevice) {
      throw new PlatformIOError('No serial devices detected to monitor.', 'PORT_NOT_FOUND');
    }
    activePort = defaultDevice.port;
  }

  if (!validateSerialPort(activePort)) {
    throw new PlatformIOError(`Invalid serial port format: ${activePort}`, 'INVALID_PORT');
  }

  if (baud && !validateBaudRate(baud)) {
    throw new PlatformIOError(`Invalid baud rate: ${baud}`, 'INVALID_BAUD');
  }

  // Prevent accessing a port currently being flashed
  if (serialManager.isLocked(activePort)) {
    throw new PlatformIOError(`Port is currently busy (likely flashing): ${activePort}`, 'PORT_BUSY');
  }

  // Claim the token
  serialManager.lockPort(activePort);

  return new Promise((resolve, reject) => {
    let bufferOutput = '';
    let panicTriggered = false;

    // TypeScript might warn if it doesn't recognize activePort is definitely a string, but it is.
    const serial = new SerialPort({ path: activePort as string, baudRate: baud });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      serial.close();
      serialManager.unlockPort(activePort as string);
      resolve({
        success: true,
        bufferOutput,
        panicTriggered
      });
    }, durationSeconds * 1000);

    serial.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      bufferOutput += text;

      // Realtime crash monitoring
      if (
        bufferOutput.includes('abort()') || 
        bufferOutput.includes('Guru Meditation Error') || 
        bufferOutput.includes('panic')
      ) {
        panicTriggered = true;
        clearTimeout(timeout);
        serial.close();
        serialManager.unlockPort(activePort as string);
        resolve({
          success: true,
          bufferOutput: bufferOutput.trim(),
          panicTriggered
        });
      }
    });

    serial.on('error', (err: any) => {
      clearTimeout(timeout);
      serialManager.unlockPort(activePort as string);
      
      // If we already collected some data, just return it as a success with the buffer
      if (bufferOutput.length > 0) {
        resolve({
          success: true,
          bufferOutput: bufferOutput.trim(),
          panicTriggered
        });
      } else {
        reject(new PlatformIOError(`Serial monitor error: ${err.message}`, 'MONITOR_ERROR'));
      }
    });
  });
}
