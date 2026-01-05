import { Card } from '../types/game.types';

/**
 * Hand Rank enum for comparison
 */
export enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9
}

/**
 * Hand evaluation result
 */
export interface HandResult {
  rank: HandRank;
  description: string;
  value: number; // For tie-breaking
  bestCards: Card[]; // The 5 cards that make the hand
}

/**
 * HandEvaluator - PURE POKER LOGIC (No Sockets, No State)
 * 
 * Evaluates 7 cards (2 hole + 5 community) to find best 5-card poker hand
 * This is the ENGINE layer - pure mathematics
 */
export class HandEvaluator {
  private static readonly RANK_VALUES: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };

  /**
   * Evaluate best 5-card hand from 7 cards
   */
  static evaluateHand(cards: Card[]): HandResult {
    if (cards.length !== 7) {
      throw new Error('Must provide exactly 7 cards for evaluation');
    }

    // Generate all 21 possible 5-card combinations from 7 cards
    const combinations = this.getCombinations(cards, 5);
    let bestHand: HandResult | null = null;

    for (const combo of combinations) {
      const hand = this.evaluate5Cards(combo);
      if (!bestHand || hand.value > bestHand.value) {
        bestHand = hand;
      }
    }

    return bestHand!;
  }

  /**
   * Evaluate a specific 5-card hand
   */
  private static evaluate5Cards(cards: Card[]): HandResult {
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    const rankCounts = this.countOccurrences(ranks);
    const suitCounts = this.countOccurrences(suits);

    const isFlush = Object.values(suitCounts).some(count => count === 5);
    const isStraight = this.checkStraight(ranks);
    const sortedCounts = Object.entries(rankCounts).sort((a, b) => b[1] - a[1]);

    // Royal Flush (A-K-Q-J-10, all same suit)
    if (isFlush && isStraight && ranks.includes('A') && ranks.includes('K')) {
      return {
        rank: HandRank.ROYAL_FLUSH,
        value: 10000000,
        description: 'Royal Flush',
        bestCards: cards
      };
    }

    // Straight Flush
    if (isFlush && isStraight) {
      const value = 9000000 + this.getHighCard(ranks);
      return {
        rank: HandRank.STRAIGHT_FLUSH,
        value,
        description: 'Straight Flush',
        bestCards: cards
      };
    }

    // Four of a Kind
    if (sortedCounts[0][1] === 4) {
      const value = 8000000 + this.RANK_VALUES[sortedCounts[0][0]] * 1000;
      return {
        rank: HandRank.FOUR_OF_A_KIND,
        value,
        description: 'Four of a Kind',
        bestCards: cards
      };
    }

    // Full House (Three of a kind + Pair)
    if (sortedCounts[0][1] === 3 && sortedCounts[1][1] === 2) {
      const value = 7000000 + 
        this.RANK_VALUES[sortedCounts[0][0]] * 1000 + 
        this.RANK_VALUES[sortedCounts[1][0]];
      return {
        rank: HandRank.FULL_HOUSE,
        value,
        description: 'Full House',
        bestCards: cards
      };
    }

    // Flush
    if (isFlush) {
      const value = 6000000 + this.getHighCard(ranks);
      return {
        rank: HandRank.FLUSH,
        value,
        description: 'Flush',
        bestCards: cards
      };
    }

    // Straight
    if (isStraight) {
      const value = 5000000 + this.getHighCard(ranks);
      return {
        rank: HandRank.STRAIGHT,
        value,
        description: 'Straight',
        bestCards: cards
      };
    }

    // Three of a Kind
    if (sortedCounts[0][1] === 3) {
      const value = 4000000 + this.RANK_VALUES[sortedCounts[0][0]] * 1000;
      return {
        rank: HandRank.THREE_OF_A_KIND,
        value,
        description: 'Three of a Kind',
        bestCards: cards
      };
    }

    // Two Pair
    if (sortedCounts[0][1] === 2 && sortedCounts[1][1] === 2) {
      const value = 3000000 + 
        this.RANK_VALUES[sortedCounts[0][0]] * 1000 + 
        this.RANK_VALUES[sortedCounts[1][0]];
      return {
        rank: HandRank.TWO_PAIR,
        value,
        description: 'Two Pair',
        bestCards: cards
      };
    }

    // Pair
    if (sortedCounts[0][1] === 2) {
      const value = 2000000 + this.RANK_VALUES[sortedCounts[0][0]] * 1000;
      return {
        rank: HandRank.PAIR,
        value,
        description: 'Pair',
        bestCards: cards
      };
    }

    // High Card
    const value = 1000000 + this.getHighCard(ranks);
    return {
      rank: HandRank.HIGH_CARD,
      value,
      description: 'High Card',
      bestCards: cards
    };
  }

  /**
   * Check if ranks form a straight
   */
  private static checkStraight(ranks: string[]): boolean {
    const values = ranks.map(r => this.RANK_VALUES[r]).sort((a, b) => a - b);
    
    // Check for regular straight
    let isStraight = true;
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) {
        isStraight = false;
        break;
      }
    }
    
    // Check for A-2-3-4-5 (wheel)
    if (!isStraight && 
        ranks.includes('A') && 
        ranks.includes('2') && 
        ranks.includes('3') && 
        ranks.includes('4') && 
        ranks.includes('5')) {
      return true;
    }
    
    return isStraight;
  }

  /**
   * Get highest card value
   */
  private static getHighCard(ranks: string[]): number {
    return Math.max(...ranks.map(r => this.RANK_VALUES[r]));
  }

  /**
   * Count occurrences of each rank
   */
  private static countOccurrences(arr: string[]): { [key: string]: number } {
    return arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
  }

  /**
   * Generate all combinations of size k from array
   */
  private static getCombinations(arr: Card[], size: number): Card[][] {
    const result: Card[][] = [];
    
    const combine = (start: number, chosen: Card[]) => {
      if (chosen.length === size) {
        result.push([...chosen]);
        return;
      }
      
      for (let i = start; i < arr.length; i++) {
        chosen.push(arr[i]);
        combine(i + 1, chosen);
        chosen.pop();
      }
    };
    
    combine(0, []);
    return result;
  }
}

