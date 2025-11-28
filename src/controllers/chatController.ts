import { WebSocket } from "ws";
import { ChatService } from "../services/chatService";
import type { IWebSocketEnvelope, IMessage } from "../models/types";
import { v4 as uuidv4 } from "uuid";

/**
 * ChatController
 * Handles incoming WebSocket messages, routing them to the appropriate
 * business logic in ChatService, and manages WebRTC signaling messages.
 */
export class ChatController {
  private service: ChatService;

  /**
   * @param service ChatService dependency (Dependency Injection friendly)
   */
  constructor(service?: ChatService) {
    this.service = service ?? new ChatService();
  }

  /**
   * Main handler for all messages received from WebSocket clients.
   *
   * @param ws WebSocket connection with optional metadata
   * @param raw Raw string message received from client
   */
  async handleMessage(
    ws: WebSocket & { userId?: string; roomId?: string },
    raw: string
  ) {
    let envelope: IWebSocketEnvelope;

    try {
      envelope = JSON.parse(raw) as IWebSocketEnvelope;
    } catch {
      ws.send(
        JSON.stringify({
          action: "error",
          payload: "invalid-json",
        })
      );
      return;
    }

    switch (envelope.action) {
      case "join":
        await this.handleJoin(ws, envelope.payload);
        break;

      case "leave":
        await this.handleLeave(ws);
        break;

      case "chat-message":
        await this.handleChatMessage(ws, envelope.payload);
        break;

      case "signal-offer":
      case "signal-answer":
      case "signal-candidate":
        await this.handleSignaling(ws, envelope);
        break;

      default:
        ws.send(
          JSON.stringify({
            action: "error",
            payload: "unknown-action",
          })
        );
    }
  }

  /**
   * Handles a client joining a chat room.
   *
   * @param ws WebSocket client
   * @param payload Incoming payload containing `roomId`
   */
  private async handleJoin(ws: WebSocket & { roomId?: string }, payload: any) {
    const roomId = payload?.roomId;

    if (!roomId) {
      ws.send(
        JSON.stringify({
          action: "error",
          payload: "roomId-required",
        })
      );
      return;
    }

    ws.roomId = roomId;

    ws.send(
      JSON.stringify({
        action: "joined",
        payload: { roomId },
      })
    );

    // Load and send recent messages
    const recent = await this.service.getRecent(roomId);
    ws.send(
      JSON.stringify({
        action: "recent-messages",
        payload: recent,
      })
    );
  }

  /**
   * Handles a client leaving a room.
   *
   * @param ws WebSocket client
   */
  private async handleLeave(ws: WebSocket & { roomId?: string }) {
    delete ws.roomId;

    ws.send(
      JSON.stringify({
        action: "left",
      })
    );
  }

  /**
   * Handles incoming chat messages and broadcasts them to the room.
   *
   * @param ws WebSocket client
   * @param payload Payload containing message text and roomId
   */
  private async handleChatMessage(
    ws: WebSocket & { userId?: string; roomId?: string },
    payload: any
  ) {
    const roomId = payload?.roomId ?? ws.roomId;

    if (!roomId) {
      ws.send(
        JSON.stringify({
          action: "error",
          payload: "no-room",
        })
      );
      return;
    }

    // Safe assertion after guard
    const rid = roomId as string;

    const message: IMessage = {
      id: uuidv4(),
      roomId: rid,
      senderId: ws.userId ?? payload?.senderId ?? "anonymous",
      type: "chat",
      content: String(payload?.text ?? ""),
      timestamp: Date.now(),
    };

    await this.service.persistMessage(message);

    this.broadcastToRoom(rid, {
      action: "chat-message",
      payload: message,
    });
  }

  /**
   * Handles WebRTC signaling messages (offer, answer, ICE candidates).
   *
   * @param ws WebSocket client
   * @param envelope Full signaling envelope
   */
  private async handleSignaling(
    ws: WebSocket & { userId?: string; roomId?: string },
    envelope: IWebSocketEnvelope
  ) {
    const roomId = envelope.payload?.roomId ?? ws.roomId;

    if (!roomId) {
      ws.send(
        JSON.stringify({
          action: "error",
          payload: "no-room",
        })
      );
      return;
    }

    // Safe assertion after guard
    const rid = roomId as string;

    this.broadcastToRoom(
      rid,
      {
        action: envelope.action,
        payload: {
          ...envelope.payload,
          from: ws.userId,
        },
      },
      ws
    );
  }

  /**
   * Broadcasts a JSON message to all WebSocket clients in a room.
   * The WebSocket server instance (`wss`) is attached dynamically in server.ts.
   *
   * @param roomId Room identifier
   * @param message JSON-serializable object
   * @param exceptWs Optional WebSocket client to exclude from broadcast
   */
  private broadcastToRoom(roomId: string, message: any, exceptWs?: WebSocket) {
    const wss = (this as any).wss;
    if (!wss) return;

    wss.clients.forEach((client: WebSocket & { roomId?: string }) => {
      if (
        client.readyState === 1 &&
        client.roomId === roomId &&
        client !== exceptWs
      ) {
        client.send(JSON.stringify(message));
      }
    });
  }
}
