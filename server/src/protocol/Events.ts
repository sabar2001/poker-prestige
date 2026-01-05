/**
 * Protocol Events - Enum constants for type safety
 * 
 * Naming Convention:
 * - REQ_* : Client → Server requests
 * - GAME_* : Server → Client game state broadcasts
 * - SOCIAL_* : High-frequency social/vibe updates
 */

export enum ClientEvent {
  // Authentication & Connection
  REQ_JOIN = 'REQ_JOIN',
  REQ_RECONNECT = 'REQ_RECONNECT',
  REQ_LEAVE = 'REQ_LEAVE',

  // Table Actions
  REQ_SIT = 'REQ_SIT',
  REQ_STAND = 'REQ_STAND',
  REQ_READY = 'REQ_READY',

  // Game Actions (Critical, Low Frequency)
  REQ_ACTION = 'REQ_ACTION',
  REQ_SHOW_CARDS = 'REQ_SHOW_CARDS',

  // Social Actions (High Frequency)
  REQ_SOCIAL = 'REQ_SOCIAL',
  REQ_EMOTE = 'REQ_EMOTE',
  REQ_VOICE = 'REQ_VOICE'
}

export enum ServerEvent {
  // Connection Responses
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  RECONNECT_SUCCESS = 'RECONNECT_SUCCESS',

  // State Synchronization
  GAME_SNAPSHOT = 'GAME_SNAPSHOT',      // Full state (on join/reconnect)
  STATE_PATCH = 'STATE_PATCH',          // Delta update (efficient)

  // Game Events (Reliable, Low Frequency)
  HOLE_CARDS = 'HOLE_CARDS',            // Private: Your cards
  COMMUNITY_CARDS = 'COMMUNITY_CARDS',  // Public: Flop/Turn/River
  PLAYER_ACTION = 'PLAYER_ACTION',      // Broadcast: Someone folded/bet
  TURN_CHANGE = 'TURN_CHANGE',          // Whose turn it is
  HAND_RESULT = 'HAND_RESULT',          // Showdown results
  POT_UPDATE = 'POT_UPDATE',            // Pot changed

  // Social Events (Throttled, 10hz)
  SOCIAL_TICK = 'SOCIAL_TICK',          // Bulk social updates
  EMOTE_BROADCAST = 'EMOTE_BROADCAST',  // Player emote
  VOICE_ACTIVITY = 'VOICE_ACTIVITY',    // Voice indicator

  // Errors
  ERROR = 'ERROR'
}

/**
 * Action types for REQ_ACTION
 */
export enum ActionType {
  FOLD = 'FOLD',
  CHECK = 'CHECK',
  CALL = 'CALL',
  RAISE = 'RAISE',
  ALL_IN = 'ALL_IN'
}

/**
 * Social action types for REQ_SOCIAL
 */
export enum SocialActionType {
  LOOK_AT = 'LOOK_AT',         // Head tracking: looking at seat N
  LOOK_AWAY = 'LOOK_AWAY',     // Not looking at anyone
  LEAN_FORWARD = 'LEAN_FORWARD', // Body language
  LEAN_BACK = 'LEAN_BACK'
}

/**
 * Error codes
 */
export enum ErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_TICKET = 'INVALID_TICKET',
  TABLE_FULL = 'TABLE_FULL',
  SEAT_TAKEN = 'SEAT_TAKEN',
  INVALID_ACTION = 'INVALID_ACTION',
  NOT_YOUR_TURN = 'NOT_YOUR_TURN',
  INSUFFICIENT_CHIPS = 'INSUFFICIENT_CHIPS',
  ALREADY_IN_TABLE = 'ALREADY_IN_TABLE',
  TABLE_NOT_FOUND = 'TABLE_NOT_FOUND'
}

