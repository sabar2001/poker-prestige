import { v4 as uuidv4 } from 'uuid';
import { Deck } from '../engine/Deck';
import { HandEvaluator, HandResult } from '../engine/HandEvaluator';
import { PotManager } from '../engine/PotManager';
import { StateSerializer, GodState, PlayerView } from './StateSerializer';
import { ActionType } from '../protocol/Events';
import { Card } from '../types/game.types';

/**
 * Game States - PC-Optimized lifecycle
 */
export enum GameState {
  LOBBY_INITIALIZING = 'LOBBY_INITIALIZING',
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  GAME_STARTING = 'GAME_STARTING',      // 3-2-1 countdown
  DEALING = 'DEALING',                   // Cards being dealt
  PRE_FLOP = 'PRE_FLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN_REVEAL = 'SHOWDOWN_REVEAL',   // Dramatic card flips
  PAYOUT_ANIMATION = 'PAYOUT_ANIMATION', // Chip animations
  SOCIAL_BANTER = 'SOCIAL_BANTER'        // 15s social phase
}

/**
 * Player data stored in table
 */
interface TablePlayer {
  steamId: string;
  username: string;
  position: number;        // Seat position (0-5 for 6-max)
  chips: number;
  holeCards: Card[];
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  isReady: boolean;        // Ready to start next hand
  handRank?: string;       // Set at showdown
  handValue?: number;      // For comparison
}

/**
 * TableInstance - Authoritative State Machine
 * 
 * This is the CORE of the game logic
 * - Uses Engine layer for pure logic
 * - Uses StateSerializer for all outputs
 * - Implements full PC-optimized state machine
 * - Handles timers and auto-fold
 */
export class TableInstance {
  // Identification
  public readonly tableId: string;
  public readonly maxPlayers: number = 6;
  public readonly minPlayers: number = 2;

  // Engine components (Pure Logic)
  private deck: Deck;
  private potManager: PotManager;
  // HandEvaluator is used statically, no instance needed
  // private handEvaluator: HandEvaluator;

  // Game state
  private gameState: GameState;
  private sequenceId: number = 0; // For reconnection tracking
  private players: Map<number, TablePlayer> = new Map(); // position -> player
  private communityCards: Card[] = [];
  private currentBet: number = 0;
  private dealerPosition: number = 0;
  private currentPlayerIndex: number = 0;

  // Blinds configuration
  private readonly smallBlind: number;
  private readonly bigBlind: number;

  // Timer system
  private turnTimer: NodeJS.Timeout | null = null;
  private stateTimer: NodeJS.Timeout | null = null;
  private readonly turnTimeoutMs: number = 30000;   // 30s per turn
  private readonly countdownMs: number = 3000;      // 3s countdown
  private readonly payoutAnimationMs: number = 5000; // 5s for coin animations
  private readonly banterPhaseMs: number = 15000;   // 15s social phase

  // Callbacks for emitting events
  private onStateChange?: (state: PlayerView, playerSteamIds: string[]) => void;
  private onPlayerAction?: (steamId: string, action: ActionType, amount?: number) => void;
  private onError?: (steamId: string, code: string, message: string) => void;

  constructor(
    tableId: string = uuidv4(),
    smallBlind: number = 10,
    bigBlind: number = 20
  ) {
    this.tableId = tableId;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;

    // Initialize engine components
    this.deck = new Deck();
    this.potManager = new PotManager();
    // HandEvaluator is used statically (HandEvaluator.evaluateHand)

    // Start in lobby state
    this.gameState = GameState.LOBBY_INITIALIZING;

    console.log(`[Table ${this.tableId}] Initialized`);
  }

  /**
   * Add a player to the table
   */
  addPlayer(steamId: string, username: string, position: number, buyIn: number): boolean {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }

    if (this.players.has(position)) {
      return false;
    }

    // Can only join in waiting states
    if (this.gameState !== GameState.LOBBY_INITIALIZING && 
        this.gameState !== GameState.WAITING_FOR_PLAYERS &&
        this.gameState !== GameState.SOCIAL_BANTER) {
      return false;
    }

