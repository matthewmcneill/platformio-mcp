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
    socket.emit('connection_established', { message: 'Connected to Antigravity PIO Backend' });
    
    // Provide initial status state
    socket.emit('server_status', { timestamp: Date.now(), status: 'online' });
  });

  // Wire up event bus to websocket broadcasts
  portalEvents.on('agent_activity', (data) => io.emit('agent_activity', data));
  portalEvents.on('build_log', (data) => io.emit('build_log', data));
  portalEvents.on('serial_log', (data) => io.emit('serial_log', data));
  portalEvents.on('server_status', (data) => io.emit('server_status', data));

  const port = process.env.PORTAL_PORT ? parseInt(process.env.PORTAL_PORT) : defaultPort;

  httpServer.listen(port, () => {
    console.error(`\n======================================================`);
    console.error(`🚀 Antigravity Web Portal running at: http://localhost:${port}`);
    console.error(`======================================================\n`);
  });

  return { app, httpServer, io };
}
