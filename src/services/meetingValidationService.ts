import fetch from "node-fetch";
import { logger } from "../utils/logger";

const BACKEND1_URL = process.env.BACKEND1_URL || "http://localhost:3000";

/**
 * MeetingValidationService
 * -------------------------------------------------------
 * Handles communication with Backend 1 for meeting validation
 * and participant count updates.
 */
export class MeetingValidationService {
  /**
   * Fetches meeting information from Backend 1
   *
   * @param meetingId - The meeting ID to validate
   * @returns Meeting data or null if not found/invalid
   */
  async getMeeting(meetingId: string): Promise<{
    success: boolean;
    meeting?: {
      meetingId: string;
      hostId: string;
      participantCount: number;
      maxParticipants: number;
      isActive: boolean;
      createdAt: string;
    };
    maxParticipants?: number;
    message?: string;
  } | null> {
    try {
      const response = await fetch(`${BACKEND1_URL}/api/meetings/${meetingId}`);
      const data = await response.json() as any;

      if (!response.ok) {
        logger.warn(`Meeting ${meetingId} not found in Backend 1`);
        return data;
      }

      return data;
    } catch (error) {
      logger.error(`Error fetching meeting ${meetingId} from Backend 1:`, error);
      return null;
    }
  }

  /**
   * Updates participant count in Backend 1
   *
   * @param meetingId - The meeting ID
   * @param currentParticipants - Current number of connected WebSockets
   */
  async updateParticipantCount(
    meetingId: string,
    currentParticipants: number
  ): Promise<void> {
    try {
      const response = await fetch(
        `${BACKEND1_URL}/api/meetings/${meetingId}/participants`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentParticipants }),
        }
      );

      if (!response.ok) {
        logger.warn(
          `Failed to update participant count for ${meetingId}: ${response.statusText}`
        );
      } else {
        logger.info(
          `Updated participant count for ${meetingId}: ${currentParticipants}`
        );
      }
    } catch (error) {
      logger.error(
        `Error updating participant count for ${meetingId}:`,
        error
      );
    }
  }
}
