import * as https from 'https';
import { IncomingMessage } from 'http';

/**
 * Steam authentication ticket validation result
 */
export interface SteamAuthResult {
  success: boolean;
  steamId?: string;
  username?: string;
  error?: string;
}

/**
 * Steam user profile (minimal info needed)
 */
export interface SteamProfile {
  steamId: string;
  username: string;
  avatarUrl?: string;
}

/**
 * SteamService - Steamworks Web API Integration
 * 
 * Handles:
 * - Steam authentication ticket validation
 * - User profile retrieval
 * - Ownership verification (for production)
 * 
 * Security Model:
 * 1. UE5 client calls ISteamUser::GetAuthSessionTicket()
 * 2. Client sends ticket in REQ_JOIN
 * 3. Server validates with Steam Web API
 * 4. Server grants/denies access
 * 
 * Docs: https://partner.steamgames.com/doc/webapi/ISteamUserAuth
 */
export class SteamService {
  private apiKey: string;
  private appId: string;
  private baseUrl: string = 'https://partner.steam-api.com';

  // Cache validated sessions (steamId -> expiry)
  private sessionCache: Map<string, number> = new Map();

  constructor(apiKey: string, appId: string) {
    this.apiKey = apiKey;
    this.appId = appId;
  }

  /**
   * Helper to make HTTPS requests
   */
  private async makeRequest(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res: IncomingMessage) => {
        let data = '';
        
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Failed to parse JSON response'));
          }
        });
      }).on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Validate Steam authentication ticket
   * 
   * @param ticket - Hex-encoded ticket from ISteamUser::GetAuthSessionTicket()
   * @returns Validation result with steamId if successful
   */
  async validateAuthTicket(ticket: string): Promise<SteamAuthResult> {
    // For MVP/Development: Mock validation
    if (process.env.NODE_ENV === 'development' && ticket.startsWith('MOCK_')) {
      return this.mockValidation(ticket);
    }

    try {
      // Production: Call Steam Web API
      const url = `${this.baseUrl}/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${this.apiKey}&appid=${this.appId}&ticket=${ticket}`;

      const data = await this.makeRequest(url);

      if (data.response && data.response.params) {
        const steamId = data.response.params.steamid;
        
        // Cache this session
        this.sessionCache.set(steamId, Date.now() + 3600000); // 1 hour

        // Fetch username
        const profile = await this.getUserProfile(steamId);

        return {
          success: true,
          steamId,
          username: profile?.username || `Player_${steamId.slice(-6)}`
        };
      }

      return {
        success: false,
        error: 'Invalid ticket'
      };

    } catch (error: any) {
      console.error('[SteamService] Validation error:', error);
      return {
        success: false,
        error: error.message || 'Validation failed'
      };
    }
  }

  /**
   * Get Steam user profile
   * 
   * @param steamId - 64-bit Steam ID
   */
  async getUserProfile(steamId: string): Promise<SteamProfile | null> {
    try {
      const url = `${this.baseUrl}/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${steamId}`;

      const data = await this.makeRequest(url);

      if (data.response && data.response.players && data.response.players.length > 0) {
        const player = data.response.players[0];
        return {
          steamId: player.steamid,
          username: player.personaname,
          avatarUrl: player.avatarfull
        };
      }

      return null;

    } catch (error) {
      console.error('[SteamService] Profile fetch error:', error);
      return null;
    }
  }

  /**
   * Check if a session is still valid
   */
  isSessionValid(steamId: string): boolean {
    const expiry = this.sessionCache.get(steamId);
    if (!expiry) return false;
    
    const isValid = Date.now() < expiry;
    if (!isValid) {
      this.sessionCache.delete(steamId);
    }
    
    return isValid;
  }

  /**
   * Invalidate a session (logout)
   */
  invalidateSession(steamId: string): void {
    this.sessionCache.delete(steamId);
  }

  /**
   * Mock validation for development
   * 
   * Usage: Send ticket like "MOCK_76561198012345678" from client
   */
  private mockValidation(ticket: string): SteamAuthResult {
    const steamId = ticket.replace('MOCK_', '');
    
    // Basic validation
    if (!/^\d{17}$/.test(steamId)) {
      return {
        success: false,
        error: 'Invalid mock ticket format. Use MOCK_<17-digit-steamid>'
      };
    }

    console.log(`[SteamService] MOCK AUTH for ${steamId}`);

    return {
      success: true,
      steamId,
      username: `DevPlayer_${steamId.slice(-4)}`
    };
  }

  /**
   * Verify game ownership (optional, for launch security)
   * Prevents pirated copies from connecting
   */
  async verifyGameOwnership(steamId: string): Promise<boolean> {
    // For MVP: Skip ownership check
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    try {
      const url = `${this.baseUrl}/ISteamUser/CheckAppOwnership/v2/?key=${this.apiKey}&steamid=${steamId}&appid=${this.appId}`;

      const data = await this.makeRequest(url);

      return data.appownership && data.appownership.ownsapp;

    } catch (error) {
      console.error('[SteamService] Ownership check error:', error);
      // Fail-open in case of API issues
      return true;
    }
  }
}

/**
 * Singleton instance
 */
let steamServiceInstance: SteamService | null = null;

export function initSteamService(apiKey: string, appId: string): SteamService {
  if (!steamServiceInstance) {
    steamServiceInstance = new SteamService(apiKey, appId);
    console.log('[SteamService] Initialized');
  }
  return steamServiceInstance;
}

export function getSteamService(): SteamService {
  if (!steamServiceInstance) {
    throw new Error('SteamService not initialized. Call initSteamService() first.');
  }
  return steamServiceInstance;
}

