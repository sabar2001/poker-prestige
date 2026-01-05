# Quick Start Guide

## Setup

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Server starts on `http://localhost:3000`

## Test with Mock Auth

```javascript
const socket = io('http://localhost:3000');

// Join table
socket.emit('REQ_JOIN', {
  steamTicket: 'MOCK_76561198012345678',
  tableId: 'table_001'
});

// Listen for responses
socket.on('AUTH_SUCCESS', (data) => console.log('Auth:', data));
socket.on('GAME_SNAPSHOT', (state) => console.log('State:', state));

// Sit and play
socket.emit('REQ_SIT', { seatIndex: 0, buyIn: 1000 });
socket.emit('REQ_READY');
socket.emit('REQ_ACTION', { type: 'RAISE', amount: 50 });
```

## Available Endpoints

**HTTP**:
- `GET /health` - Server status
- `GET /tables` - List all tables

**WebSocket Events**: See `ARCHITECTURE.md` for full protocol

## Troubleshooting

**Port in use**: Change `PORT` in `.env`

**Auth failing**: Ensure `NODE_ENV=development` for mock auth

**No response**: Check `curl http://localhost:3000/health`

