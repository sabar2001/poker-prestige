import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config, validateConfig } from './config';
import { initSteamService, getSteamService } from './services/SteamService';
import { PlayerSessionManager } from './rooms/PlayerSession';
import { getTableManager } from './rooms/TableManager';
import { ClientEvent, ServerEvent, ActionType, SocialActionType, ErrorCode } from './protocol/Events';
import {
  ReqJoinPayload,
  ReqReconnectPayload,
  ReqSitPayload,
  ReqActionPayload,
  ReqSocialPayload,
  AuthSuccessPayload,
  AuthFailurePayload,
  GameSnapshotPayload
} from './protocol/Payloads';

/**
 * Poker Prestige Server - Entry Point
 * 
 * Implements:
 * - Express + Socket.io setup
 * - Steam authentication flow
 * - Event routing to TableInstance
 * - Reconnection handling
 * - Social event throttling
 */

// Validate configuration
validateConfig();

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Configure appropriately for production
    methods: ['GET', 'POST']
  }
});

// Initialize services
const steamService = initSteamService(config.steamApiKey, config.steamAppId);
const sessionManager = new PlayerSessionManager();
const tableManager = getTableManager();

// Attach Socket.io to TableManager (for callbacks)
tableManager.setIO(io);

// Social event throttling (10hz = 100ms)
const socialTickRate = 1000 / config.socialTickRate;
const socialBuffers = new Map<string, any[]>(); // tableId -> events[]

// Setup social tick broadcast
setInterval(() => {
  socialBuffers.forEach((events, tableId) => {
    if (events.length > 0) {
      io.to(tableId).emit(ServerEvent.SOCIAL_TICK, {
        updates: events,
        timestamp: Date.now()
      });
      socialBuffers.set(tableId, []); // Clear buffer
    }
  });
}, socialTickRate);

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tables: tableManager.getTableCount(),
    players: tableManager.getTotalPlayerCount(),
    timestamp: Date.now()
  });
});

/**
 * List tables endpoint (for lobby)
 */
app.get('/tables', (req, res) => {
  const tables = tableManager.listTables();
  res.json({ tables });
});

/**
 * Socket.io Connection Handler
 */
