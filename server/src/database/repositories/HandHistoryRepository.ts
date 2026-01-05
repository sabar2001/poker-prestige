import { query } from '../index';

/**
 * Hand history model from database
 */
export interface HandHistory {
  id: number;
  table_id: string;
  hand_data: any; // JSONB - full replay data
  winner_ids: string[];
  pot_total: number;
  completed_at: Date;
}

/**
 * Hand log structure (what gets saved as JSONB)
 */
export interface HandLog {
  tableId: string;
  sequenceId: number;
  startTime: Date;
  endTime: Date;
  players: Array<{
    steamId: string;
    username: string;
    position: number;
    startingChips: number;
    endingChips: number;
    holeCards: any[];
    actions: Array<{
      action: string;
      amount?: number;
      timestamp: Date;
    }>;
    hasFolded: boolean;
    handRank?: string;
  }>;
  communityCards: any[];
  pots: Array<{
    amount: number;
    eligiblePlayers: string[];
  }>;
  winners: Array<{
    steamId: string;
    amount: number;
    handRank: string;
  }>;
  smallBlind: number;
  bigBlind: number;
}

/**
 * HandHistoryRepository - Data access layer for hand histories
 * 
 * Stores complete hand replays as JSONB for audit trail
 */
export class HandHistoryRepository {
  /**
   * Save a completed hand to database
   * 
   * @param handLog - Complete hand replay data
   * @returns Saved hand history ID
   */
  static async saveHand(handLog: HandLog): Promise<number> {
    const winnerIds = handLog.winners.map(w => w.steamId);
    const potTotal = handLog.winners.reduce((sum, w) => sum + w.amount, 0);

    const result = await query(
      `INSERT INTO hand_histories (table_id, hand_data, winner_ids, pot_total)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [handLog.tableId, JSON.stringify(handLog), winnerIds, potTotal]
    );

    const handId = result.rows[0].id;
    console.log(
      `[HandHistoryRepository] Saved hand #${handId} for table ${handLog.tableId}, pot: ${potTotal}`
    );

    return handId;
  }

  /**
   * Get hand by ID
   */
  static async getHandById(id: number): Promise<HandHistory | null> {
    const result = await query(
      'SELECT * FROM hand_histories WHERE id = $1',
      [id]
    );

    const hand = result.rows[0];
    if (hand) {
      // Parse BIGINT to number
      hand.pot_total = parseInt(hand.pot_total, 10);
    }
    return hand || null;
  }

  /**
   * Get hands for a specific table
   */
  static async getHandsForTable(
    tableId: string,
    limit: number = 100
  ): Promise<HandHistory[]> {
    const result = await query(
      `SELECT * FROM hand_histories 
       WHERE table_id = $1 
       ORDER BY completed_at DESC 
       LIMIT $2`,
      [tableId, limit]
    );

    return result.rows;
  }

  /**
   * Get hands for a specific player
   */
  static async getHandsForPlayer(
    steamId: string,
    limit: number = 100
  ): Promise<HandHistory[]> {
    const result = await query(
      `SELECT * FROM hand_histories 
       WHERE $1 = ANY(winner_ids) 
       OR hand_data->'players' @> $2::jsonb
       ORDER BY completed_at DESC 
       LIMIT $3`,
      [steamId, JSON.stringify([{ steamId }]), limit]
    );

    return result.rows;
  }

  /**
   * Get recent hands (for lobby/stats)
   */
  static async getRecentHands(limit: number = 50): Promise<HandHistory[]> {
    const result = await query(
      'SELECT * FROM hand_histories ORDER BY completed_at DESC LIMIT $1',
      [limit]
    );

    return result.rows;
  }

  /**
   * Get player statistics from hand history
   */
  static async getPlayerStats(steamId: string): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as hands_played,
        COUNT(*) FILTER (WHERE $1 = ANY(winner_ids)) as hands_won,
        SUM(pot_total) FILTER (WHERE $1 = ANY(winner_ids)) as total_winnings,
        AVG(pot_total) FILTER (WHERE $1 = ANY(winner_ids)) as avg_pot_won
       FROM hand_histories 
       WHERE hand_data->'players' @> $2::jsonb`,
      [steamId, JSON.stringify([{ steamId }])]
    );

    return result.rows[0];
  }

  /**
   * Delete old hand histories (for cleanup)
   */
  static async deleteOldHands(daysOld: number): Promise<number> {
    const result = await query(
      `DELETE FROM hand_histories 
       WHERE completed_at < NOW() - INTERVAL '${daysOld} days'`
    );

    const deletedCount = result.rowCount || 0;
    console.log(
      `[HandHistoryRepository] Deleted ${deletedCount} hands older than ${daysOld} days`
    );

    return deletedCount;
  }
}

