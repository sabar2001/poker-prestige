import { v4 as uuidv4 } from 'uuid';
import { TableState, Card, PlayerAction } from '../types/game.types';
import { ServerPlayer } from './ServerPlayer';
import { ServerDeck } from './ServerDeck';

/**
 * TableManager - Authoritative state machine for a poker table
 * 
 * State Flow:
 * WAITING_FOR_PLAYERS -> BUY_IN -> DEALING -> PRE_FLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN -> PAYOUT -> BANTER -> (loop)
 */
export class TableManager {
  public readonly tableId: string;
  private state: TableState;
  private players: Map<string, ServerPlayer> = new Map();
  private deck: ServerDeck;
  private communityCards: Card[] = [];
  private pot: number = 0;
  private currentBet: number = 0;
  private dealerPosition: number = 0;
  private currentPlayerIndex: number = 0;
  private smallBlind: number;
  private bigBlind: number;

  // Configuration
  private readonly minPlayers: number = 2;
  private readonly maxPlayers: number = 6;

  constructor(tableId: string = uuidv4(), smallBlind: number = 10, bigBlind: number = 20) {
    this.tableId = tableId;
    this.state = TableState.WAITING_FOR_PLAYERS;
    this.deck = new ServerDeck();
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
  }

  /**
   * Get current state
   */
  getState(): TableState {
    return this.state;
  }

  /**
   * Add player to table
   */
  addPlayer(steamId: string, buyInChips: number): boolean {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }

    if (this.state !== TableState.WAITING_FOR_PLAYERS && this.state !== TableState.BUY_IN) {
      return false;
    }

    const position = this.players.size;
    const player = new ServerPlayer(steamId, buyInChips, position);
    this.players.set(steamId, player);

    // Transition to BUY_IN if we have enough players
    if (this.players.size >= this.minPlayers && this.state === TableState.WAITING_FOR_PLAYERS) {
      this.transitionTo(TableState.BUY_IN);
    }

