import { Card } from '../types/game.types';
import { ActionType, SocialActionType, ErrorCode } from './Events';

/**
 * Payload type definitions for all protocol messages
 * 
 * These match the ARCHITECTURE.md protocol specification
 */

// ==================== CLIENT → SERVER ====================

export interface ReqJoinPayload {
  steamTicket: string;  // Auth ticket from ISteamUser::GetAuthSessionTicket()
  tableId: string;
}

export interface ReqReconnectPayload {
  steamTicket: string;
  tableId: string;
  lastSequenceId: number; // Last packet they received
}

export interface ReqSitPayload {
  seatIndex: number;  // 0-5 for 6-max table
  buyIn: number;      // Chip amount
}

export interface ReqActionPayload {
  type: ActionType;
  amount?: number;    // Required for RAISE
}

export interface ReqSocialPayload {
  type: SocialActionType;
  targetSeat?: number;  // For LOOK_AT
}

export interface ReqShowCardsPayload {
  // Player wants to reveal mucked cards during banter phase
}

// ==================== SERVER → CLIENT ====================

export interface AuthSuccessPayload {
  steamId: string;
  username: string;
  sessionToken: string;
  chips: number;
}

export interface AuthFailurePayload {
  code: ErrorCode;
  message: string;
}

export interface ReconnectSuccessPayload {
  steamId: string;
  missedSequenceIds: number[]; // Packets they need to catch up
}

/**
 * GAME_SNAPSHOT - Full state sent on join/reconnect
 * This is the sanitized PlayerView (see StateSerializer)
 */
export interface GameSnapshotPayload {
  tableId: string;
  sequenceId: number;
  state: string;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerPosition: number;
  currentPlayerIndex: number;
  players: Array<{
    steamId: string;
    username?: string;
    position: number;
    chips: number;
    holeCards: Card[] | null; // Null for opponents
    currentBet: number;
    hasFolded: boolean;
    isAllIn: boolean;
    hasActed: boolean;
  }>;
}

/**
 * STATE_PATCH - Efficient delta update
 * Only includes what changed
 */
export interface StatePatchPayload {
  sequenceId: number;
  state?: string;
  pot?: number;
  currentBet?: number;
  currentPlayerIndex?: number;
  communityCards?: Card[];
  playerUpdates?: Array<{
    steamId: string;
    chips?: number;
    currentBet?: number;
    hasFolded?: boolean;
    hasActed?: boolean;
  }>;
}

/**
 * HOLE_CARDS - Private card reveal
 * Sent ONLY to specific player
 */
export interface HoleCardsPayload {
  cards: Card[];
}

/**
 * COMMUNITY_CARDS - Public board cards
 * Broadcast to all players
 */
export interface CommunityCardsPayload {
  cards: Card[];
  stage: 'FLOP' | 'TURN' | 'RIVER';
}

/**
 * PLAYER_ACTION - Broadcast someone's action
 */
export interface PlayerActionPayload {
  steamId: string;
  action: ActionType;
  amount?: number;
  newPot: number;
}

/**
 * TURN_CHANGE - Whose turn it is
 */
export interface TurnChangePayload {
  steamId: string;
  timeoutMs: number; // How long they have to act
}

/**
 * HAND_RESULT - Showdown results
 */
export interface HandResultPayload {
  winners: Array<{
    steamId: string;
    cards: Card[];
    handRank: string;
    winAmount: number;
  }>;
  pots: Array<{
    amount: number;
    eligiblePlayers: string[];
  }>;
}

/**
 * POT_UPDATE - Simple pot change
 */
export interface PotUpdatePayload {
  pot: number;
  lastAction?: {
    steamId: string;
    action: ActionType;
    amount?: number;
  };
}

/**
 * SOCIAL_TICK - Bulk social updates (10hz)
 * Batches multiple social actions into one packet
 */
export interface SocialTickPayload {
  updates: Array<{
    steamId: string;
    type: SocialActionType;
    targetSeat?: number;
    timestamp: number;
  }>;
}

/**
 * EMOTE_BROADCAST - Player used an emote
 */
export interface EmoteBroadcastPayload {
  steamId: string;
  emoteId: string;
}

/**
 * VOICE_ACTIVITY - Voice indicator
 */
export interface VoiceActivityPayload {
  steamId: string;
  isSpeaking: boolean;
}

/**
 * ERROR - Error message
 */
export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

