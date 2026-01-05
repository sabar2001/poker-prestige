import { Socket } from 'socket.io';

/**
 * PlayerSession - Connection wrapper
 * 
 * Combines Socket + User identity
 * Handles reconnection logic
 */
export interface PlayerSession {
  socket: Socket;
  steamId: string;
  username: string;
  tableId: string | null;
  lastSequenceId: number; // For reconnection
  isConnected: boolean;
  connectedAt: number;
  lastActivityAt: number;
}

/**
 * PlayerSessionManager - Tracks active sessions
 * 
 * Handles:
 * - Session creation on auth
 * - Reconnection matching
 * - Timeout detection
 */
export class PlayerSessionManager {
  private sessions: Map<string, PlayerSession> = new Map();
  private socketToSteamId: Map<string, string> = new Map();

  /**
   * Create a new session
   */
  createSession(
    socket: Socket,
    steamId: string,
    username: string
  ): PlayerSession {
    const session: PlayerSession = {
      socket,
      steamId,
      username,
      tableId: null,
      lastSequenceId: 0,
      isConnected: true,
      connectedAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.sessions.set(steamId, session);
    this.socketToSteamId.set(socket.id, steamId);

    console.log(`[SessionManager] Created session for ${username} (${steamId})`);
    return session;
  }

  /**
   * Get session by Steam ID
   */
  getSession(steamId: string): PlayerSession | undefined {
    return this.sessions.get(steamId);
  }

  /**
   * Get session by socket
   */
  getSessionBySocket(socket: Socket): PlayerSession | undefined {
    const steamId = this.socketToSteamId.get(socket.id);
    if (!steamId) return undefined;
    return this.sessions.get(steamId);
  }

  /**
   * Handle reconnection
   * Returns the existing session if found
   */
  handleReconnect(
    newSocket: Socket,
    steamId: string
  ): PlayerSession | null {
    const existingSession = this.sessions.get(steamId);
    if (!existingSession) {
      return null;
    }

    console.log(`[SessionManager] Reconnecting ${steamId}`);

    // Clean up old socket mapping
    if (existingSession.socket) {
      this.socketToSteamId.delete(existingSession.socket.id);
    }

    // Update session with new socket
    existingSession.socket = newSocket;
    existingSession.isConnected = true;
    existingSession.lastActivityAt = Date.now();

    this.socketToSteamId.set(newSocket.id, steamId);

    return existingSession;
  }

  /**
   * Mark session as disconnected (but keep it for reconnection)
   */
  handleDisconnect(socket: Socket): PlayerSession | undefined {
    const session = this.getSessionBySocket(socket);
    if (!session) return undefined;

    console.log(`[SessionManager] Disconnect: ${session.username} (${session.steamId})`);

    session.isConnected = false;
    session.lastActivityAt = Date.now();

    // Clean up socket mapping
    this.socketToSteamId.delete(socket.id);

    // Keep session for 60 seconds for reconnection
    setTimeout(() => {
      this.cleanupSession(session.steamId);
    }, 60000);

    return session;
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(steamId: string): void {
    const session = this.sessions.get(steamId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * Update last sequence ID (for reconnection)
   */
  updateSequenceId(steamId: string, sequenceId: number): void {
    const session = this.sessions.get(steamId);
    if (session) {
      session.lastSequenceId = sequenceId;
    }
  }

  /**
   * Remove session completely
   */
  removeSession(steamId: string): boolean {
    const session = this.sessions.get(steamId);
    if (!session) return false;

    this.socketToSteamId.delete(session.socket.id);
    this.sessions.delete(steamId);

    console.log(`[SessionManager] Removed session: ${steamId}`);
    return true;
  }

  /**
   * Clean up disconnected sessions that haven't reconnected
   */
  private cleanupSession(steamId: string): void {
    const session = this.sessions.get(steamId);
    if (!session) return;

    // Only cleanup if still disconnected
    if (!session.isConnected) {
      console.log(`[SessionManager] Cleaning up timed-out session: ${steamId}`);
      this.removeSession(steamId);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): PlayerSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isConnected);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get connected count
   */
  getConnectedCount(): number {
    return this.getActiveSessions().length;
  }
}

