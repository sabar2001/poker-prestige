/**
 * Table State Machine States
 * This enum defines all possible states in the poker table lifecycle
 */
export enum TableState {
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  BUY_IN = 'BUY_IN',
  DEALING = 'DEALING',
  PRE_FLOP = 'PRE_FLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
  PAYOUT = 'PAYOUT',
  BANTER = 'BANTER'
}

/**
 * Card representation
 */
export interface Card {
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
  suit: 'H' | 'D' | 'C' | 'S';
}

/**
 * Player action types
 */
export enum PlayerAction {
  FOLD = 'FOLD',
  CHECK = 'CHECK',
  CALL = 'CALL',
  RAISE = 'RAISE',
  ALL_IN = 'ALL_IN'
}

/**
 * Server-side player state
 * SteamID is the authoritative identifier
 */
export interface IServerPlayer {
  steamId: string;
  chips: number;
  holeCards: Card[];  // Only exists on server
  position: number;
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
}

