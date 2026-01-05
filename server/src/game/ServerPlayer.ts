import { Card, IServerPlayer, PlayerAction } from '../types/game.types';

/**
 * ServerPlayer - Authoritative player state
 * Cards are NEVER sent directly to clients
 */
export class ServerPlayer implements IServerPlayer {
  steamId: string;
  chips: number;
  holeCards: Card[] = [];
  position: number;
  currentBet: number = 0;
  hasFolded: boolean = false;
  isAllIn: boolean = false;
  hasActed: boolean = false;

  constructor(steamId: string, chips: number, position: number) {
    this.steamId = steamId;
    this.chips = chips;
    this.position = position;
  }

  /**
   * Place a bet - server authoritative
   */
  placeBet(amount: number): boolean {
    if (amount > this.chips) {
      return false;
    }
    this.chips -= amount;
    this.currentBet += amount;
    if (this.chips === 0) {
      this.isAllIn = true;
    }
    this.hasActed = true;
    return true;
  }

  /**
   * Player folds
   */
  fold(): void {
    this.hasFolded = true;
    this.hasActed = true;
  }

  /**
   * Reset for new hand
   */
  resetForNewHand(): void {
    this.holeCards = [];
    this.currentBet = 0;
    this.hasFolded = false;
    this.isAllIn = false;
    this.hasActed = false;
  }

  /**
   * Get public state (NO HOLE CARDS)
   */
  getPublicState() {
    return {
      steamId: this.steamId,
      chips: this.chips,
      position: this.position,
      currentBet: this.currentBet,
      hasFolded: this.hasFolded,
      isAllIn: this.isAllIn,
      hasActed: this.hasActed
    };
  }
}

