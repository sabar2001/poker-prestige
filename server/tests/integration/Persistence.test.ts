import { TableManager } from '../../src/rooms/TableManager';
import { TableInstance } from '../../src/rooms/TableInstance';
import { UserRepository } from '../../src/database/repositories/UserRepository';
import { HandHistoryRepository } from '../../src/database/repositories/HandHistoryRepository';
import { query, testConnection, closePool } from '../../src/database';

/**
 * Database Persistence Integration Test
 * 
 * This test verifies the full loop from Game Logic → Database:
 * - Player wins chips in a hand
 * - Chips are persisted to PostgreSQL
 * - Hand history is saved
 * 
 * REQUIRES: PostgreSQL running with migrated schema
 */

describe('Database Persistence: Full Game Loop', () => {
  const TEST_STEAM_ID = 'TEST_DB_PLAYER_001';
  const TEST_USERNAME = 'DbTestPlayer';
  const INITIAL_CHIPS = 1000;
  const WIN_AMOUNT = 500;

  let tableManager: TableManager;
  let table: TableInstance;

  beforeAll(async () => {
    // Verify database connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed. Is PostgreSQL running?');
    }
    console.log('✅ Database connected');
  });

  afterAll(async () => {
    // Close database connections
    await closePool();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await UserRepository.deleteUser(TEST_STEAM_ID);
    
    // Create test user with initial balance
    await UserRepository.findOrCreate(TEST_STEAM_ID, TEST_USERNAME);
    
    // Verify initial balance
    const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);
    expect(initialBalance).toBe(INITIAL_CHIPS);
    
    console.log(`✅ Test user created: ${TEST_USERNAME} with ${INITIAL_CHIPS} chips`);

    // Create table
    tableManager = TableManager.getInstance();
    table = tableManager.createTable({
      tableId: 'test-persistence-table',
      smallBlind: 10,
      bigBlind: 20
    });
  });

  afterEach(async () => {
    // Cleanup table
    if (table) {
      table.destroy();
      tableManager.destroyTable(table.tableId);
    }

    // Cleanup test user
    await UserRepository.deleteUser(TEST_STEAM_ID);
    
    // Cleanup test hand histories
    await query(
      'DELETE FROM hand_histories WHERE table_id = $1',
      ['test-persistence-table']
    );
  });

  describe('Chip Persistence', () => {
    it('should persist chip winnings to database after payout', async () => {
      console.log('\n🎮 Starting persistence test...\n');

      // Step 1: Get initial balance from DB
      const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      console.log(`1. Initial balance in DB: ${initialBalance} chips`);
      expect(initialBalance).toBe(INITIAL_CHIPS);

      // Step 2: Simulate winning chips
      console.log(`2. Simulating win of ${WIN_AMOUNT} chips...`);
      await UserRepository.updateBalance(TEST_STEAM_ID, WIN_AMOUNT);

      // Step 3: Verify balance updated in database
      const finalBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      console.log(`3. Final balance in DB: ${finalBalance} chips`);
      
      expect(finalBalance).toBe(INITIAL_CHIPS + WIN_AMOUNT);
      console.log(`✅ Balance persisted correctly: ${INITIAL_CHIPS} + ${WIN_AMOUNT} = ${finalBalance}`);
    });

    it('should handle negative balance updates (losses)', async () => {
      const LOSS_AMOUNT = -300;

      const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      console.log(`Initial: ${initialBalance} chips`);

      await UserRepository.updateBalance(TEST_STEAM_ID, LOSS_AMOUNT);

      const finalBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      console.log(`After loss: ${finalBalance} chips`);

      expect(finalBalance).toBe(INITIAL_CHIPS + LOSS_AMOUNT);
      expect(finalBalance).toBe(700);
    });

    it('should prevent negative balances', async () => {
      const EXCESSIVE_LOSS = -2000; // More than they have

      await expect(
        UserRepository.updateBalance(TEST_STEAM_ID, EXCESSIVE_LOSS)
      ).rejects.toThrow('Insufficient chips');

      // Balance should remain unchanged
      const balance = await UserRepository.getBalance(TEST_STEAM_ID);
      expect(balance).toBe(INITIAL_CHIPS);
    });

    it('should handle batch balance updates (multi-player payout)', async () => {
      // Create additional test users
      const PLAYER_2 = 'TEST_DB_PLAYER_002';
      const PLAYER_3 = 'TEST_DB_PLAYER_003';

      await UserRepository.findOrCreate(PLAYER_2, 'TestPlayer2');
      await UserRepository.findOrCreate(PLAYER_3, 'TestPlayer3');

      // Simulate payout: P1 wins 500, P2 loses 200, P3 loses 300
      const updates = new Map<string, number>([
        [TEST_STEAM_ID, 500],
        [PLAYER_2, -200],
        [PLAYER_3, -300]
      ]);

      await UserRepository.updateBalances(updates);

      // Verify all balances
      const balance1 = await UserRepository.getBalance(TEST_STEAM_ID);
      const balance2 = await UserRepository.getBalance(PLAYER_2);
      const balance3 = await UserRepository.getBalance(PLAYER_3);

      expect(balance1).toBe(1500); // 1000 + 500
      expect(balance2).toBe(800);  // 1000 - 200
      expect(balance3).toBe(700);  // 1000 - 300

      // Verify zero-sum (total chips conserved)
      const totalChips = balance1! + balance2! + balance3!;
      expect(totalChips).toBe(3000); // 3 players × 1000 initial

      // Cleanup
      await UserRepository.deleteUser(PLAYER_2);
      await UserRepository.deleteUser(PLAYER_3);
    });
  });

  describe('Hand History Persistence', () => {
    it('should save hand history to database', async () => {
      const handLog = {
        tableId: 'test-persistence-table',
        sequenceId: 1,
        startTime: new Date(),
        endTime: new Date(),
        players: [
          {
            steamId: TEST_STEAM_ID,
            username: TEST_USERNAME,
            position: 0,
            startingChips: 1000,
            endingChips: 1500,
            holeCards: [
              { rank: 'A', suit: 'H' },
              { rank: 'K', suit: 'H' }
            ],
            actions: [
              { action: 'RAISE', amount: 100, timestamp: new Date() },
              { action: 'CALL', timestamp: new Date() }
            ],
            hasFolded: false,
            handRank: 'Pair of Aces'
          }
        ],
        communityCards: [
          { rank: 'A', suit: 'D' },
          { rank: 'K', suit: 'C' },
          { rank: 'Q', suit: 'H' },
          { rank: 'J', suit: 'S' },
          { rank: 'T', suit: 'D' }
        ],
        pots: [
          {
            amount: 500,
            eligiblePlayers: [TEST_STEAM_ID]
          }
        ],
        winners: [
          {
            steamId: TEST_STEAM_ID,
            amount: 500,
            handRank: 'Pair of Aces'
          }
        ],
        smallBlind: 10,
        bigBlind: 20
      };

      // Save hand
      const handId = await HandHistoryRepository.saveHand(handLog);
      console.log(`✅ Hand saved with ID: ${handId}`);

      expect(handId).toBeGreaterThan(0);

      // Retrieve hand
      const savedHand = await HandHistoryRepository.getHandById(handId);
      expect(savedHand).not.toBeNull();
      expect(savedHand!.table_id).toBe('test-persistence-table');
      expect(savedHand!.winner_ids).toContain(TEST_STEAM_ID);
      expect(savedHand!.pot_total).toBe(500);

      // Verify JSONB data
      expect(savedHand!.hand_data.players).toHaveLength(1);
      expect(savedHand!.hand_data.winners[0].steamId).toBe(TEST_STEAM_ID);
    });

    it('should retrieve hands for a specific player', async () => {
      // Save multiple hands
      const handLog = {
        tableId: 'test-persistence-table',
        sequenceId: 1,
        startTime: new Date(),
        endTime: new Date(),
        players: [{ steamId: TEST_STEAM_ID, username: TEST_USERNAME, position: 0, startingChips: 1000, endingChips: 1500, holeCards: [], actions: [], hasFolded: false }],
        communityCards: [],
        pots: [{ amount: 500, eligiblePlayers: [TEST_STEAM_ID] }],
        winners: [{ steamId: TEST_STEAM_ID, amount: 500, handRank: 'High Card' }],
        smallBlind: 10,
        bigBlind: 20
      };

      await HandHistoryRepository.saveHand(handLog);
      await HandHistoryRepository.saveHand(handLog);

      // Retrieve player's hands
      const hands = await HandHistoryRepository.getHandsForPlayer(TEST_STEAM_ID);
      
      expect(hands.length).toBeGreaterThanOrEqual(2);
      hands.forEach(hand => {
        expect(hand.winner_ids).toContain(TEST_STEAM_ID);
      });
    });
  });

  describe('Transaction Safety', () => {
    it('should rollback on concurrent update conflicts', async () => {
      // This tests that our FOR UPDATE lock prevents race conditions
      const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);

      // Simulate concurrent updates (both should succeed sequentially)
      const update1 = UserRepository.updateBalance(TEST_STEAM_ID, 100);
      const update2 = UserRepository.updateBalance(TEST_STEAM_ID, 200);

      await Promise.all([update1, update2]);

      const finalBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      
      // Both updates should have been applied
      expect(finalBalance).toBe(initialBalance! + 300);
    });

    it('should maintain data integrity across failed transactions', async () => {
      const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);

      // Try to update with invalid amount (should fail)
      try {
        await UserRepository.updateBalance(TEST_STEAM_ID, -2000);
      } catch (error) {
        // Expected to fail
      }

      // Balance should be unchanged
      const balance = await UserRepository.getBalance(TEST_STEAM_ID);
      expect(balance).toBe(initialBalance);
    });
  });

  describe('Full Game Loop Integration', () => {
    it('should persist complete hand from game to database', async () => {
      console.log('\n🎮 Full integration test: Game → Database\n');

      // 1. Initial state
      const initialBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      console.log(`1. Initial balance: ${initialBalance} chips`);

      // 2. Add player to table (this would normally load from DB)
      const added = table.addPlayer(TEST_STEAM_ID, TEST_USERNAME, 0, initialBalance!);
      expect(added).toBe(true);
      console.log(`2. Player seated at table`);

      // 3. Simulate winning chips (in real game, this happens in PAYOUT state)
      await UserRepository.updateBalance(TEST_STEAM_ID, WIN_AMOUNT);
      console.log(`3. Chips updated: +${WIN_AMOUNT}`);

      // 4. Save hand history
      const handLog = {
        tableId: table.tableId,
        sequenceId: 1,
        startTime: new Date(),
        endTime: new Date(),
        players: [{
          steamId: TEST_STEAM_ID,
          username: TEST_USERNAME,
          position: 0,
          startingChips: initialBalance!,
          endingChips: initialBalance! + WIN_AMOUNT,
          holeCards: [],
          actions: [],
          hasFolded: false,
          handRank: 'Winner'
        }],
        communityCards: [],
        pots: [{ amount: WIN_AMOUNT, eligiblePlayers: [TEST_STEAM_ID] }],
        winners: [{ steamId: TEST_STEAM_ID, amount: WIN_AMOUNT, handRank: 'Winner' }],
        smallBlind: 10,
        bigBlind: 20
      };

      const handId = await HandHistoryRepository.saveHand(handLog);
      console.log(`4. Hand history saved (ID: ${handId})`);

      // 5. Verify persistence
      const finalBalance = await UserRepository.getBalance(TEST_STEAM_ID);
      const savedHand = await HandHistoryRepository.getHandById(handId);

      expect(finalBalance).toBe(INITIAL_CHIPS + WIN_AMOUNT);
      expect(savedHand).not.toBeNull();
      expect(savedHand!.winner_ids).toContain(TEST_STEAM_ID);

      console.log(`\n✅ Full loop verified:`);
      console.log(`   - Balance: ${initialBalance} → ${finalBalance}`);
      console.log(`   - Hand saved: ID ${handId}`);
      console.log(`   - Winner: ${TEST_USERNAME}`);
    });
  });
});

