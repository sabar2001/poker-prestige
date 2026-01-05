# Poker Prestige Server - Refactored

**PC/Steam Authoritative Multiplayer Poker Server**

## ✅ Critical Fixes Implemented

1. **Reconnection Strategy** - Snapshot system with sequence IDs
2. **Secure Steam Auth** - Ticket validation via Steamworks Web API  
3. **Social Frequency Separation** - Dual-channel architecture (critical vs social)

See [FIXES_SUMMARY.md](../FIXES_SUMMARY.md) for detailed implementation.

---

## 📁 Project Structure

```
/server
├── src/
│   ├── config/                  # Environment configuration
│   │   └── index.ts
│   ├── engine/                  # PURE POKER LOGIC (No Sockets)
│   │   ├── Deck.ts              # Fisher-Yates shuffle
│   │   ├── HandEvaluator.ts     # Hand ranking calculations
│   │   └── PotManager.ts        # Main/side pot math
│   ├── rooms/                   # STATE MANAGEMENT
│   │   ├── PlayerSession.ts     # Connection wrapper + reconnection
│   │   └── StateSerializer.ts   # Anti-cheat filter (God State → Player View)
│   ├── protocol/                # TYPE-SAFE PROTOCOL
│   │   ├── Events.ts            # Enum constants
│   │   └── Payloads.ts          # TypeScript interfaces
│   ├── services/                # EXTERNAL APIS
│   │   └── SteamService.ts      # Steamworks authentication
│   ├── database/                # (Next phase)
│   │   ├── index.ts
│   │   └── repositories/
│   └── app.ts                   # (Next: Socket.io entry point)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🎯 Architecture Principles

### 1. Separation of Concerns

**Engine** (Pure Logic):
- No socket dependencies
- No state management
- Pure functions for poker math
- Easily testable

**Rooms** (State Management):
- Manages game state lifecycle
- Handles player sessions
- Enforces security (StateSerializer)

**Protocol** (Type Safety):
- Strongly typed events
- Clear client/server contracts
- Compile-time validation

### 2. Security by Design

**StateSerializer** enforces:
- Deck state NEVER exposed
- Opponent cards HIDDEN until showdown
- Separate "God State" (server) from "Player View" (client)

**SteamService** validates:
- Auth tickets against Steam API
- Session caching (1 hour)
- Mock mode for development

### 3. PC-Optimized Protocol

**Critical Channel** (Reliable):
```typescript
REQ_ACTION    → PLAYER_ACTION    // Game moves
STATE_PATCH   ← Full reliability  // Delta updates
HOLE_CARDS    ← Private           // Your cards only
```

**Social Channel** (Throttled 10hz):
```typescript
REQ_SOCIAL    → SOCIAL_TICK      // Head tracking, emotes
Batched updates                   // Reduces bandwidth
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Development mode (uses mock Steam auth)
npm run dev
```

### Development Testing

Use mock Steam tickets for local testing:
```typescript
// In UE5 client or test tool:
socket.emit('REQ_JOIN', {
  steamTicket: 'MOCK_76561198012345678',  // Any 17-digit Steam ID
  tableId: 'table_001'
});
```

### Production Setup

1. Get Steam Web API Key: https://steamcommunity.com/dev/apikey
2. Set in `.env`:
   ```
   STEAM_API_KEY=your_key_here
   STEAM_APP_ID=your_app_id
   NODE_ENV=production
   ```

---

## 📊 State Machine (Enhanced)

```
LOBBY_INITIALIZING
    ↓
WAITING_FOR_PLAYERS      ← Spectators can join
    ↓
GAME_STARTING            ← 3-2-1 countdown (sync animations)
    ↓
HAND_IN_PROGRESS         ← PreFlop → Flop → Turn → River
    ↓
SHOWDOWN_REVEAL          ← Dramatic card reveals
    ↓
PAYOUT_ANIMATION         ← Server waits for client animations
    ↓
SOCIAL_BANTER            ← 15s cooldown, show mucked cards
    ↓
(Loop back)
```

---

## 🔒 Anti-Cheat Features

1. **Server Authority**: All game logic server-side
2. **State Sanitization**: Opponent data stripped before sending
3. **Steam Authentication**: No spoofing possible
4. **Sequence IDs**: Detect packet manipulation
5. **Turn Validation**: Can't act out of turn
6. **Chip Validation**: Server tracks all balances

---

## 📡 Protocol Examples

### Join Table (Secure)
```typescript
// Client
socket.emit('REQ_JOIN', {
  steamTicket: ticket,  // From ISteamUser::GetAuthSessionTicket()
  tableId: 'table_001'
});

// Server validates, responds
socket.on('AUTH_SUCCESS', (data) => {
  // data: { steamId, username, sessionToken, chips }
});
```

### Reconnection
```typescript
// Client crashed, reconnecting
socket.emit('REQ_RECONNECT', {
  steamTicket: ticket,
  tableId: 'table_001',
  lastSequenceId: 42  // Last packet received
});

// Server
socket.on('GAME_SNAPSHOT', (data) => {
  // Full state to catch up
});
```

### Player Action
```typescript
// Fold
socket.emit('REQ_ACTION', { type: 'FOLD' });

// Raise
socket.emit('REQ_ACTION', { type: 'RAISE', amount: 500 });
```

---

## 🧪 Testing Strategy

### Unit Tests (Engine Layer)
```bash
npm test
```

Test files:
- `Deck.test.ts` - Shuffle validation
- `HandEvaluator.test.ts` - Hand ranking accuracy
- `PotManager.test.ts` - Side pot calculations

### Integration Tests
- `StateSerializer.test.ts` - Ensure no data leaks
- `SteamService.test.ts` - Mock validation

### Load Testing
- Multiple concurrent tables
- Reconnection stress tests
- Social tick rate validation

---

## 🗄️ Database Schema (Next Phase)

```sql
-- Users (Steam-based)
CREATE TABLE users (
    steam_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(32),
    chips_balance BIGINT DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hand histories (audit trail)
CREATE TABLE hand_histories (
    id SERIAL PRIMARY KEY,
    table_id UUID,
    hand_json JSONB,
    winner_ids VARCHAR[],
    pot_total INT,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📝 Next Steps

Ready for implementation:

1. ✅ **Engine refactor** - Done
2. ✅ **StateSerializer** - Done  
3. ✅ **SteamService** - Done
4. 🚧 **TableInstance** - Refactor with new architecture
5. 🚧 **app.ts** - Socket.io handlers with protocol
6. 🚧 **Database** - PostgreSQL integration
7. 🚧 **Tests** - Unit + integration coverage

---

## 🤝 Contributing

See [ARCHITECTURE.md](../ARCHITECTURE.md) for full technical specification.

---

**Built for PC. Designed for Steam. Optimized for high-stakes social gameplay.**
