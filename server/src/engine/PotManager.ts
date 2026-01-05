/**
 * PotManager - PURE POKER LOGIC (No Sockets, No State)
 * 
 * Handles main pot and side pot calculations when players are all-in
 * This is the ENGINE layer - pure mathematics
 */

export interface PotContribution {
  playerId: string;
  amount: number;
}

export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // PlayerIds who can win this pot
  isMainPot: boolean;
}

/**
 * PotManager calculates pot distribution for complex all-in scenarios
 * 
 * Example:
 *   P1 bets 100 (all-in)
 *   P2 bets 200 (all-in)
 *   P3 bets 300
 * 
 * Result:
 *   Main Pot: 300 (100×3) - All players eligible
 *   Side Pot 1: 200 (100×2) - P2 and P3 eligible
 *   Side Pot 2: 100 (100×1) - P3 only eligible
 */
export class PotManager {
  private contributions: Map<string, number> = new Map();

  /**
   * Record a player's contribution to the pot
   */
  addContribution(playerId: string, amount: number): void {
    const current = this.contributions.get(playerId) || 0;
    this.contributions.set(playerId, current + amount);
  }

  /**
   * Calculate all pots (main + side pots)
   * Returns array of pots sorted by size (main pot first)
   */
  calculatePots(activePlayers: string[]): Pot[] {
    if (this.contributions.size === 0) {
      return [];
    }

    const pots: Pot[] = [];
    const contributions = Array.from(this.contributions.entries())
      .filter(([playerId]) => activePlayers.includes(playerId))
      .sort((a, b) => a[1] - b[1]); // Sort by contribution amount

    let remainingContributions = new Map(contributions);
    let previousLevel = 0;

    // Process each contribution level
    for (let i = 0; i < contributions.length; i++) {
      const [currentPlayerId, currentAmount] = contributions[i];
      
      if (currentAmount <= previousLevel) {
        continue;
      }

      const levelDiff = currentAmount - previousLevel;
      let potAmount = 0;
      const eligiblePlayers: string[] = [];

      // All players who contributed at least this much are eligible
      remainingContributions.forEach((amount, playerId) => {
        if (amount >= currentAmount) {
          eligiblePlayers.push(playerId);
          potAmount += levelDiff;
        }
      });

      if (potAmount > 0) {
        pots.push({
          amount: potAmount,
          eligiblePlayers,
          isMainPot: pots.length === 0
        });
      }

      previousLevel = currentAmount;
    }

    return pots;
  }

  /**
   * Simple pot total (when no side pots needed)
   */
  getTotalPot(): number {
    let total = 0;
    this.contributions.forEach(amount => {
      total += amount;
    });
    return total;
  }

  /**
   * Get a player's total contribution
   */
  getPlayerContribution(playerId: string): number {
    return this.contributions.get(playerId) || 0;
  }

  /**
   * Reset all contributions (for new hand)
   */
  reset(): void {
    this.contributions.clear();
  }

  /**
   * Distribute pots to winners
   * Returns map of playerId -> winnings
   */
  distributePots(pots: Pot[], winners: Map<string, number>): Map<string, number> {
    const payouts = new Map<string, number>();

    for (const pot of pots) {
      // Find eligible winners for this pot
      const eligibleWinners = Array.from(winners.entries())
        .filter(([playerId]) => pot.eligiblePlayers.includes(playerId))
        .sort((a, b) => b[1] - a[1]); // Sort by hand strength

      if (eligibleWinners.length === 0) {
        continue;
      }

      // Check for ties (same hand strength)
      const topHandValue = eligibleWinners[0][1];
      const tiedWinners = eligibleWinners.filter(([, value]) => value === topHandValue);

      // Split pot among tied winners
      const splitAmount = Math.floor(pot.amount / tiedWinners.length);
      const remainder = pot.amount % tiedWinners.length;

      tiedWinners.forEach(([playerId], index) => {
        const current = payouts.get(playerId) || 0;
        // First winner gets remainder (for odd chip)
        const payout = splitAmount + (index === 0 ? remainder : 0);
        payouts.set(playerId, current + payout);
      });
    }

    return payouts;
  }
}

