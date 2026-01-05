import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Server configuration
 * All values loaded from environment variables
 */
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Steam
  steamApiKey: process.env.STEAM_API_KEY || '',
  steamAppId: process.env.STEAM_APP_ID || '480', // Use Spacewar (480) for testing

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/poker_prestige',

  // Game Settings
  defaultBuyIn: parseInt(process.env.DEFAULT_BUY_IN || '1000', 10),
  defaultSmallBlind: parseInt(process.env.DEFAULT_SMALL_BLIND || '10', 10),
  defaultBigBlind: parseInt(process.env.DEFAULT_BIG_BLIND || '20', 10),
  turnTimeoutMs: parseInt(process.env.TURN_TIMEOUT_MS || '30000', 10),
  banterPhaseMs: parseInt(process.env.BANTER_PHASE_MS || '15000', 10),

  // Session
  sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '60000', 10),
  reconnectWindowMs: parseInt(process.env.RECONNECT_WINDOW_MS || '60000', 10),

  // Social Updates
  socialTickRate: parseInt(process.env.SOCIAL_TICK_RATE || '10', 10), // Hz
};

/**
 * Validate configuration
 */
export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    if (!config.steamApiKey) {
      throw new Error('STEAM_API_KEY is required in production');
    }
    if (!config.steamAppId) {
      throw new Error('STEAM_APP_ID is required in production');
    }
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
  }

  console.log('[Config] Configuration loaded successfully');
  console.log(`[Config] Environment: ${config.nodeEnv}`);
  console.log(`[Config] Port: ${config.port}`);
  console.log(`[Config] Steam App ID: ${config.steamAppId}`);
}

