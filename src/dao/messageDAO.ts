import type { IMessage } from "../models/types";

/**
 * MessageDAO
 * -------------------------------------------------------
 * Data Access Object responsible for storing and retrieving
 * chat messages. This implementation uses in-memory storage
 * and should be replaced with a persistent database layer
 * when moving to production.
 */
export class MessageDAO {
  /**
   * Internal storage structure:
   * - Key: roomId
   * - Value: Array of IMessage objects belonging to that room
   */
  private storage: Map<string, IMessage[]>;

  /**
   * Creates a new in-memory message DAO instance.
   */
  constructor() {
    this.storage = new Map();
  }

  /**
   * Persists a new chat message into the appropriate room.
   *
   * @param message - The IMessage object to store.
   * @returns A promise resolving to the same stored message.
   */
  async save(message: IMessage): Promise<IMessage> {
    const room = this.storage.get(message.roomId) ?? [];
    room.push(message);
    this.storage.set(message.roomId, room);
    return message;
  }

  /**
   * Retrieves the latest messages from a room. Messages are returned
   * in chronological order (oldest → newest).
   *
   * @param roomId - ID of the room to fetch messages from.
   * @param limit - Maximum number of messages to return (default: 50).
   * @returns A promise resolving to an array of IMessage objects.
   */
  async getLast(roomId: string, limit = 50): Promise<IMessage[]> {
    const roomMessages = this.storage.get(roomId) ?? [];
    return roomMessages.slice(-limit);
  }

  /**
   * Removes all messages belonging to a specific room.
   * Primarily used for testing or resetting state.
   *
   * @param roomId - ID of the room whose messages should be cleared.
   * @returns A promise resolving when the operation is complete.
   */
  async clear(roomId: string): Promise<void> {
    this.storage.delete(roomId);
  }
}
