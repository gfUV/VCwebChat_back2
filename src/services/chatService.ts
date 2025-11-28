import { MessageDAO } from "../dao/messageDAO";
import type { IMessage } from "../models/types";

/**
 * ChatService
 * -------------------------------------------------------
 * Business layer between controllers and the data layer.
 * Handles message validation, persistence, and retrieval.
 */
export class ChatService {
  private dao: MessageDAO;

  /**
   * Creates a new ChatService instance.
   * @param dao Optional DAO injection (useful for testing).
   */
  constructor(dao?: MessageDAO) {
    this.dao = dao ?? new MessageDAO();
  }

  /**
   * Persists a chat message into the database.
   * Automatically generates a timestamp if missing.
   *
   * @param message The IMessage object to store.
   * @returns A promise resolving to the persisted message.
   */
  async persistMessage(message: IMessage): Promise<IMessage> {
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }
    return this.dao.save(message);
  }

  /**
   * Retrieves the most recent messages from a specific room.
   *
   * @param roomId ID of the room to fetch messages from.
   * @param limit Maximum number of messages to fetch (default: 50).
   * @returns A promise resolving to an array of messages.
   */
  async getRecent(roomId: string, limit = 50): Promise<IMessage[]> {
    return this.dao.getLast(roomId, limit);
  }

  /**
   * Completely clears messages for a room.
   * Used mostly for automated tests.
   *
   * @param roomId ID of the room to clear.
   */
  async clearRoom(roomId: string): Promise<void> {
    return this.dao.clear(roomId);
  }
}
