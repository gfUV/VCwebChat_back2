import { WebSocket } from "ws";
import { ChatService } from "../services/chatService";
import { MeetingValidationService } from "../services/meetingValidationService";
import type { IWebSocketEnvelope, IMessage } from "../models/types";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

/**
 * ChatController
 * Handles incoming WebSocket messages, routing them to the appropriate
 * business logic in ChatService, and manages WebRTC signaling messages.
 * Now includes real-time participant validation with Backend 1.
 */
export class ChatController {
  private service: ChatService;
  private meetingService: MeetingValidationService;

  /**
   * @param service ChatService dependency (Dependency Injection friendly)
   * @param meetingService MeetingValidationService for Backend 1 communication
   */
  constructor(
    service?: ChatService,
    meetingService?: MeetingValidationService
  ) {
    this.service = service ?? new ChatService();
    this.meetingService = meetingService ?? new MeetingValidationService();
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
   * Handles a client joining a chat room with real-time validation.
   *
   * @param ws WebSocket client
   * @param payload Incoming payload containing `roomId` and `userId`
   */
  private async handleJoin(
    ws: WebSocket & { roomId?: string; userId?: string },
    payload: any
  ) {
    const roomId = payload?.roomId;
    const userId = payload?.userId;

    if (!roomId) {
      ws.send(
        JSON.stringify({
          action: "error",
          payload: {
            message: "roomId-required",
            code: "ROOMID_REQUIRED",
          },
        })
      );
      return;
    }

    try {
      // PASO 1: Validar reunión con Backend 1
      const meetingData = await this.meetingService.getMeeting(roomId);

      if (!meetingData || !meetingData.success) {
        ws.send(
          JSON.stringify({
            action: "join-error",
            payload: {
              message: "Reunión no encontrada",
              code: "MEETING_NOT_FOUND",
            },
          })
        );
        logger.warn(`Join rejected: Meeting ${roomId} not found`);
        return;
      }

      if (!meetingData.meeting?.isActive) {
        ws.send(
          JSON.stringify({
            action: "join-error",
            payload: {
              message: "La reunión ya no está activa",
              code: "MEETING_INACTIVE",
            },
          })
        );
        logger.warn(`Join rejected: Meeting ${roomId} is inactive`);
        return;
      }

      // PASO 2: Validar límite EN TIEMPO REAL (contar WebSockets activos)
      const currentParticipants = this.getRoomParticipantCount(roomId);
      const maxParticipants = meetingData.meeting.maxParticipants;

      logger.info(
        `Room ${roomId}: ${currentParticipants}/${maxParticipants} participants`
      );

      if (currentParticipants >= maxParticipants) {
        ws.send(
          JSON.stringify({
            action: "join-error",
            payload: {
              message: `Reunión llena (${maxParticipants}/${maxParticipants} participantes)`,
              code: "MEETING_FULL",
              current: currentParticipants,
              max: maxParticipants,
            },
          })
        );
        logger.warn(
          `Join rejected: Room ${roomId} is full (${currentParticipants}/${maxParticipants})`
        );
        return;
      }

      // PASO 3: Permitir que se una a la sala
      ws.roomId = roomId;
      if (userId) ws.userId = userId;

      // Notificar a otros en la sala
      this.broadcastToRoom(
        roomId,
        {
          action: "user-joined",
          payload: {
            userId: ws.userId || "anonymous",
            socketId: ws.userId,
            participantCount: currentParticipants + 1,
          },
        },
        ws
      );

      // Confirmar al usuario que se unió
      ws.send(
        JSON.stringify({
          action: "joined",
          payload: {
            roomId,
            participantCount: currentParticipants + 1,
            maxParticipants,
          },
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

      // PASO 4: Actualizar contador en Backend 1
      const newCount = this.getRoomParticipantCount(roomId);
      await this.meetingService.updateParticipantCount(roomId, newCount);

      logger.info(
        `✅ User ${userId || "anonymous"} joined room ${roomId} (${newCount}/${maxParticipants})`
      );
    } catch (error) {
      logger.error("Error in handleJoin:", error);
      ws.send(
        JSON.stringify({
          action: "join-error",
          payload: {
            message: "Error al unirse a la reunión",
            code: "SERVER_ERROR",
          },
        })
      );
    }
  }

  /**
   * Handles a client leaving a room.
   *
   * @param ws WebSocket client
   */
  private async handleLeave(ws: WebSocket & { roomId?: string; userId?: string }) {
    const roomId = ws.roomId;

    if (roomId) {
      // Notificar a la sala
      this.broadcastToRoom(
        roomId,
        {
          action: "user-left",
          payload: {
            userId: ws.userId || "anonymous",
            socketId: ws.userId,
            participantCount: this.getRoomParticipantCount(roomId) - 1,
          },
        },
        ws
      );

      // Actualizar contador en Backend 1
      const newCount = Math.max(0, this.getRoomParticipantCount(roomId) - 1);
      await this.meetingService.updateParticipantCount(roomId, newCount);

      logger.info(
        `User ${ws.userId || "anonymous"} left room ${roomId}, ${newCount} participants remaining`
      );
    }

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
      senderName: payload?.senderName,
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
   * Counts the number of active WebSocket connections in a room.
   *
   * @param roomId Room identifier
   * @returns Number of active connections
   */
  private getRoomParticipantCount(roomId: string): number {
    const wss = (this as any).wss;
    if (!wss) return 0;

    let count = 0;
    wss.clients.forEach((client: WebSocket & { roomId?: string }) => {
      if (client.readyState === 1 && client.roomId === roomId) {
        count++;
      }
    });

    return count;
  }

  /**
   * Handles WebSocket disconnection and updates participant count.
   *
   * @param ws WebSocket client that disconnected
   */
  async handleDisconnect(ws: WebSocket & { roomId?: string; userId?: string }) {
    const roomId = ws.roomId;

    if (roomId) {
      // Notificar a la sala
      this.broadcastToRoom(roomId, {
        action: "user-left",
        payload: {
          userId: ws.userId || "anonymous",
          socketId: ws.userId,
          participantCount: this.getRoomParticipantCount(roomId),
        },
      });

      // Actualizar contador en Backend 1
      const newCount = this.getRoomParticipantCount(roomId);
      await this.meetingService.updateParticipantCount(roomId, newCount);

      logger.info(
        `User ${ws.userId || "anonymous"} disconnected from ${roomId}, ${newCount} participants remaining`
      );
    }
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
