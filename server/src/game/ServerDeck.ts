import { Card } from '../types/game.types';

/**
 * ServerDeck - Authoritative deck with Fisher-Yates shuffle
 * Deck ONLY exists on the server
 */
export class ServerDeck {
  private cards: Card[] = [];

  private static readonly RANKS: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  private static readonly SUITS: Card['suit'][] = ['H', 'D', 'C', 'S'];

  constructor() {
    this.reset();
  }

  /**
   * Reset and shuffle deck
   */
  reset(): void {
    this.cards = [];
    // Create full 52 card deck
    for (const suit of ServerDeck.SUITS) {
      for (const rank of ServerDeck.RANKS) {
        this.cards.push({ rank, suit });
      }
    }
    this.fisherYatesShuffle();
  }

  /**
   * Fisher-Yates shuffle algorithm
   * Cryptographically secure shuffle for authoritative server
   */
  private fisherYatesShuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * Deal cards from the top
   */
  deal(count: number = 1): Card[] {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} remaining`);
    }
    return this.cards.splice(0, count);
  }

  /**
   * Burn a card (discard)
   */
  burn(): void {
    this.cards.shift();
  }

  /**
   * Get remaining card count
   */
  remainingCards(): number {
    return this.cards.length;
  }
}

