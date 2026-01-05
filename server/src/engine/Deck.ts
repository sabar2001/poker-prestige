import { Card } from '../types/game.types';

/**
 * Deck - PURE POKER LOGIC (No Sockets, No State Management)
 * Fisher-Yates shuffle algorithm for cryptographically secure dealing
 * 
 * This is the ENGINE layer - no dependencies on rooms or network
 */
export class Deck {
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
    for (const suit of Deck.SUITS) {
      for (const rank of Deck.RANKS) {
        this.cards.push({ rank, suit });
      }
    }
    this.fisherYatesShuffle();
  }

  /**
   * Fisher-Yates shuffle algorithm
   * Cryptographically secure shuffle for authoritative server
   * 
   * Time Complexity: O(n)
   * Space Complexity: O(1)
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
   * Burn a card (discard from top)
   */
  burn(): void {
    if (this.cards.length === 0) {
      throw new Error('Cannot burn card from empty deck');
    }
    this.cards.shift();
  }

  /**
   * Get remaining card count
   */
  remainingCards(): number {
    return this.cards.length;
  }

  /**
   * Peek at cards without removing (for testing only)
   */
  peek(count: number = 1): Card[] {
    return this.cards.slice(0, count);
  }
}

