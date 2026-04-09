/**
 * HTTP and WebSocket API Server
 * Hosts the web dashboard and streams continuous MCP states natively.
 *
 * Provides:
 * - startPortalServer: Initializes Express and Socket.io endpoints and hooks into the event bus
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { portalEvents } from './events.js';
import { getSpoolerState, startSpoolingDaemon, stopSpoolingDaemon } from '../tools/monitor.js';
import { listDevices } from '../tools/devices.js';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes and binds the Portal REST/WS endpoints.
 * @param defaultPort Optional static port configuration.
 * @returns The established application instances { app, httpServer, io }
 */
export function startPortalServer(defaultPort = 8080) {
  const app = express();
  const httpServer = createServer(app);
  
  // Configure CORS for local UI dev mode
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  app.get('/api/devices', async (_req, res) => {
    try {
      const devices = await listDevices();
      res.json(devices);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/spooler/start', async (req, res) => {
    try {
      const { port, autoReconnect, projectDir } = req.body;
      const result = await startSpoolingDaemon(port, 115200, autoReconnect !== false, projectDir);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/spooler/stop', (_req, res) => {
    const state = getSpoolerState();
    if (state.port) stopSpoolingDaemon(state.port);
    res.json({ success: true });
  });
  
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Serve static UI if built
  const webDistPath = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDistPath));

  io.on('connection', (socket) => {
    socket.emit('connection_established', { message: 'Connected to PIO MCP Backend' });
    
    // Provide initial status state
    socket.emit('server_status', { timestamp: Date.now(), status: 'online' });
    socket.emit('spooler_state', getSpoolerState());
    
    // Inject active workspace layer naturally on UI boot
    const activeWorkspace = portalEvents.getLastKnownWorkspace();
    if (activeWorkspace) {
      socket.emit('workspace_state', { timestamp: Date.now(), projectDir: activeWorkspace });
    }
  });

  // Wire up event bus to websocket broadcasts
  portalEvents.on('agent_activity', (data) => io.emit('agent_activity', data));
  portalEvents.on('build_log', (data) => io.emit('build_log', data));
  portalEvents.on('serial_log', (data) => io.emit('serial_log', data));
  portalEvents.on('server_status', (data) => io.emit('server_status', data));
  portalEvents.on('spooler_state', (data) => io.emit('spooler_state', data));
  portalEvents.on('workspace_state', (data) => io.emit('workspace_state', data));

  const port = process.env.PORTAL_PORT ? parseInt(process.env.PORTAL_PORT) : defaultPort;

  httpServer.listen(port, () => {
    console.error(`\n======================================================`);
    console.error(`🚀 MCP Server Web Portal running at: http://localhost:${port}`);
    console.error(`======================================================\n`);
    
    exec(`open http://localhost:${port}`, () => {});
  });

  // Ensure port 8080 is relinquished cleanly if the parent IDE terminates the MCP server
  const cleanup = () => {
    httpServer.close();
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return { app, httpServer, io };
}
