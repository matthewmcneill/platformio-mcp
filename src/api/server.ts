/**
 * HTTP and WebSocket API Server
 * Hosts the web dashboard and streams continuous MCP states natively.
 *
 * Provides:
 * - startPortalServer: Initializes Express and Socket.io endpoints and hooks into the event bus
 */
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { portalEvents } from "./events.js";
import {
  getSpoolerStates,
  startSpoolingDaemon,
  stopSpoolingDaemon,
} from "../tools/monitor.js";
import { listDevices } from "../tools/devices.js";
import { exec } from "child_process";
import { hardwareLockManager } from "../utils/lock-manager.js";
import { buildLogger } from "../utils/build-logger.js";

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
  app.use(cors({ origin: "*" }));
  app.use(express.json());

  app.get("/api/devices", async (_req, res) => {
    try {
      const devices = await listDevices();
      res.json(devices);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/spooler/start", async (req, res) => {
    try {
      if (hardwareLockManager.getLockStatus().isLocked) {
        throw new Error(
          "Hardware queue is currently locked by an active agent operation.",
        );
      }
      const { port, autoReconnect, projectDir } = req.body;
      const result = await startSpoolingDaemon(
        port,
        115200,
        autoReconnect !== false,
        projectDir,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/spooler/stop", async (req, res) => {
    const { port } = req.body;
    if (port) {
      await stopSpoolingDaemon(port);
    } else {
      // Fallback: stop all if no port specified (though UI should always specify)
      const states = getSpoolerStates();
      for (const p of Object.keys(states)) {
        await stopSpoolingDaemon(p);
      }
    }
    res.json({ success: true });
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Serve static UI if built
  const webDistPath = path.join(__dirname, "..", "..", "web", "dist");
  app.use(express.static(webDistPath));

  io.on("connection", (socket) => {
    socket.emit("connection_established", {
      message: "Connected to PIO MCP Backend",
    });

    // Provide initial status state
    socket.emit("server_status", { timestamp: Date.now(), status: "online" });
    socket.emit("spooler_states", getSpoolerStates());
    socket.emit("lock_state", {
      timestamp: Date.now(),
      ...hardwareLockManager.getLockStatus(),
    });

    // Inject active workspace layer naturally on UI boot
    const activeWorkspace = portalEvents.getLastKnownWorkspace();
    if (activeWorkspace) {
      socket.emit("workspace_state", {
        timestamp: Date.now(),
        projectDir: activeWorkspace,
      });
    }

    // Provide initial build log state
    const latestBuildLog = buildLogger.getLatestLogFile();
    if (latestBuildLog) {
      socket.emit("build_state", {
        timestamp: Date.now(),
        logFile: latestBuildLog,
      });
    }
  });

  // Wire up event bus to websocket broadcasts
  portalEvents.on("agent_activity", (data) => io.emit("agent_activity", data));
  portalEvents.on("build_log", (data) => io.emit("build_log", data));
  portalEvents.on("build_clear", (data) => io.emit("build_clear", data));
  portalEvents.on("serial_log", (data) => io.emit("serial_log", data));
  portalEvents.on("server_status", (data) => io.emit("server_status", data));
  portalEvents.on("spooler_states", (data) => io.emit("spooler_states", data));
  portalEvents.on("workspace_state", (data) =>
    io.emit("workspace_state", data),
  );
  portalEvents.on("lock_state", (data) => io.emit("lock_state", data));

  const port = process.env.PORTAL_PORT
    ? parseInt(process.env.PORTAL_PORT)
    : defaultPort;

  let retries = 0;
  const maxRetries = 3;

  const startListening = () => {
    httpServer.listen(port, () => {
      console.error(`\n======================================================`);
      console.error(
        `🚀 MCP Server Web Portal running at: http://localhost:${port}`,
      );
      console.error(`======================================================\n`);

      exec(`open http://localhost:${port}`, () => {});
    });
  };

  // Catch EADDRINUSE to prevent fatal crash and implement retry logic
  httpServer.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      if (retries < maxRetries) {
        retries++;
        console.error(
          `[INFO] Port ${port} is busy, retrying in 2s... (Attempt ${retries}/${maxRetries})`,
        );
        setTimeout(() => {
          startListening();
        }, 2000);
      } else {
        console.error(
          `\n[WARN] Port ${port} is still in use after ${maxRetries} retries. The Web Dashboard will be disabled.`,
        );
        console.error(
          `[WARN] To fix this, kill the process on port ${port} or use PORTAL_PORT environment variable.\n`,
        );
      }
    } else {
      throw e;
    }
  });

  startListening();

  // Ensure port 8080 is relinquished cleanly if the parent IDE terminates the MCP server
  const cleanup = () => {
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return { app, httpServer, io };
}
