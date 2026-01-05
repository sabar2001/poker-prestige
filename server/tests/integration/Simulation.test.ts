import { TableManager } from '../../src/rooms/TableManager';
import { TableInstance, GameState } from '../../src/rooms/TableInstance';
import { ActionType } from '../../src/protocol/Events';
import { StateSerializer } from '../../src/rooms/StateSerializer';

/**
 * Golden Path Integration Test
 * 
 * This test simulates a complete poker hand WITHOUT sockets.
 * We instantiate classes directly and verify the entire game flow.
 * 
 * Scenario: 3 players, full hand from pre-flop to showdown
 */
describe('Golden Path: Full Poker Hand Simulation', () => {
  let tableManager: TableManager;
  let table: TableInstance;

  const PLAYER_1 = {
    steamId: 'P1_test_001',
    username: 'Player1',
    position: 0,
    buyIn: 1000
  };

  const PLAYER_2 = {
    steamId: 'P2_test_002',
    username: 'Player2',
    position: 1,
    buyIn: 1000
  };

  const PLAYER_3 = {
    steamId: 'P3_test_003',
    username: 'Player3',
    position: 2,
    buyIn: 1000
  };

  beforeEach(() => {
    // Get singleton instance (fresh for each test conceptually, but it's a singleton)
    tableManager = TableManager.getInstance();
    
    // Create a test table
    table = tableManager.createTable({
      tableId: 'test-table-001',
      smallBlind: 10,
      bigBlind: 20
    });
  });

  afterEach(() => {
    // Cleanup
    if (table) {
      table.destroy();
      tableManager.destroyTable(table.tableId);
    }
  });

  describe('Setup Phase', () => {
    it('should create table and add 3 players', () => {
      // Add players
      const p1Added = table.addPlayer(
        PLAYER_1.steamId,
        PLAYER_1.username,
        PLAYER_1.position,
        PLAYER_1.buyIn
      );
      const p2Added = table.addPlayer(
        PLAYER_2.steamId,
        PLAYER_2.username,
        PLAYER_2.position,
        PLAYER_2.buyIn
      );
      const p3Added = table.addPlayer(
        PLAYER_3.steamId,
        PLAYER_3.username,
        PLAYER_3.position,
        PLAYER_3.buyIn
      );

      expect(p1Added).toBe(true);
      expect(p2Added).toBe(true);
      expect(p3Added).toBe(true);

      // Verify state
      const state = table.getPlayerView(PLAYER_1.steamId);
      expect(state.players.length).toBe(3);
      expect(state.state).toBe(GameState.WAITING_FOR_PLAYERS);
    });
  });

  describe('Full Hand Flow', () => {
    beforeEach(() => {
      // Setup: Add all 3 players
      table.addPlayer(PLAYER_1.steamId, PLAYER_1.username, PLAYER_1.position, PLAYER_1.buyIn);
      table.addPlayer(PLAYER_2.steamId, PLAYER_2.username, PLAYER_2.position, PLAYER_2.buyIn);
      table.addPlayer(PLAYER_3.steamId, PLAYER_3.username, PLAYER_3.position, PLAYER_3.buyIn);

      // Mark all ready
      table.setPlayerReady(PLAYER_1.steamId);
      table.setPlayerReady(PLAYER_2.steamId);
      table.setPlayerReady(PLAYER_3.steamId);
    });

    it('should progress through all game states', async () => {
      // State should auto-advance to GAME_STARTING, then DEALING, then PRE_FLOP
      // We need to wait a bit for the countdown timer (3s)
      await new Promise(resolve => setTimeout(resolve, 3500));

      let state = table.getPlayerView(PLAYER_1.steamId);
      
      // Should be in PRE_FLOP or later
      expect([GameState.PRE_FLOP, GameState.DEALING, GameState.FLOP, GameState.TURN, GameState.RIVER])
        .toContain(state.state);

      // If still in DEALING, wait a bit more
      if (state.state === GameState.DEALING) {
        await new Promise(resolve => setTimeout(resolve, 500));
        state = table.getPlayerView(PLAYER_1.steamId);
      }

      console.log('Current state after setup:', state.state);

      // Verify we're in pre-flop
      expect(state.state).toBe(GameState.PRE_FLOP);
      
      // Verify pot has blinds
      expect(state.pot).toBe(30); // Small blind (10) + Big blind (20)

      // Verify current bet is big blind
      expect(state.currentBet).toBe(20);
    });

    it('should simulate complete hand: Pre-flop → Flop → Turn → River → Showdown', async () => {
      // Wait for game to start
      await new Promise(resolve => setTimeout(resolve, 3500));

      let state = table.getPlayerView(PLAYER_1.steamId);
      console.log('\n=== Initial State ===');
      console.log('State:', state.state);
      console.log('Pot:', state.pot);
      console.log('Current bet:', state.currentBet);

      // === PRE-FLOP ===
      console.log('\n=== PRE-FLOP ===');
      
      // P1 (should be first to act after big blind)
      // Determine who's first to act by checking currentPlayerIndex
      const currentPlayer = state.players[state.currentPlayerIndex];
      console.log('Current player to act:', currentPlayer?.steamId);

      // Let's identify positions: P1 is dealer (0), P2 is SB (1), P3 is BB (2)
      // First to act should be P1 (after BB)
      
      // P1 Raises to 100
      let success = table.handlePlayerAction(PLAYER_1.steamId, ActionType.RAISE, 100);
      if (!success) {
        // If P1 is not first, try the actual first player
        const firstPlayer = state.players[state.currentPlayerIndex];
        if (firstPlayer.steamId === PLAYER_2.steamId) {
          // P2 goes first, adjust scenario
          table.handlePlayerAction(PLAYER_2.steamId, ActionType.RAISE, 100);
          table.handlePlayerAction(PLAYER_3.steamId, ActionType.FOLD);
          table.handlePlayerAction(PLAYER_1.steamId, ActionType.CALL);
        } else if (firstPlayer.steamId === PLAYER_3.steamId) {
          // P3 goes first
          table.handlePlayerAction(PLAYER_3.steamId, ActionType.FOLD);
          table.handlePlayerAction(PLAYER_1.steamId, ActionType.RAISE, 100);
          table.handlePlayerAction(PLAYER_2.steamId, ActionType.CALL);
        }
      } else {
        // P1 raised successfully
        console.log('P1 raised to 100');
        
        // P2 Calls
        table.handlePlayerAction(PLAYER_2.steamId, ActionType.CALL);
        console.log('P2 called');
        
        // P3 Folds
        table.handlePlayerAction(PLAYER_3.steamId, ActionType.FOLD);
        console.log('P3 folded');
      }

      state = table.getPlayerView(PLAYER_1.steamId);
      console.log('After pre-flop - State:', state.state);
      console.log('Pot:', state.pot);

      // Should advance to FLOP
      expect(state.state).toBe(GameState.FLOP);
      expect(state.communityCards.length).toBe(3);
      
      // Pot should be: 100 (P1) + 100 (P2) + small blind (10) = 210
      // Actually: P1 put in 100, P2 put in 100, blinds were already in (30)
      // So pot should be around 200
      expect(state.pot).toBeGreaterThanOrEqual(200);

      // === FLOP ===
      console.log('\n=== FLOP ===');
      console.log('Community cards:', state.communityCards);
      
      // Both check
      const flopCurrentPlayer = state.players[state.currentPlayerIndex];
      console.log('First to act on flop:', flopCurrentPlayer.steamId);
      
      table.handlePlayerAction(flopCurrentPlayer.steamId, ActionType.CHECK);
      console.log(flopCurrentPlayer.steamId, 'checked');
      
      state = table.getPlayerView(PLAYER_1.steamId);
      const secondPlayer = state.players[state.currentPlayerIndex];
      table.handlePlayerAction(secondPlayer.steamId, ActionType.CHECK);
      console.log(secondPlayer.steamId, 'checked');

      state = table.getPlayerView(PLAYER_1.steamId);
      console.log('After flop - State:', state.state);
      
      // Should advance to TURN
      expect(state.state).toBe(GameState.TURN);
      expect(state.communityCards.length).toBe(4);

      // === TURN ===
      console.log('\n=== TURN ===');
      
      // First player bets 200
      const turnFirstPlayer = state.players[state.currentPlayerIndex];
      console.log('First to act on turn:', turnFirstPlayer.steamId);
      
      table.handlePlayerAction(turnFirstPlayer.steamId, ActionType.RAISE, 200);
      console.log(turnFirstPlayer.steamId, 'bet 200');
      
      state = table.getPlayerView(PLAYER_1.steamId);
      const turnSecondPlayer = state.players[state.currentPlayerIndex];
      table.handlePlayerAction(turnSecondPlayer.steamId, ActionType.CALL);
      console.log(turnSecondPlayer.steamId, 'called');

      state = table.getPlayerView(PLAYER_1.steamId);
      console.log('After turn - State:', state.state);
      console.log('Pot:', state.pot);
      
      // Should advance to RIVER
      expect(state.state).toBe(GameState.RIVER);
      expect(state.communityCards.length).toBe(5);

      // Pot should now include the 400 from turn betting
      expect(state.pot).toBeGreaterThanOrEqual(600);

      // === RIVER ===
      console.log('\n=== RIVER ===');
      
      // Both check
      const riverFirstPlayer = state.players[state.currentPlayerIndex];
      table.handlePlayerAction(riverFirstPlayer.steamId, ActionType.CHECK);
      console.log(riverFirstPlayer.steamId, 'checked');
      
      state = table.getPlayerView(PLAYER_1.steamId);
      const riverSecondPlayer = state.players[state.currentPlayerIndex];
      table.handlePlayerAction(riverSecondPlayer.steamId, ActionType.CHECK);
      console.log(riverSecondPlayer.steamId, 'checked');

      // Wait for showdown to process
      await new Promise(resolve => setTimeout(resolve, 100));

      state = table.getPlayerView(PLAYER_1.steamId);
      console.log('\n=== After River ===');
      console.log('State:', state.state);
      
      // Should be in SHOWDOWN or PAYOUT
      expect([GameState.SHOWDOWN_REVEAL, GameState.PAYOUT_ANIMATION])
        .toContain(state.state);
    });

    it('should correctly calculate pot with PotManager', async () => {
      // Wait for game to start
      await new Promise(resolve => setTimeout(resolve, 3500));

      let state = table.getPlayerView(PLAYER_1.steamId);

      // Play through pre-flop
      const firstPlayer = state.players[state.currentPlayerIndex];
      
      // Simplified: everyone calls to big blind
      if (firstPlayer.currentBet < 20) {
        table.handlePlayerAction(firstPlayer.steamId, ActionType.CALL);
      } else {
        table.handlePlayerAction(firstPlayer.steamId, ActionType.CHECK);
      }

      state = table.getPlayerView(PLAYER_1.steamId);
      const secondPlayer = state.players[state.currentPlayerIndex];
      if (secondPlayer.currentBet < 20) {
        table.handlePlayerAction(secondPlayer.steamId, ActionType.CALL);
      } else {
        table.handlePlayerAction(secondPlayer.steamId, ActionType.CHECK);
      }

      state = table.getPlayerView(PLAYER_1.steamId);
      const thirdPlayer = state.players[state.currentPlayerIndex];
      if (thirdPlayer.currentBet < 20) {
        table.handlePlayerAction(thirdPlayer.steamId, ActionType.CALL);
      } else {
        table.handlePlayerAction(thirdPlayer.steamId, ActionType.CHECK);
      }

      state = table.getPlayerView(PLAYER_1.steamId);
      
      // Pot should be 60 (20 × 3 players)
      expect(state.pot).toBe(60);
      expect(state.state).toBe(GameState.FLOP);
    });

    it('should use StateSerializer to hide opponent cards', async () => {
      // Wait for game to start
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Get state for P1
      const p1State = table.getPlayerView(PLAYER_1.steamId);
      
      // Find P1 and P2 in the state
      const p1Data = p1State.players.find(p => p.steamId === PLAYER_1.steamId);
      const p2Data = p1State.players.find(p => p.steamId === PLAYER_2.steamId);

      // P1 should see their own cards
      expect(p1Data?.holeCards).not.toBeNull();
      expect(p1Data?.holeCards).toHaveLength(2);

      // P1 should NOT see P2's cards (should be null)
      expect(p2Data?.holeCards).toBeNull();

      // Verify StateSerializer validation
      expect(StateSerializer.validateSanitized(p1State, PLAYER_1.steamId)).toBe(true);

      console.log('✓ P1 can see their cards:', p1Data?.holeCards);
      console.log('✓ P1 cannot see P2 cards:', p2Data?.holeCards);
    });

    it('should award chips to winner after showdown', async () => {
      // Wait for game to start
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Get initial chip counts
      let state = table.getPlayerView(PLAYER_1.steamId);
      const p1InitialChips = state.players.find(p => p.steamId === PLAYER_1.steamId)?.chips || 0;
      const p2InitialChips = state.players.find(p => p.steamId === PLAYER_2.steamId)?.chips || 0;

      // Play a quick hand - everyone checks through
      // Pre-flop
      for (let i = 0; i < 3; i++) {
        state = table.getPlayerView(PLAYER_1.steamId);
        const currentP = state.players[state.currentPlayerIndex];
        if (currentP && !currentP.hasFolded) {
          if (currentP.currentBet < state.currentBet) {
            table.handlePlayerAction(currentP.steamId, ActionType.CALL);
          } else {
            table.handlePlayerAction(currentP.steamId, ActionType.CHECK);
          }
        }
      }

      // Flop
      state = table.getPlayerView(PLAYER_1.steamId);
      if (state.state === GameState.FLOP) {
        for (let i = 0; i < 3; i++) {
          state = table.getPlayerView(PLAYER_1.steamId);
          const currentP = state.players[state.currentPlayerIndex];
          if (currentP && !currentP.hasFolded && !currentP.hasActed) {
            table.handlePlayerAction(currentP.steamId, ActionType.CHECK);
          }
        }
      }

      // Turn
      state = table.getPlayerView(PLAYER_1.steamId);
      if (state.state === GameState.TURN) {
        for (let i = 0; i < 3; i++) {
          state = table.getPlayerView(PLAYER_1.steamId);
          const currentP = state.players[state.currentPlayerIndex];
          if (currentP && !currentP.hasFolded && !currentP.hasActed) {
            table.handlePlayerAction(currentP.steamId, ActionType.CHECK);
          }
        }
      }

      // River
      state = table.getPlayerView(PLAYER_1.steamId);
      if (state.state === GameState.RIVER) {
        for (let i = 0; i < 3; i++) {
          state = table.getPlayerView(PLAYER_1.steamId);
          const currentP = state.players[state.currentPlayerIndex];
          if (currentP && !currentP.hasFolded && !currentP.hasActed) {
            table.handlePlayerAction(currentP.steamId, ActionType.CHECK);
          }
        }
      }

      // Wait for showdown and payout
      await new Promise(resolve => setTimeout(resolve, 6000));

      state = table.getPlayerView(PLAYER_1.steamId);
      
      // At least one player should have gained chips
      const p1FinalChips = state.players.find(p => p.steamId === PLAYER_1.steamId)?.chips || 0;
      const p2FinalChips = state.players.find(p => p.steamId === PLAYER_2.steamId)?.chips || 0;
      const p3FinalChips = state.players.find(p => p.steamId === PLAYER_3.steamId)?.chips || 0;

      const totalFinalChips = p1FinalChips + p2FinalChips + p3FinalChips;
      const totalInitialChips = 3000; // 3 players × 1000

      // Total chips should be conserved
      expect(totalFinalChips).toBe(totalInitialChips);

      // At least one player should have more than initial
      const someoneWon = p1FinalChips > p1InitialChips || 
                         p2FinalChips > p2InitialChips || 
                         p3FinalChips > p2InitialChips;
      expect(someoneWon).toBe(true);

      console.log('Chip distribution:');
      console.log('P1:', p1InitialChips, '→', p1FinalChips);
      console.log('P2:', p2InitialChips, '→', p2FinalChips);
      console.log('P3:', 1000, '→', p3FinalChips);
    });
  });
});