    return true;
  }

  /**
   * Remove player from table
   */
  removePlayer(steamId: string): boolean {
    return this.players.delete(steamId);
  }

  /**
   * Start a new hand
   */
  startHand(): void {
    if (this.state !== TableState.BUY_IN) {
      throw new Error('Cannot start hand from state: ' + this.state);
    }

    // Reset all players
    this.players.forEach(player => player.resetForNewHand());

    // Reset table state
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = this.bigBlind;
    this.deck.reset();

    // Transition to dealing
    this.transitionTo(TableState.DEALING);
  }

  /**
   * Deal hole cards to all players
   */
  dealHoleCards(): void {
    if (this.state !== TableState.DEALING) {
      throw new Error('Cannot deal cards from state: ' + this.state);
    }

    // Deal 2 cards to each player
    this.players.forEach(player => {
      if (!player.hasFolded) {
        player.holeCards = this.deck.deal(2);
      }
    });

    // Post blinds
    this.postBlinds();

    // Move to PRE_FLOP
    this.transitionTo(TableState.PRE_FLOP);
  }

  /**
   * Post small and big blinds
   */
  private postBlinds(): void {
    const playerArray = Array.from(this.players.values());
    const sbIndex = (this.dealerPosition + 1) % playerArray.length;
    const bbIndex = (this.dealerPosition + 2) % playerArray.length;

    playerArray[sbIndex].placeBet(this.smallBlind);
    playerArray[bbIndex].placeBet(this.bigBlind);
    
    this.pot = this.smallBlind + this.bigBlind;
    this.currentPlayerIndex = (this.dealerPosition + 3) % playerArray.length;
  }

  /**
   * Deal the flop (3 community cards)
   */
  dealFlop(): void {
    if (this.state !== TableState.PRE_FLOP) {
      throw new Error('Cannot deal flop from state: ' + this.state);
    }

    this.deck.burn();
    this.communityCards.push(...this.deck.deal(3));
    this.currentBet = 0;
    this.transitionTo(TableState.FLOP);
  }

  /**
   * Deal the turn (4th community card)
   */
  dealTurn(): void {
    if (this.state !== TableState.FLOP) {
      throw new Error('Cannot deal turn from state: ' + this.state);
    }

    this.deck.burn();
    this.communityCards.push(...this.deck.deal(1));
    this.currentBet = 0;
    this.transitionTo(TableState.TURN);
  }

  /**
   * Deal the river (5th community card)
   */
  dealRiver(): void {
    if (this.state !== TableState.TURN) {
      throw new Error('Cannot deal river from state: ' + this.state);
    }

    this.deck.burn();
    this.communityCards.push(...this.deck.deal(1));
    this.currentBet = 0;
    this.transitionTo(TableState.RIVER);
  }

  /**
   * Handle player action
   */
  handlePlayerAction(steamId: string, action: PlayerAction, amount?: number): boolean {
    const player = this.players.get(steamId);
    if (!player) {
      return false;
    }

    // Validate it's this player's turn
    const currentPlayer = Array.from(this.players.values())[this.currentPlayerIndex];
    if (currentPlayer.steamId !== steamId) {
      return false;
    }

    switch (action) {
      case PlayerAction.FOLD:
        player.fold();
        break;
      case PlayerAction.CHECK:
        if (player.currentBet < this.currentBet) {
          return false; // Cannot check with a bet to call
        }
        player.hasActed = true;
        break;
      case PlayerAction.CALL:
        const callAmount = this.currentBet - player.currentBet;
        if (!player.placeBet(callAmount)) {
          return false;
        }
        this.pot += callAmount;
        break;
      case PlayerAction.RAISE:
        if (!amount || amount <= this.currentBet) {
          return false;
        }
        const raiseAmount = amount - player.currentBet;
        if (!player.placeBet(raiseAmount)) {
          return false;
        }
        this.pot += raiseAmount;
        this.currentBet = amount;
        break;
      case PlayerAction.ALL_IN:
        const allInAmount = player.chips;
        player.placeBet(allInAmount);
        this.pot += allInAmount;
        if (player.currentBet > this.currentBet) {
          this.currentBet = player.currentBet;
        }
        break;
    }

    this.advanceTurn();
    return true;
  }

  /**
   * Advance to next player
   */
  private advanceTurn(): void {
    const playerArray = Array.from(this.players.values());
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % playerArray.length;
    } while (
      playerArray[this.currentPlayerIndex].hasFolded || 
      playerArray[this.currentPlayerIndex].isAllIn
    );
  }

  /**
   * Check if betting round is complete
   */
  isRoundComplete(): boolean {
    const activePlayers = Array.from(this.players.values()).filter(
      p => !p.hasFolded && !p.isAllIn
    );

    if (activePlayers.length === 0) {
      return true;
    }

    return activePlayers.every(p => p.hasActed && p.currentBet === this.currentBet);
  }

  /**
   * Transition to next stage
   */
  advanceStage(): void {
    // Reset player actions
    this.players.forEach(p => p.hasActed = false);

    switch (this.state) {
      case TableState.PRE_FLOP:
        this.dealFlop();
        break;
      case TableState.FLOP:
        this.dealTurn();
        break;
      case TableState.TURN:
        this.dealRiver();
        break;
      case TableState.RIVER:
        this.transitionTo(TableState.SHOWDOWN);
        break;
    }
  }

  /**
   * State transition
   */
  private transitionTo(newState: TableState): void {
    console.log(`[Table ${this.tableId}] State: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  /**
   * Get public table state (NO HOLE CARDS)
   */
  getPublicState() {
    return {
      tableId: this.tableId,
      state: this.state,
      players: Array.from(this.players.values()).map(p => p.getPublicState()),
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      dealerPosition: this.dealerPosition,
      currentPlayerIndex: this.currentPlayerIndex
    };
  }

  /**
   * Get player's hole cards (for sending HIDDEN_CARD events)
   */
  getPlayerHoleCards(steamId: string): Card[] | null {
    const player = this.players.get(steamId);
    return player ? player.holeCards : null;
  }
}

