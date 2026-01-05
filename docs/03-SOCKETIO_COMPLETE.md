# Socket.io Layer Complete

Complete documentation of the networking layer implementation.

## What Was Implemented

### 1. TableManager.ts (Singleton)
Centralized manager for all table instances with Socket.io integration.

### 2. app.ts (Entry Point)
Complete Socket.io server with all event handlers:
- Authentication flow (REQ_JOIN, REQ_RECONNECT)
- Game actions (REQ_ACTION, REQ_SIT, REQ_READY)
- Social events (REQ_SOCIAL, REQ_EMOTE)
- State broadcasting

## Architecture Flow

```
Client → app.ts → TableManager → TableInstance
→ Engine (Deck, HandEvaluator, PotManager)
→ StateSerializer → Callbacks → Socket.io → Clients
```

## Testing

```bash
cd server
npm install
npm run dev
```

Server runs on `localhost:3000`

See `QUICKSTART.md` for testing instructions.

