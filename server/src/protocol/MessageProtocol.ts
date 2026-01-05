import { Socket } from 'socket.io';
import { Card } from '../types/game.types';

/**
 * MessageProtocol - Handles card visibility rules
 * 
 * Key Rule: HIDDEN_CARD events go only to specific players
 *           PUBLIC_BOARD_CARD events go to everyone
 */
export class MessageProtocol {
  /**
   * Send hole cards to a specific player (HIDDEN)
   * Only the owner sees their cards
   */
  static sendHiddenCards(socket: Socket, steamId: string, cards: Card[]): void {
    socket.emit('HIDDEN_CARD', {
      steamId,
      cards
    });
  }

  /**
   * Send public board cards to all players
   * Everyone sees community cards
   */
  static sendPublicBoardCards(io: any, tableId: string, cards: Card[], stage: string): void {
    io.to(tableId).emit('PUBLIC_BOARD_CARD', {
      cards,
      stage
    });
  }

  /**
   * Send table state update (no hidden cards)
   */
  static sendTableState(io: any, tableId: string, state: any): void {
    io.to(tableId).emit('TABLE_STATE_UPDATE', state);
  }

  /**
   * Send player action broadcast
   */
  static sendPlayerAction(io: any, tableId: string, action: any): void {
    io.to(tableId).emit('PLAYER_ACTION', action);
  }

  /**
   * Send turn notification
   */
  static sendTurnNotification(io: any, tableId: string, steamId: string, timeoutMs: number): void {
    io.to(tableId).emit('PLAYER_TURN', {
      steamId,
      timeoutMs
    });
  }

  /**
   * Send error to specific player
   */
  static sendError(socket: Socket, code: string, message: string): void {
    socket.emit('ERROR', {
      code,
      message
    });
  }
}

