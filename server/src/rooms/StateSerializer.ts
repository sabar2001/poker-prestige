import { Card } from '../types/game.types';

/**
 * God State - The complete server-side truth
 * This NEVER gets sent to clients directly
 */
export interface GodState {
  tableId: string;
  sequenceId: number; // For reconnection tracking
  state: string;
  deck: Card[]; // FULL DECK - Never expose
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerPosition: number;
  currentPlayerIndex: number;
  players: Array<{
    steamId: string;
    position: number;
    chips: number;
    holeCards: Card[]; // ALL PLAYERS' CARDS - Server knows everything
    currentBet: number;
    hasFolded: boolean;
    isAllIn: boolean;
    hasActed: boolean;
    handRank?: string; // Calculated at showdown
  }>;
}

/**
 * Sanitized Player View - What ONE specific player sees
 * This is the "Anti-Cheat" filtered version
 */
export interface PlayerView {
  tableId: string;
  sequenceId: number;
  state: string;
  deck: null; // ALWAYS NULL - Clients never see deck
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerPosition: number;
  currentPlayerIndex: number;
  players: Array<{
    steamId: string;
    position: number;
    chips: number;
    holeCards: Card[] | null; // NULL for opponents, visible for self
    currentBet: number;
    hasFolded: boolean;
    isAllIn: boolean;
    hasActed: boolean;
    handRank?: string; // Only shown at showdown
  }>;
}

/**
 * StateSerializer - The "Anti-Cheat" Filter
 * 
 * Critical Security Rule:
 * - God State exists ONLY in TableInstance memory
 * - Players receive ONLY their sanitized PlayerView
 * - Hole cards are stripped for opponents
 * - Deck state is NEVER exposed
 * 
 * This prevents:
 * - Card counting exploits
 * - Memory inspection hacks
 * - Network packet sniffing
 */
export class StateSerializer {
  /**
   * Serialize state for a specific player (hides opponent cards)
   */
  static serializeForPlayer(godState: GodState, targetSteamId: string): PlayerView {
    return {
      tableId: godState.tableId,
      sequenceId: godState.sequenceId,
      state: godState.state,
      deck: null, // ALWAYS NULL
      communityCards: [...godState.communityCards], // Safe to show
      pot: godState.pot,
      currentBet: godState.currentBet,
      dealerPosition: godState.dealerPosition,
      currentPlayerIndex: godState.currentPlayerIndex,
      players: godState.players.map(player => ({
        steamId: player.steamId,
        position: player.position,
        chips: player.chips,
        // CRITICAL: Only show hole cards if this is the target player
        holeCards: player.steamId === targetSteamId ? [...player.holeCards] : null,
        currentBet: player.currentBet,
        hasFolded: player.hasFolded,
        isAllIn: player.isAllIn,
        hasActed: player.hasActed,
        // Hand rank only shown at showdown
        handRank: player.handRank
      }))
    };
  }

  /**
   * Serialize state for showdown (reveal all active players' cards)
   */
  static serializeForShowdown(godState: GodState, activePlayers: string[]): PlayerView {
    return {
      tableId: godState.tableId,
      sequenceId: godState.sequenceId,
      state: godState.state,
      deck: null, // STILL NULL even at showdown
      communityCards: [...godState.communityCards],
      pot: godState.pot,
      currentBet: godState.currentBet,
      dealerPosition: godState.dealerPosition,
      currentPlayerIndex: godState.currentPlayerIndex,
      players: godState.players.map(player => ({
        steamId: player.steamId,
        position: player.position,
        chips: player.chips,
        // Show cards only for active (non-folded) players
        holeCards: activePlayers.includes(player.steamId) ? [...player.holeCards] : null,
        currentBet: player.currentBet,
        hasFolded: player.hasFolded,
        isAllIn: player.isAllIn,
        hasActed: player.hasActed,
        handRank: player.handRank
      }))
    };
  }

  /**
   * Create a state patch (delta) for efficient updates
   * Only sends what changed since last sequenceId
   */
  static createStatePatch(
    oldState: GodState,
    newState: GodState,
    targetSteamId: string
  ): Partial<PlayerView> {
    const patch: any = {
      sequenceId: newState.sequenceId
    };

    // Check what changed
    if (oldState.state !== newState.state) {
      patch.state = newState.state;
    }

    if (oldState.pot !== newState.pot) {
      patch.pot = newState.pot;
    }

    if (oldState.currentBet !== newState.currentBet) {
      patch.currentBet = newState.currentBet;
    }

    if (oldState.currentPlayerIndex !== newState.currentPlayerIndex) {
      patch.currentPlayerIndex = newState.currentPlayerIndex;
    }

    // Community cards changed?
    if (oldState.communityCards.length !== newState.communityCards.length) {
      patch.communityCards = [...newState.communityCards];
    }

    // Player state changes
    const changedPlayers: any[] = [];
    newState.players.forEach((newPlayer, index) => {
      const oldPlayer = oldState.players[index];
      if (!oldPlayer) return;

      const playerChanges: any = {};
      let hasChanges = false;

      if (oldPlayer.chips !== newPlayer.chips) {
        playerChanges.chips = newPlayer.chips;
        hasChanges = true;
      }

      if (oldPlayer.currentBet !== newPlayer.currentBet) {
        playerChanges.currentBet = newPlayer.currentBet;
        hasChanges = true;
      }

      if (oldPlayer.hasFolded !== newPlayer.hasFolded) {
        playerChanges.hasFolded = newPlayer.hasFolded;
        hasChanges = true;
      }

      if (oldPlayer.hasActed !== newPlayer.hasActed) {
        playerChanges.hasActed = newPlayer.hasActed;
        hasChanges = true;
      }

      if (hasChanges) {
        changedPlayers.push({
          steamId: newPlayer.steamId,
          ...playerChanges
        });
      }
    });

    if (changedPlayers.length > 0) {
      patch.playerUpdates = changedPlayers;
    }

    return patch;
  }

  /**
   * Validate that a state is properly sanitized (for testing)
   */
  static validateSanitized(view: PlayerView, viewerSteamId: string): boolean {
    // Deck must be null
    if (view.deck !== null) {
      return false;
    }

    // Check that opponent cards are hidden
    for (const player of view.players) {
      if (player.steamId !== viewerSteamId && player.holeCards !== null && !player.hasFolded) {
        // Only allowed if it's showdown or player has folded
        if (view.state !== 'SHOWDOWN_REVEAL') {
          return false;
        }
      }
    }

    return true;
  }
}