io.on('connection', (socket: Socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  let currentSteamId: string | null = null;
  let currentTableId: string | null = null;

  /**
   * REQ_JOIN - Join a table with Steam authentication
   */
  socket.on(ClientEvent.REQ_JOIN, async (data: ReqJoinPayload) => {
    try {
      const { steamTicket, tableId } = data;

      // Validate Steam ticket
      const authResult = await steamService.validateAuthTicket(steamTicket);
      
      if (!authResult.success) {
        const failurePayload: AuthFailurePayload = {
          code: ErrorCode.INVALID_TICKET,
          message: authResult.error || 'Invalid Steam ticket'
        };
        socket.emit(ServerEvent.AUTH_FAILURE, failurePayload);
        return;
      }

      const { steamId, username } = authResult;
      if (!steamId || !username) {
        const failurePayload: AuthFailurePayload = {
          code: ErrorCode.AUTH_FAILED,
          message: 'Authentication failed'
        };
        socket.emit(ServerEvent.AUTH_FAILURE, failurePayload);
        return;
      }

      // Create session
      const session = sessionManager.createSession(socket, steamId, username);
      currentSteamId = steamId;

      // Store steamId on socket for easy lookup
      (socket as any).steamId = steamId;

      // Get or create table
      let table = tableManager.getTable(tableId);
      if (!table) {
        table = tableManager.createTable({ tableId });
      }

      // Join socket room
      socket.join(tableId);
      currentTableId = tableId;
      session.tableId = tableId;

      console.log(`[Server] ${username} (${steamId}) joined table ${tableId}`);

      // Send auth success
      const successPayload: AuthSuccessPayload = {
        steamId,
        username,
        sessionToken: `token_${steamId}_${Date.now()}`,
        chips: config.defaultBuyIn
      };
      socket.emit(ServerEvent.AUTH_SUCCESS, successPayload);

      // Send initial game snapshot
      const snapshot = table.getPlayerView(steamId);
      socket.emit(ServerEvent.GAME_SNAPSHOT, snapshot);

    } catch (error: any) {
      console.error('[Server] REQ_JOIN error:', error);
      const failurePayload: AuthFailurePayload = {
        code: ErrorCode.AUTH_FAILED,
        message: error.message || 'Join failed'
      };
      socket.emit(ServerEvent.AUTH_FAILURE, failurePayload);
    }
  });

  /**
   * REQ_RECONNECT - Reconnect to existing session
   */
  socket.on(ClientEvent.REQ_RECONNECT, async (data: ReqReconnectPayload) => {
    try {
      const { steamTicket, tableId, lastSequenceId } = data;

      // Validate Steam ticket
      const authResult = await steamService.validateAuthTicket(steamTicket);
      
      if (!authResult.success || !authResult.steamId) {
        const failurePayload: AuthFailurePayload = {
          code: ErrorCode.INVALID_TICKET,
          message: 'Invalid Steam ticket'
        };
        socket.emit(ServerEvent.AUTH_FAILURE, failurePayload);
        return;
      }

      const steamId = authResult.steamId;

      // Find existing table
      const table = tableManager.getTable(tableId);
      if (!table) {
        const failurePayload: AuthFailurePayload = {
          code: ErrorCode.TABLE_NOT_FOUND,
          message: 'Table not found'
        };
        socket.emit(ServerEvent.AUTH_FAILURE, failurePayload);
        return;
      }

      // Reconnect session
      const existingSession = sessionManager.handleReconnect(socket, steamId);
      
      if (existingSession) {
        currentSteamId = steamId;
        currentTableId = tableId;
        (socket as any).steamId = steamId;
        
        socket.join(tableId);
        
        console.log(`[Server] ${steamId} reconnected to table ${tableId} (last seq: ${lastSequenceId})`);

        // Send reconnect success
        socket.emit(ServerEvent.RECONNECT_SUCCESS, {
          steamId,
          missedSequenceIds: [] // TODO: Implement sequence tracking
        });

        // Send full game snapshot
        const snapshot = table.getPlayerView(steamId);
        socket.emit(ServerEvent.GAME_SNAPSHOT, snapshot);
      } else {
        // No existing session, treat as new join
        socket.emit(ServerEvent.AUTH_FAILURE, {
          code: ErrorCode.AUTH_FAILED,
          message: 'Session not found'
        });
      }

    } catch (error: any) {
      console.error('[Server] REQ_RECONNECT error:', error);
      socket.emit(ServerEvent.AUTH_FAILURE, {
        code: ErrorCode.AUTH_FAILED,
        message: 'Reconnection failed'
      });
    }
  });

  /**
   * REQ_SIT - Sit at a specific seat
   */
  socket.on(ClientEvent.REQ_SIT, (data: ReqSitPayload) => {
    if (!currentSteamId || !currentTableId) {
      socket.emit(ServerEvent.ERROR, {
        code: ErrorCode.AUTH_FAILED,
        message: 'Not authenticated'
      });
      return;
    }

    const { seatIndex, buyIn } = data;
    const session = sessionManager.getSession(currentSteamId);
    
    if (!session) {
      socket.emit(ServerEvent.ERROR, {
        code: ErrorCode.AUTH_FAILED,
        message: 'Session not found'
      });
      return;
    }

    // Add player to table
    const success = tableManager.addPlayerToTable(
      currentTableId,
      currentSteamId,
      session.username,
      seatIndex,
      buyIn
    );

    if (!success) {
      socket.emit(ServerEvent.ERROR, {
        code: ErrorCode.SEAT_TAKEN,
        message: 'Could not sit at table'
      });
      return;
    }

    // Broadcast will happen via TableInstance callback
    console.log(`[Server] ${session.username} sat at seat ${seatIndex}`);
  });

  /**
   * REQ_READY - Mark player as ready
   */
  socket.on(ClientEvent.REQ_READY, () => {
    if (!currentSteamId || !currentTableId) return;

    const table = tableManager.getTable(currentTableId);
    if (!table) return;

    table.setPlayerReady(currentSteamId);
    console.log(`[Server] ${currentSteamId} is ready`);
  });

  /**
   * REQ_ACTION - Handle game action
   */
  socket.on(ClientEvent.REQ_ACTION, (data: ReqActionPayload) => {
    if (!currentSteamId || !currentTableId) {
      socket.emit(ServerEvent.ERROR, {
        code: ErrorCode.AUTH_FAILED,
        message: 'Not authenticated'
      });
      return;
    }

    const table = tableManager.getTable(currentTableId);
    if (!table) {
      socket.emit(ServerEvent.ERROR, {
        code: ErrorCode.TABLE_NOT_FOUND,
        message: 'Table not found'
      });
      return;
    }

    const { type, amount } = data;
    
    // Handle action
    const success = table.handlePlayerAction(currentSteamId, type, amount);
    
    if (!success) {
      // Error already sent via table callback
      console.log(`[Server] Invalid action from ${currentSteamId}: ${type}`);
    } else {
      console.log(`[Server] ${currentSteamId} action: ${type}${amount ? ` ${amount}` : ''}`);
    }

    // Update session activity
    sessionManager.updateActivity(currentSteamId);
  });

  /**
   * REQ_SOCIAL - Handle social action (throttled)
   */
  socket.on(ClientEvent.REQ_SOCIAL, (data: ReqSocialPayload) => {
    if (!currentSteamId || !currentTableId) return;

    const table = tableManager.getTable(currentTableId);
    if (!table) return;

    // Buffer social event for batched broadcast
    if (!socialBuffers.has(currentTableId)) {
      socialBuffers.set(currentTableId, []);
    }

    const buffer = socialBuffers.get(currentTableId)!;
    buffer.push({
      steamId: currentSteamId,
      type: data.type,
      targetSeat: data.targetSeat,
      timestamp: Date.now()
    });

    // Also call table handler (for logging)
    table.handleSocial(currentSteamId, data);

    // Update activity
    sessionManager.updateActivity(currentSteamId);
  });

  /**
   * REQ_EMOTE - Broadcast emote
   */
  socket.on(ClientEvent.REQ_EMOTE, (data: { emoteId: string }) => {
    if (!currentSteamId || !currentTableId) return;

    io.to(currentTableId).emit(ServerEvent.EMOTE_BROADCAST, {
      steamId: currentSteamId,
      emoteId: data.emoteId,
      timestamp: Date.now()
    });

    console.log(`[Server] ${currentSteamId} used emote: ${data.emoteId}`);
  });

  /**
   * REQ_SHOW_CARDS - Show mucked cards (during banter)
   */
  socket.on(ClientEvent.REQ_SHOW_CARDS, () => {
    if (!currentSteamId || !currentTableId) return;

    const table = tableManager.getTable(currentTableId);
    if (!table) return;

    // Get player's hole cards (only works in banter phase)
    const snapshot = table.getPlayerView(currentSteamId);
    
    // Broadcast to table (for now, just log)
    console.log(`[Server] ${currentSteamId} showed mucked cards`);
    
    // TODO: Implement show cards logic
  });

  /**
   * REQ_LEAVE - Leave table
   */
  socket.on(ClientEvent.REQ_LEAVE, () => {
    if (!currentSteamId) return;

    handlePlayerLeave();
  });

  /**
   * Disconnect handler
   */
  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);
    
    if (currentSteamId) {
      const session = sessionManager.handleDisconnect(socket);
      
      if (session) {
        console.log(`[Server] ${session.username} disconnected (session kept for reconnection)`);
        
        // Don't remove from table immediately - give them 60s to reconnect
        // The session manager will handle cleanup
      }
    }
  });

  /**
   * Helper: Handle player leaving
   */
  function handlePlayerLeave() {
    if (!currentSteamId) return;

    // Remove from table
    tableManager.removePlayerFromTable(currentSteamId);

    // Leave socket room
    if (currentTableId) {
      socket.leave(currentTableId);
    }

    // Remove session
    sessionManager.removeSession(currentSteamId);

    console.log(`[Server] ${currentSteamId} left the table`);

    currentSteamId = null;
    currentTableId = null;
  }
});

/**
 * Periodic cleanup
 */
setInterval(() => {
  // Cleanup would happen here if needed
  // For now, sessions auto-cleanup via PlayerSessionManager
}, 60000); // Every minute

/**
 * Start server
 */
httpServer.listen(config.port, () => {
  console.log('========================================');
  console.log('🃏 Poker Prestige - Authoritative Server');
  console.log('========================================');
  console.log(`HTTP Server: http://localhost:${config.port}`);
  console.log(`Socket.io: ws://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Steam Auth: ${config.steamApiKey ? 'Enabled' : 'Mock Mode'}`);
  console.log('========================================');
  console.log('Ready to accept connections...');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Close all tables
  tableManager.getAllTables().forEach(table => {
    table.destroy();
  });

  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, io, httpServer };