    const player: TablePlayer = {
      steamId,
      username,
      position,
      chips: buyIn,
      holeCards: [],
      currentBet: 0,
      hasFolded: false,
      isAllIn: false,
      hasActed: false,
      isReady: false
    };

    this.players.set(position, player);
    console.log(`[Table ${this.tableId}] Player ${username} joined at seat ${position}`);

    // Transition to waiting if we're in lobby
    if (this.gameState === GameState.LOBBY_INITIALIZING) {
      this.transitionTo(GameState.WAITING_FOR_PLAYERS);
    }

    this.broadcastState();
    return true;
  }

  /**
   * Remove a player from the table
   */
  removePlayer(steamId: string): boolean {
    for (const [position, player] of this.players.entries()) {
      if (player.steamId === steamId) {
        this.players.delete(position);
        console.log(`[Table ${this.tableId}] Player ${player.username} left`);
        
        // If game in progress and player was active, fold them
        if (!player.hasFolded && this.isGameInProgress()) {
          this.handlePlayerFold(steamId);
        }

        this.broadcastState();
        return true;
      }
    }
    return false;
  }

  /**
   * Mark player as ready
   */
  setPlayerReady(steamId: string): void {
    const player = this.getPlayerBySteamId(steamId);
    if (player) {
      player.isReady = true;
      this.checkStartConditions();
    }
  }

  /**
   * Check if we can start the game
   */
  private checkStartConditions(): void {
    if (this.gameState !== GameState.WAITING_FOR_PLAYERS) {
      return;
    }

    const activePlayers = Array.from(this.players.values()).filter(p => p.chips > 0);
    
    if (activePlayers.length >= this.minPlayers) {
      const allReady = activePlayers.every(p => p.isReady);
      if (allReady) {
        this.startGame();
      }
    }
  }

  /**
   * Start the game (countdown phase)
   */
  private startGame(): void {
    console.log(`[Table ${this.tableId}] Starting game...`);
    this.transitionTo(GameState.GAME_STARTING);

    // 3-2-1 countdown
    this.stateTimer = setTimeout(() => {
      this.startHand();
    }, this.countdownMs);
  }

  /**
   * Start a new hand
   */
  private startHand(): void {
    console.log(`[Table ${this.tableId}] Dealing new hand`);

    // Reset for new hand
    this.deck.reset();
    this.potManager.reset();
    this.communityCards = [];
    this.currentBet = this.bigBlind;

    // Reset all players
    this.players.forEach(player => {
      player.holeCards = [];
      player.currentBet = 0;
      player.hasFolded = false;
      player.isAllIn = false;
      player.hasActed = false;
      player.isReady = false;
      player.handRank = undefined;
      player.handValue = undefined;
    });

    this.transitionTo(GameState.DEALING);

    // Deal hole cards
    this.dealHoleCards();

    // Post blinds
    this.postBlinds();

    // Move to pre-flop
    this.transitionTo(GameState.PRE_FLOP);
    this.startBettingRound();
  }

  /**
   * Deal hole cards to all active players
   */
  private dealHoleCards(): void {
    const activePlayers = this.getActivePlayers();
    
    for (const player of activePlayers) {
      player.holeCards = this.deck.deal(2);
    }

    console.log(`[Table ${this.tableId}] Dealt hole cards to ${activePlayers.length} players`);
  }

  /**
   * Post small and big blinds
   */
  private postBlinds(): void {
    const playerArray = Array.from(this.players.values());
    if (playerArray.length < 2) return;

    // Calculate positions
    const sbIndex = (this.dealerPosition + 1) % playerArray.length;
    const bbIndex = (this.dealerPosition + 2) % playerArray.length;

    const sbPlayer = playerArray[sbIndex];
    const bbPlayer = playerArray[bbIndex];

    // Post small blind
    const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    this.potManager.addContribution(sbPlayer.steamId, sbAmount);
    if (sbPlayer.chips === 0) sbPlayer.isAllIn = true;

    // Post big blind
    const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    this.potManager.addContribution(bbPlayer.steamId, bbAmount);
    if (bbPlayer.chips === 0) bbPlayer.isAllIn = true;

    // First to act is after big blind
    this.currentPlayerIndex = (bbIndex + 1) % playerArray.length;

    console.log(`[Table ${this.tableId}] Blinds posted: SB ${sbAmount}, BB ${bbAmount}`);
  }

  /**
   * Start a betting round
   */
  private startBettingRound(): void {
    // Reset hasActed for all players
    this.players.forEach(p => p.hasActed = false);

    // Start turn timer for current player
    this.startTurnTimer();
    this.broadcastState();
  }

  /**
   * Handle player action
   */
  handlePlayerAction(steamId: string, action: ActionType, amount?: number): boolean {
    // Validate it's this player's turn
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.steamId !== steamId) {
      if (this.onError) {
        this.onError(steamId, 'NOT_YOUR_TURN', 'It is not your turn');
      }
      return false;
    }

    // Can't act if folded or all-in
    if (currentPlayer.hasFolded || currentPlayer.isAllIn) {
      return false;
    }

    // Validate state
    if (!this.isInBettingRound()) {
      return false;
    }

    // Stop turn timer
    this.stopTurnTimer();

    // Process action
    let success = false;
    switch (action) {
      case ActionType.FOLD:
        success = this.handlePlayerFold(steamId);
        break;
      case ActionType.CHECK:
        success = this.handlePlayerCheck(steamId);
        break;
      case ActionType.CALL:
        success = this.handlePlayerCall(steamId);
        break;
      case ActionType.RAISE:
        success = this.handlePlayerRaise(steamId, amount);
        break;
      case ActionType.ALL_IN:
        success = this.handlePlayerAllIn(steamId);
        break;
    }

    if (!success) {
      if (this.onError) {
        this.onError(steamId, 'INVALID_ACTION', 'Invalid action');
      }
      this.startTurnTimer(); // Restart timer
      return false;
    }

    // Broadcast action
    if (this.onPlayerAction) {
      this.onPlayerAction(steamId, action, amount);
    }

    // Mark as acted
    currentPlayer.hasActed = true;
    this.incrementSequenceId();

    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      this.endBettingRound();
    } else {
      // Move to next player
      this.advanceToNextPlayer();
      this.startTurnTimer();
    }

    this.broadcastState();
    return true;
  }

  /**
   * Handle fold action
   */
  private handlePlayerFold(steamId: string): boolean {
    const player = this.getPlayerBySteamId(steamId);
    if (!player) return false;

    player.hasFolded = true;
    console.log(`[Table ${this.tableId}] ${player.username} folded`);

    // Check if only one player left
    const activePlayers = this.getActivePlayers().filter(p => !p.hasFolded);
    if (activePlayers.length === 1) {
      // Winner by default
      this.handleSingleWinner(activePlayers[0]);
    }

    return true;
  }

  /**
   * Handle check action
   */
  private handlePlayerCheck(steamId: string): boolean {
    const player = this.getPlayerBySteamId(steamId);
    if (!player) return false;

    // Can only check if current bet matches
    if (player.currentBet < this.currentBet) {
      return false;
    }

    console.log(`[Table ${this.tableId}] ${player.username} checked`);
    return true;
  }

  /**
   * Handle call action
   */
  private handlePlayerCall(steamId: string): boolean {
    const player = this.getPlayerBySteamId(steamId);
    if (!player) return false;

    const callAmount = this.currentBet - player.currentBet;
    if (callAmount <= 0) {
      return false; // Nothing to call
    }

    const actualAmount = Math.min(callAmount, player.chips);
    player.chips -= actualAmount;
    player.currentBet += actualAmount;
    this.potManager.addContribution(player.steamId, actualAmount);

    if (player.chips === 0) {
      player.isAllIn = true;
    }

    console.log(`[Table ${this.tableId}] ${player.username} called ${actualAmount}`);
    return true;
  }

  /**
   * Handle raise action
   */
  private handlePlayerRaise(steamId: string, amount?: number): boolean {
    const player = this.getPlayerBySteamId(steamId);
    if (!player || !amount) return false;

    // Raise must be at least big blind and more than current bet
    if (amount <= this.currentBet || amount - this.currentBet < this.bigBlind) {
      return false;
    }

    const raiseAmount = amount - player.currentBet;
    if (raiseAmount > player.chips) {
      return false; // Not enough chips
    }

    player.chips -= raiseAmount;
    player.currentBet = amount;
    this.currentBet = amount;
    this.potManager.addContribution(player.steamId, raiseAmount);

    // Reset hasActed for all other players (they need to respond to raise)
    this.players.forEach(p => {
      if (p.steamId !== steamId && !p.hasFolded && !p.isAllIn) {
        p.hasActed = false;
      }
    });

    if (player.chips === 0) {
      player.isAllIn = true;
    }

    console.log(`[Table ${this.tableId}] ${player.username} raised to ${amount}`);
    return true;
  }

  /**
   * Handle all-in action
   */
  private handlePlayerAllIn(steamId: string): boolean {
    const player = this.getPlayerBySteamId(steamId);
    if (!player) return false;

    const allInAmount = player.chips;
    if (allInAmount === 0) return false;

    player.chips = 0;
    player.currentBet += allInAmount;
    player.isAllIn = true;
    this.potManager.addContribution(player.steamId, allInAmount);

    // If all-in is more than current bet, it's a raise
    if (player.currentBet > this.currentBet) {
      this.currentBet = player.currentBet;
      // Reset hasActed for others
      this.players.forEach(p => {
        if (p.steamId !== steamId && !p.hasFolded && !p.isAllIn) {
          p.hasActed = false;
        }
      });
    }

    console.log(`[Table ${this.tableId}] ${player.username} went all-in with ${allInAmount}`);
    return true;
  }

  /**
   * Check if betting round is complete
   */
  private isBettingRoundComplete(): boolean {
    const activePlayers = this.getActivePlayers().filter(p => !p.hasFolded);
    
    if (activePlayers.length === 0) {
      return true;
    }

    // All active players who can act have acted and matched the current bet
    const playersWhoCanAct = activePlayers.filter(p => !p.isAllIn);
    
    if (playersWhoCanAct.length === 0) {
      return true; // Everyone is all-in
    }

    return playersWhoCanAct.every(p => p.hasActed && p.currentBet === this.currentBet);
  }

  /**
   * End betting round and advance state
   */
  private endBettingRound(): void {
    this.stopTurnTimer();

    switch (this.gameState) {
      case GameState.PRE_FLOP:
        this.dealFlop();
        break;
      case GameState.FLOP:
        this.dealTurn();
        break;
      case GameState.TURN:
        this.dealRiver();
        break;
      case GameState.RIVER:
        this.startShowdown();
        break;
    }
  }

  /**
   * Deal the flop (3 community cards)
   */
  private dealFlop(): void {
    this.deck.burn();
    this.communityCards.push(...this.deck.deal(3));
    
    this.transitionTo(GameState.FLOP);
    this.currentBet = 0;
    this.players.forEach(p => p.currentBet = 0);
    
    // Dealer acts first post-flop
    this.currentPlayerIndex = (this.dealerPosition + 1) % this.players.size;
    
    console.log(`[Table ${this.tableId}] Flop dealt`);
    this.startBettingRound();
  }

  /**
   * Deal the turn (4th community card)
   */
  private dealTurn(): void {
    this.deck.burn();
    this.communityCards.push(...this.deck.deal(1));
    
    this.transitionTo(GameState.TURN);
    this.currentBet = 0;
    this.players.forEach(p => p.currentBet = 0);
    
    console.log(`[Table ${this.tableId}] Turn dealt`);
    this.startBettingRound();
  }

  /**
   * Deal the river (5th community card)
   */
  private dealRiver(): void {
    this.deck.burn();
    this.communityCards.push(...this.deck.deal(1));
    
    this.transitionTo(GameState.RIVER);
    this.currentBet = 0;
    this.players.forEach(p => p.currentBet = 0);
    
    console.log(`[Table ${this.tableId}] River dealt`);
    this.startBettingRound();
  }

  /**
   * Start showdown phase
   */
  private startShowdown(): void {
    this.transitionTo(GameState.SHOWDOWN_REVEAL);
    
    // Evaluate all active hands
    const activePlayers = this.getActivePlayers().filter(p => !p.hasFolded);
    const handResults = new Map<string, HandResult>();

    for (const player of activePlayers) {
      const allCards = [...player.holeCards, ...this.communityCards];
      const result = HandEvaluator.evaluateHand(allCards);
      player.handRank = result.description;
      player.handValue = result.value;
      handResults.set(player.steamId, result);
    }

    console.log(`[Table ${this.tableId}] Showdown - evaluating hands`);
    
    // Calculate pots and winners
    this.calculatePayouts(handResults);
  }

  /**
   * Calculate payouts using PotManager
   */
  private calculatePayouts(handResults: Map<string, HandResult>): void {
    const activePlayers = this.getActivePlayers()
      .filter(p => !p.hasFolded)
      .map(p => p.steamId);

    const pots = this.potManager.calculatePots(activePlayers);
    
    // Create winners map (steamId -> hand value)
    const winners = new Map<string, number>();
    handResults.forEach((result, steamId) => {
      winners.set(steamId, result.value);
    });

    // Distribute pots
    const payouts = this.potManager.distributePots(pots, winners);

    // Apply payouts
    payouts.forEach((amount, steamId) => {
      const player = this.getPlayerBySteamId(steamId);
      if (player) {
        player.chips += amount;
        console.log(`[Table ${this.tableId}] ${player.username} won ${amount} chips`);
      }
    });

    this.transitionTo(GameState.PAYOUT_ANIMATION);
    this.broadcastState();

    // Wait for payout animation
    this.stateTimer = setTimeout(() => {
      this.startBanterPhase();
    }, this.payoutAnimationMs);
  }

  /**
   * Handle single winner (everyone else folded)
   */
  private handleSingleWinner(winner: TablePlayer): void {
    const pot = this.potManager.getTotalPot();
    winner.chips += pot;
    
    console.log(`[Table ${this.tableId}] ${winner.username} won ${pot} chips (all others folded)`);
    
    this.transitionTo(GameState.PAYOUT_ANIMATION);
    this.broadcastState();

    this.stateTimer = setTimeout(() => {
      this.startBanterPhase();
    }, this.payoutAnimationMs);
  }

  /**
   * Start banter phase (social cooldown)
   */
  private startBanterPhase(): void {
    this.transitionTo(GameState.SOCIAL_BANTER);
    this.broadcastState();

    console.log(`[Table ${this.tableId}] Banter phase started (15s)`);

    // After banter, move dealer and start next hand
    this.stateTimer = setTimeout(() => {
      this.moveDealerButton();
      this.transitionTo(GameState.WAITING_FOR_PLAYERS);
      
      // Auto-ready players who still have chips
      this.players.forEach(p => {
        if (p.chips > 0) {
          p.isReady = true;
        }
      });
      
      this.checkStartConditions();
    }, this.banterPhaseMs);
  }

  /**
   * Move dealer button to next player
   */
  private moveDealerButton(): void {
    const playerArray = Array.from(this.players.values());
    this.dealerPosition = (this.dealerPosition + 1) % playerArray.length;
  }

  /**
   * Handle social action (bypass state machine)
   */
  handleSocial(steamId: string, payload: any): void {
    // Social actions don't affect game state
    // They're forwarded directly to clients via the social channel
    // This is handled at the app.ts level
    console.log(`[Table ${this.tableId}] Social action from ${steamId}:`, payload);
  }

  /**
   * Turn Timer - Auto-fold on timeout
   */
  private startTurnTimer(): void {
    this.stopTurnTimer();
    
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return;

    this.turnTimer = setTimeout(() => {
      console.log(`[Table ${this.tableId}] ${currentPlayer.username} timed out - auto-folding`);
      this.handlePlayerAction(currentPlayer.steamId, ActionType.FOLD);
    }, this.turnTimeoutMs);
  }

  /**
   * Stop turn timer
   */
  private stopTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /**
   * Advance to next player
   */
  private advanceToNextPlayer(): void {
    const playerArray = Array.from(this.players.values());
    let attempts = 0;
    
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % playerArray.length;
      attempts++;
    } while (
      attempts < playerArray.length &&
      (playerArray[this.currentPlayerIndex].hasFolded || 
       playerArray[this.currentPlayerIndex].isAllIn)
    );
  }

  /**
   * Get current player
   */
  private getCurrentPlayer(): TablePlayer | null {
    const playerArray = Array.from(this.players.values());
    return playerArray[this.currentPlayerIndex] || null;
  }

  /**
   * Get active players (have chips)
   */
  private getActivePlayers(): TablePlayer[] {
    return Array.from(this.players.values()).filter(p => p.chips > 0 || p.currentBet > 0);
  }

  /**
   * Get player by Steam ID
   */
  private getPlayerBySteamId(steamId: string): TablePlayer | null {
    for (const player of this.players.values()) {
      if (player.steamId === steamId) {
        return player;
      }
    }
    return null;
  }

  /**
   * Check if in betting round
   */
  private isInBettingRound(): boolean {
    return [
      GameState.PRE_FLOP,
      GameState.FLOP,
      GameState.TURN,
      GameState.RIVER
    ].includes(this.gameState);
  }

  /**
   * Check if game is in progress
   */
  private isGameInProgress(): boolean {
    return ![
      GameState.LOBBY_INITIALIZING,
      GameState.WAITING_FOR_PLAYERS,
      GameState.SOCIAL_BANTER
    ].includes(this.gameState);
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: GameState): void {
    console.log(`[Table ${this.tableId}] State: ${this.gameState} -> ${newState}`);
    this.gameState = newState;
    this.incrementSequenceId();
  }

  /**
   * Increment sequence ID (for reconnection)
   */
  private incrementSequenceId(): void {
    this.sequenceId++;
  }

  /**
   * Build God State (complete server truth)
   */
  private buildGodState(): GodState {
    return {
      tableId: this.tableId,
      sequenceId: this.sequenceId,
      state: this.gameState,
      deck: this.deck.peek(52), // Include deck for god state
      communityCards: [...this.communityCards],
      pot: this.potManager.getTotalPot(),
      currentBet: this.currentBet,
      dealerPosition: this.dealerPosition,
      currentPlayerIndex: this.currentPlayerIndex,
      players: Array.from(this.players.values()).map(p => ({
        steamId: p.steamId,
        position: p.position,
        chips: p.chips,
        holeCards: [...p.holeCards],
        currentBet: p.currentBet,
        hasFolded: p.hasFolded,
        isAllIn: p.isAllIn,
        hasActed: p.hasActed,
        handRank: p.handRank
      }))
    };
  }

  /**
   * Get sanitized state for a specific player
   */
  getPlayerView(steamId: string): PlayerView {
    const godState = this.buildGodState();
    return StateSerializer.serializeForPlayer(godState, steamId);
  }

  /**
   * Get showdown view (reveals all active hands)
   */
  getShowdownView(): PlayerView {
    const godState = this.buildGodState();
    const activePlayers = this.getActivePlayers()
      .filter(p => !p.hasFolded)
      .map(p => p.steamId);
    return StateSerializer.serializeForShowdown(godState, activePlayers);
  }

  /**
   * Broadcast state to all players
   */
  private broadcastState(): void {
    if (!this.onStateChange) return;

    const playerSteamIds = Array.from(this.players.values()).map(p => p.steamId);
    
    // In showdown, use showdown view
    if (this.gameState === GameState.SHOWDOWN_REVEAL || 
        this.gameState === GameState.PAYOUT_ANIMATION) {
      const showdownView = this.getShowdownView();
      this.onStateChange(showdownView, playerSteamIds);
    } else {
      // Each player gets their own sanitized view
      // This is handled at app.ts level - we just signal state changed
      const godState = this.buildGodState();
      playerSteamIds.forEach(steamId => {
        const view = StateSerializer.serializeForPlayer(godState, steamId);
        this.onStateChange!(view, [steamId]);
      });
    }
  }

  /**
   * Set callback for state changes
   */
  setOnStateChange(callback: (state: PlayerView, playerSteamIds: string[]) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set callback for player actions
   */
  setOnPlayerAction(callback: (steamId: string, action: ActionType, amount?: number) => void): void {
    this.onPlayerAction = callback;
  }

  /**
   * Set callback for errors
   */
  setOnError(callback: (steamId: string, code: string, message: string) => void): void {
    this.onError = callback;
  }

  /**
   * Cleanup timers
   */
  destroy(): void {
    this.stopTurnTimer();
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
    }
    console.log(`[Table ${this.tableId}] Destroyed`);
  }
}

