import { Socket } from 'socket.io';
import { TableInstance } from './TableInstance';
import { PlayerView } from './StateSerializer';
import { ActionType, ServerEvent } from '../protocol/Events';

/**
 * Table configuration
 */
export interface TableConfig {
  tableId?: string;
  maxPlayers?: number;
  smallBlind?: number;
  bigBlind?: number;
}

/**
 * TableManager - Singleton class managing all active tables
 * 
 * Responsibilities:
 * - Create and destroy tables
 * - Route players to correct tables
 * - Handle table lifecycle
 * - Setup Socket.io callbacks for each table
 */
export class TableManager {
  private static instance: TableManager | null = null;
  
  private tables: Map<string, TableInstance> = new Map();
  private playerToTable: Map<string, string> = new Map(); // steamId -> tableId
  private io: any; // Socket.io server instance

  private constructor() {
    console.log('[TableManager] Initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TableManager {
    if (!TableManager.instance) {
      TableManager.instance = new TableManager();
    }
    return TableManager.instance;
  }

  /**
   * Set Socket.io instance (called from app.ts)
   */
  setIO(io: any): void {
    this.io = io;
    console.log('[TableManager] Socket.io instance attached');
  }

  /**
   * Create a new table
   */
  createTable(tableConfig: TableConfig = {}): TableInstance {
    const {
      tableId,
      maxPlayers = 6,
      smallBlind = 10,
      bigBlind = 20
    } = tableConfig;
    
    console.log(`[TableManager] Creating table with ${maxPlayers} max players`);

    const table = new TableInstance(tableId, smallBlind, bigBlind);
    this.tables.set(table.tableId, table);

    // Setup callbacks for this table
    this.setupTableCallbacks(table);

    console.log(`[TableManager] Created table ${table.tableId}`);
    return table;
  }

  /**
   * Setup Socket.io callbacks for a table
   */
  private setupTableCallbacks(table: TableInstance): void {
    // State change callback - emit to specific players
    table.setOnStateChange((_state: PlayerView, playerSteamIds: string[]) => {
      if (!this.io) return;

      playerSteamIds.forEach(steamId => {
        // Find socket for this player
        const sockets = Array.from(this.io.sockets.sockets.values());
        const playerSocket = (sockets as Socket[]).find((s: Socket) => (s as any).steamId === steamId);
        
        if (playerSocket && playerSocket.connected) {
          // Send personalized state to each player
          const personalizedView = table.getPlayerView(steamId);
          playerSocket.emit(ServerEvent.STATE_PATCH, personalizedView);
        }
      });
    });

    // Player action callback - broadcast to all in table
    table.setOnPlayerAction((steamId: string, action: ActionType, amount?: number) => {
      if (!this.io) return;

      this.io.to(table.tableId).emit(ServerEvent.PLAYER_ACTION, {
        steamId,
        action,
        amount,
        timestamp: Date.now()
      });
    });

    // Error callback - send to specific player
    table.setOnError((steamId: string, code: string, message: string) => {
      if (!this.io) return;

      const sockets = Array.from(this.io.sockets.sockets.values());
      const playerSocket = (sockets as Socket[]).find((s: Socket) => (s as any).steamId === steamId);
      
      if (playerSocket && playerSocket.connected) {
        playerSocket.emit(ServerEvent.ERROR, {
          code,
          message,
          timestamp: Date.now()
        });
      }
    });
  }

  /**
   * Get table by ID
   */
  getTable(tableId: string): TableInstance | undefined {
    return this.tables.get(tableId);
  }

  /**
   * Find table for a player (for reconnection)
   */
  findTableForPlayer(steamId: string): TableInstance | undefined {
    const tableId = this.playerToTable.get(steamId);
    if (!tableId) return undefined;
    return this.tables.get(tableId);
  }

  /**
   * Add player to a table
   */
  addPlayerToTable(
    tableId: string, 
    steamId: string, 
    username: string, 
    position: number, 
    buyIn: number
  ): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;

    const success = table.addPlayer(steamId, username, position, buyIn);
    if (success) {
      this.playerToTable.set(steamId, tableId);
      console.log(`[TableManager] ${username} added to table ${tableId} at seat ${position}`);
    }

    return success;
  }

  /**
   * Remove player from their table
   */
  removePlayerFromTable(steamId: string): boolean {
    const tableId = this.playerToTable.get(steamId);
    if (!tableId) return false;

    const table = this.tables.get(tableId);
    if (!table) return false;

    const success = table.removePlayer(steamId);
    if (success) {
      this.playerToTable.delete(steamId);
      console.log(`[TableManager] Player ${steamId} removed from table ${tableId}`);
      
      // TODO: Cleanup empty tables after a timeout
    }

    return success;
  }

  /**
   * Get all active tables
   */
  getAllTables(): TableInstance[] {
    return Array.from(this.tables.values());
  }

  /**
   * Get table count
   */
  getTableCount(): number {
    return this.tables.size;
  }

  /**
   * Get total player count across all tables
   */
  getTotalPlayerCount(): number {
    return this.playerToTable.size;
  }

  /**
   * Cleanup empty tables (called periodically)
   */
  cleanupEmptyTables(): void {
    const emptyTables: string[] = [];

    this.tables.forEach(() => {
      // Check if table has been empty for a while
      // For now, just log - implement actual cleanup logic later
      // emptyTables.push(tableId);
    });

    emptyTables.forEach(tableId => {
      const table = this.tables.get(tableId);
      if (table) {
        table.destroy();
        this.tables.delete(tableId);
        console.log(`[TableManager] Cleaned up empty table ${tableId}`);
      }
    });
  }

  /**
   * Destroy a specific table
   */
  destroyTable(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;

    // Remove all player mappings
    this.playerToTable.forEach((tId, steamId) => {
      if (tId === tableId) {
        this.playerToTable.delete(steamId);
      }
    });

    table.destroy();
    this.tables.delete(tableId);
    console.log(`[TableManager] Destroyed table ${tableId}`);
    return true;
  }

  /**
   * Get table info for lobby display
   */
  getTableInfo(tableId: string): any {
    const table = this.tables.get(tableId);
    if (!table) return null;

    // Get public info about the table
    const snapshot = table.getPlayerView(''); // Empty steamId for public view
    return {
      tableId: table.tableId,
      playerCount: snapshot.players.length,
      maxPlayers: table.maxPlayers,
      state: snapshot.state
    };
  }

  /**
   * List all tables (for lobby)
   */
  listTables(): any[] {
    return Array.from(this.tables.values()).map(table => {
      const snapshot = table.getPlayerView('');
      return {
        tableId: table.tableId,
        playerCount: snapshot.players.length,
        maxPlayers: table.maxPlayers,
        state: snapshot.state
      };
    });
  }
}

// Export singleton getter
export const getTableManager = () => TableManager.getInstance();

