import { query, getClient } from '../index';

/**
 * User model from database
 */
export interface User {
  steam_id: string;
  username: string;
  chips: number | string; // PostgreSQL BIGINT returns string
  created_at: Date;
  updated_at: Date;
}

/**
 * UserRepository - Data access layer for users
 * 
 * Handles all user-related database operations with transaction safety
 */
export class UserRepository {
  /**
   * Find user by Steam ID
   */
  static async findBySteamId(steamId: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE steam_id = $1',
      [steamId]
    );

    return result.rows[0] || null;
  }

  /**
   * Find or create user
   * If user doesn't exist, creates with default balance (1000 chips)
   */
  static async findOrCreate(
    steamId: string,
    username: string
  ): Promise<User> {
    // Try to find existing user
    let user = await this.findBySteamId(steamId);

    if (user) {
      // Update username if changed
      if (user.username !== username) {
        await query(
          'UPDATE users SET username = $1 WHERE steam_id = $2',
          [username, steamId]
        );
        user.username = username;
      }
      // Ensure chips is a number
      user.chips = parseInt(user.chips as any, 10);
      return user;
    }

    // Create new user with default chips
    const result = await query(
      `INSERT INTO users (steam_id, username, chips)
       VALUES ($1, $2, 1000)
       RETURNING *`,
      [steamId, username]
    );

    console.log(`[UserRepository] Created new user: ${username} (${steamId})`);
    return result.rows[0];
  }

  /**
   * Update user balance (with transaction safety)
   * 
   * CRITICAL: Uses database transaction to prevent chip duplication bugs
   * 
   * @param steamId - User's Steam ID
   * @param delta - Amount to add/subtract (can be negative)
   * @returns Updated user object
   */
  static async updateBalance(
    steamId: string,
    delta: number
  ): Promise<User> {
    const client = await getClient();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Lock the row for update (prevents concurrent modification)
      const lockResult = await client.query(
        'SELECT * FROM users WHERE steam_id = $1 FOR UPDATE',
        [steamId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error(`User ${steamId} not found`);
      }

      const currentChips = parseInt(lockResult.rows[0].chips, 10);
      const newChips = currentChips + delta;

      // Validate new balance
      if (newChips < 0) {
        throw new Error(
          `Insufficient chips: ${currentChips} + ${delta} = ${newChips}`
        );
      }

      // Update balance
      const updateResult = await client.query(
        `UPDATE users 
         SET chips = $1, updated_at = NOW()
         WHERE steam_id = $2
         RETURNING *`,
        [newChips, steamId]
      );

      // Commit transaction
      await client.query('COMMIT');

      console.log(
        `[UserRepository] Updated balance: ${steamId} ${currentChips} → ${newChips} (${delta >= 0 ? '+' : ''}${delta})`
      );

      return updateResult.rows[0];

    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      console.error('[UserRepository] Balance update failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update multiple user balances in a single transaction
   * Used for payout distribution
   */
  static async updateBalances(
    updates: Map<string, number>
  ): Promise<void> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      for (const [steamId, delta] of updates.entries()) {
        // Lock row
        const lockResult = await client.query(
          'SELECT chips FROM users WHERE steam_id = $1 FOR UPDATE',
          [steamId]
        );

        if (lockResult.rows.length === 0) {
          throw new Error(`User ${steamId} not found`);
        }

        const currentChips = parseInt(lockResult.rows[0].chips, 10);
        const newChips = currentChips + delta;

        if (newChips < 0) {
          throw new Error(
            `Insufficient chips for ${steamId}: ${currentChips} + ${delta} = ${newChips}`
          );
        }

        // Update
        await client.query(
          'UPDATE users SET chips = $1, updated_at = NOW() WHERE steam_id = $2',
          [newChips, steamId]
        );

        console.log(
          `[UserRepository] Batch update: ${steamId} ${currentChips} → ${newChips} (${delta >= 0 ? '+' : ''}${delta})`
        );
      }

      await client.query('COMMIT');
      console.log('[UserRepository] Batch balance update successful');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[UserRepository] Batch balance update failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user balance
   */
  static async getBalance(steamId: string): Promise<number | null> {
    const result = await query(
      'SELECT chips FROM users WHERE steam_id = $1',
      [steamId]
    );

    const chips = result.rows[0]?.chips;
    return chips ? parseInt(chips, 10) : null;
  }

  /**
   * Get all users (for admin/debugging)
   */
  static async getAllUsers(): Promise<User[]> {
    const result = await query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Delete user (for testing)
   */
  static async deleteUser(steamId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM users WHERE steam_id = $1',
      [steamId]
    );
    return (result.rowCount || 0) > 0;
  }
}

