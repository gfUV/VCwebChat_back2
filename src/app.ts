import express from "express";
import cors from "cors"; // ← AGREGAR ESTO
import dotenv from "dotenv";
import { logger } from "./utils/logger";

dotenv.config();

/**
 * Creates and configures the Express application.
 * This file does NOT start the server, only builds the app instance.
 */
export function createApp() {
  const app = express();


  app.use(cors({
    origin: [
      'http://localhost:5173',           // Desarrollo local
      'http://localhost:3000',           // Desarrollo alternativo
      'https://v-cweb-front.vercel.app', // Producción Vercel
      'https://*.vercel.app'             // Cualquier preview de Vercel
    ],
    credentials: true
  }));

  // JSON middleware
  app.use(express.json());

  // Health check
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "development"
    });
  });

  // Root route
  app.get("/", (req, res) => {
    res.send("Realtime Chat Backend is running 🚀");
  });

  // Example of logging middleware (optional)
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
  });

  return app;
}
