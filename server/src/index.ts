import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as dotenv from 'dotenv';
import { TableManager } from './game/TableManager';
import { MessageProtocol } from './protocol/MessageProtocol';
import { PlayerAction } from './types/game.types';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize Express and Socket.io
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Configure appropriately for production
    methods: ['GET', 'POST']
  }
});

// Store active tables
const tables = new Map<string, TableManager>();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    tables: tables.size,
    timestamp: Date.now() 
  });
});

// Socket.io connection handler
io.on('connection', (socket: Socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  let currentTableId: string | null = null;
  let playerSteamId: string | null = null;

  /**
   * JOIN_TABLE - Player joins a table
   */
  socket.on('JOIN_TABLE', (data: { tableId: string; steamId: string; buyIn: number }) => {
    const { tableId, steamId, buyIn } = data;

    // Get or create table
    let table = tables.get(tableId);
    if (!table) {
      table = new TableManager(tableId);
      tables.set(tableId, table);
      console.log(`[Server] Created new table: ${tableId}`);
    }

    // Add player to table
    const success = table.addPlayer(steamId, buyIn);
    if (!success) {
      MessageProtocol.sendError(socket, 'JOIN_FAILED', 'Cannot join table');
      return;
    }

    // Join socket room
    socket.join(tableId);
    currentTableId = tableId;
    playerSteamId = steamId;

    console.log(`[Server] Player ${steamId} joined table ${tableId}`);

    // Send table state
    MessageProtocol.sendTableState(io, tableId, table.getPublicState());
  });

  /**
   * START_HAND - Initiate a new hand
   */
  socket.on('START_HAND', () => {
    if (!currentTableId) return;

    const table = tables.get(currentTableId);
    if (!table) return;

    try {
      table.startHand();
      table.dealHoleCards();

      // Send hole cards to each player (HIDDEN)
      const publicState = table.getPublicState();
      publicState.players.forEach((playerState: any) => {
        const holeCards = table.getPlayerHoleCards(playerState.steamId);
        if (holeCards) {
          // Find the socket for this player
          const playerSockets = io.sockets.adapter.rooms.get(currentTableId);
          if (playerSockets) {
            playerSockets.forEach(socketId => {
              const playerSocket = io.sockets.sockets.get(socketId);
              if (playerSocket) {
                MessageProtocol.sendHiddenCards(playerSocket, playerState.steamId, holeCards);
              }
            });
          }
        }
      });

      // Broadcast public state
      MessageProtocol.sendTableState(io, currentTableId, table.getPublicState());

    } catch (error: any) {
      MessageProtocol.sendError(socket, 'START_HAND_FAILED', error.message);
    }
  });

  /**
   * PLAYER_ACTION - Handle player actions (fold, check, call, raise)
   */
  socket.on('PLAYER_ACTION', (data: { action: PlayerAction; amount?: number }) => {
    if (!currentTableId || !playerSteamId) return;

    const table = tables.get(currentTableId);
    if (!table) return;

    const success = table.handlePlayerAction(playerSteamId, data.action, data.amount);
    
    if (!success) {
      MessageProtocol.sendError(socket, 'INVALID_ACTION', 'Action not allowed');
      return;
    }

    // Broadcast action
    MessageProtocol.sendPlayerAction(io, currentTableId, {
      steamId: playerSteamId,
      action: data.action,
      amount: data.amount
    });

    // Check if round is complete
    if (table.isRoundComplete()) {
      table.advanceStage();
      
      // Send community cards if applicable
      const state = table.getPublicState();
      if (state.communityCards.length > 0) {
        MessageProtocol.sendPublicBoardCards(
          io, 
          currentTableId, 
          state.communityCards, 
          state.state
        );
      }
    }

    // Broadcast updated state
    MessageProtocol.sendTableState(io, currentTableId, table.getPublicState());
  });

  /**
   * LEAVE_TABLE - Player leaves the table
   */
  socket.on('LEAVE_TABLE', () => {
    if (!currentTableId || !playerSteamId) return;

    const table = tables.get(currentTableId);
    if (table) {
      table.removePlayer(playerSteamId);
      console.log(`[Server] Player ${playerSteamId} left table ${currentTableId}`);
    }

    socket.leave(currentTableId);
    currentTableId = null;
    playerSteamId = null;
  });

  /**
   * Disconnect handler
   */
  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);
    
    if (currentTableId && playerSteamId) {
      const table = tables.get(currentTableId);
      if (table) {
        table.removePlayer(playerSteamId);
      }
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log('========================================');
  console.log('🃏 Poker Prestige - Authoritative Server');
  console.log('========================================');
  console.log(`HTTP Server: http://localhost:${PORT}`);
  console.log(`Socket.io: ws://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

