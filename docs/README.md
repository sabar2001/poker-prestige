# Documentation

This folder contains detailed implementation documentation for the Poker Prestige server.

## 📚 Contents

### [01-FIXES_SUMMARY.md](./01-FIXES_SUMMARY.md)
Summary of the three critical architecture fixes:
- Reconnection strategy (snapshot system)
- Steam authentication (ticket validation)
- Social frequency separation (dual-channel)

### [02-TABLE_INSTANCE.md](./02-TABLE_INSTANCE.md)
Complete documentation of the authoritative state machine:
- 11-state poker lifecycle
- Engine integration
- Turn timer system
- Betting logic

### [03-SOCKETIO_COMPLETE.md](./03-SOCKETIO_COMPLETE.md)
Socket.io networking layer implementation:
- TableManager (singleton)
- app.ts (entry point)
- Event handlers
- State broadcasting

### [04-STEAMSERVICE_FIX.md](./04-STEAMSERVICE_FIX.md)
Fix for SteamService browser API issue:
- Replaced fetch() with Node.js https module
- Mock mode for development
- Production-ready

### [05-QUICKSTART.md](./05-QUICKSTART.md)
How to run and test the server:
- Setup instructions
- Mock authentication
- Testing examples
- Troubleshooting

---

## 🗂️ Main Documentation

See the root folder for high-level docs:
- `/ARCHITECTURE.md` - Complete system architecture
- `/CHECKLIST.md` - Implementation progress tracker
- `/server/README.md` - Server-specific documentation
- `/client/README.md` - UE5 client documentation

---

## 🚀 Quick Links

**Get Started**: [05-QUICKSTART.md](./05-QUICKSTART.md)  
**Architecture**: [/ARCHITECTURE.md](../ARCHITECTURE.md)  
**Progress**: [/CHECKLIST.md](../CHECKLIST.md)

