import http from "http";
import express from "express";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { createApp } from "./app";
import { ChatController } from "./controllers/chatController";
import { ChatService } from "./services/chatService";
import { MessageDAO } from "./dao/messageDAO";
import { logger } from "./utils/logger";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

// ✅ AGREGAR: Lista de orígenes permitidos
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://v-cweb-front.vercel.app',
  'https://vcweb-front.vercel.app'
];

async function start() {
  // Create express app
  const app = createApp();

  // Create HTTP server (required to attach WebSockets)
  const server = http.createServer(app);

  // Prepare dependencies for controller
  const dao = new MessageDAO();
  const service = new ChatService(dao);
  const controller = new ChatController(service);

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Attach WebSocket server instance to controller for broadcast()
  (controller as any).wss = wss;

  // Handle WebSocket upgrade requests
  server.on("upgrade", (request, socket, head) => {
    // ✅ AGREGAR: Validar origen
    const origin = request.headers.origin;
    
    // Permitir conexiones sin origen (como desde Postman/test local)
    // O verificar que el origen esté en la lista permitida
    const isAllowed = !origin || ALLOWED_ORIGINS.some(allowed => 
      origin.startsWith(allowed) || allowed.includes('*')
    );

    if (!isAllowed) {
      logger.warn(`WebSocket connection rejected from origin: ${origin}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Extract userId from query string (optional)
      const url = new URL(request.url ?? "", `http://${request.headers.host}`);
      const userId = url.searchParams.get("uid") ?? undefined;

      (ws as any).userId = userId;
      wss.emit("connection", ws, request);
    });
  });

  // When a WebSocket connects
  wss.on("connection", (ws: WebSocket & { userId?: string }) => {
    logger.info("WebSocket connected:", ws.userId ?? "unknown");

    ws.on("message", async (data) => {
      try {
        await controller.handleMessage(ws, data.toString());
      } catch (err) {
        logger.error("Error in handleMessage:", err);
      }
    });

    ws.on("close", () => {
      logger.info("WebSocket disconnected:", ws.userId ?? "unknown");
    });
  });

  // Start server
  server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
  });
}

start().catch((err) => logger.error(err));
