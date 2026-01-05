# Phase 4: Database Integration - Complete

## ✅ What Was Created

### 1. Database Connection (`/server/src/database/index.ts`)
- PostgreSQL connection pool using `pg`
- Query helper function with logging
- Transaction support via `getClient()`
- Connection testing utility
- Graceful shutdown support

### 2. Database Schema (`/server/src/database/schema.sql`)
**Tables:**
- `users` - Steam-based user accounts with chip balances
- `hand_histories` - Complete hand replays stored as JSONB

**Features:**
- Indexes for performance
- Check constraints for data integrity
- Auto-updating `updated_at` timestamp
- GIN index on winner_ids array for fast lookups

### 3. Migration Script (`/server/src/database/migrate.ts`)
- Standalone script to create tables
- Validates connection before running
- Verifies tables after creation
- Run with: `npm run db:migrate`

### 4. User Repository (`/server/src/database/repositories/UserRepository.ts`)
**Methods:**
- `findBySteamId()` - Get user by Steam ID
- `findOrCreate()` - Get or create user with default 1000 chips
- `updateBalance()` - **Transaction-safe** balance update with row locking
- `updateBalances()` - Batch update multiple users in single transaction
- `getBalance()` - Quick balance check
- `getAllUsers()` - Admin function
- `deleteUser()` - Testing/cleanup

**Critical Feature:** All balance updates use `BEGIN...FOR UPDATE...COMMIT` to prevent chip duplication bugs!

### 5. Hand History Repository (`/server/src/database/repositories/HandHistoryRepository.ts`)
**Methods:**
- `saveHand()` - Store complete hand replay as JSONB
- `getHandById()` - Retrieve specific hand
- `getHandsForTable()` - Get table history
- `getHandsForPlayer()` - Get player's hand history
- `getRecentHands()` - Recent hands for lobby
- `getPlayerStats()` - Calculate win rate, total winnings
- `deleteOldHands()` - Cleanup old data

### 6. NPM Scripts Added
```json
"db:migrate": "ts-node src/database/migrate.ts"
"db:test": "ts-node -e \"...\""  // Test connection
```

---

## 🚀 Setup Instructions

### 1. Update .env File
Add to `/server/.env`:
```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/poker_prestige

# OR use individual variables:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poker_prestige
DB_USER=postgres
DB_PASSWORD=your_password
```

### 2. Start PostgreSQL (Docker)
```bash
docker run --name poker-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=poker_prestige \
  -p 5432:5432 \
  -d postgres:15
```

### 3. Run Migration
```bash
cd server
npm run db:migrate
```

**Expected Output:**
```
🔄 Starting database migration...
1. Testing database connection...
✅ Database connection successful
2. Reading schema.sql...
✅ Schema file loaded
3. Executing schema...
✅ Schema executed successfully
4. Verifying tables...
📊 Tables in database:
   - users
   - hand_histories
✅ All expected tables exist
🎉 Migration completed successfully!
```

### 4. Test Connection
```bash
npm run db:test
```

---

## 📊 Database Schema

### Users Table
```sql
CREATE TABLE users (
    steam_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    chips BIGINT NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_chips CHECK (chips >= 0)
);
```

### Hand Histories Table
```sql
CREATE TABLE hand_histories (
    id SERIAL PRIMARY KEY,
    table_id VARCHAR(64) NOT NULL,
    hand_data JSONB NOT NULL,  -- Full replay
    winner_ids VARCHAR(64)[] NOT NULL,
    pot_total BIGINT NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔒 Transaction Safety

**Critical:** All chip operations use database transactions!

```typescript
// Example: Update balance safely
const client = await getClient();
try {
  await client.query('BEGIN');
  
  // Lock row to prevent concurrent updates
  await client.query(
    'SELECT * FROM users WHERE steam_id = $1 FOR UPDATE',
    [steamId]
  );
  
  // Update balance
  await client.query(
    'UPDATE users SET chips = $1 WHERE steam_id = $2',
    [newChips, steamId]
  );
  
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

This prevents:
- Race conditions
- Chip duplication
- Negative balances
- Lost updates

---

## 🧪 Testing

### Manual Test
```typescript
import { UserRepository } from './database/repositories/UserRepository';

// Create user
const user = await UserRepository.findOrCreate(
  'MOCK_76561198012345678',
  'TestPlayer'
);
console.log('User:', user); // { steam_id, username, chips: 1000, ... }

// Update balance
await UserRepository.updateBalance(user.steam_id, 500);
console.log('New balance:', await UserRepository.getBalance(user.steam_id)); // 1500

// Batch update (payout)
await UserRepository.updateBalances(new Map([
  ['player1', 300],
  ['player2', -100],
  ['player3', -200]
]));
```

---

## 📝 Next Steps (Integration)

### Step 5: Integrate with Game Logic

#### 1. Update `app.ts` (REQ_JOIN)
```typescript
// Before: Mock chips
// const chips = 1000;

// After: Load from database
const user = await UserRepository.findOrCreate(
  authResult.steamId,
  authResult.username
);
const chips = user.chips;
```

#### 2. Update `TableInstance.ts` (PAYOUT state)
```typescript
// After calculating winners and payouts
const balanceUpdates = new Map<string, number>();

winners.forEach(winner => {
  balanceUpdates.set(winner.steamId, winner.amount);
});

// Losers (subtract their bets)
losers.forEach(loser => {
  balanceUpdates.set(loser.steamId, -loser.totalBet);
});

// Update database
await UserRepository.updateBalances(balanceUpdates);

// Save hand history
await HandHistoryRepository.saveHand({
  tableId: this.tableId,
  sequenceId: this.sequenceId,
  winners,
  players,
  communityCards,
  pots,
  // ... full hand log
});
```

---

## ✅ Status

**Phase 4: Database Integration** - COMPLETE

- ✅ Connection pool setup
- ✅ Schema defined
- ✅ Migration script
- ✅ User repository (transaction-safe)
- ✅ Hand history repository
- ✅ NPM scripts

**Ready for integration with game logic!** 🎯

Run `npm run db:migrate` to set up your database!

