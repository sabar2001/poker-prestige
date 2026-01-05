# TableInstance - Implementation Complete

Complete documentation of the authoritative state machine implementation.

## Overview

The **authoritative state machine** is fully implemented in `TableInstance.ts`. This is the core game logic that handles the entire poker hand lifecycle with PC-optimized states, timer system, and anti-cheat security.

## State Machine

```
LOBBY_INITIALIZING → WAITING_FOR_PLAYERS → GAME_STARTING (3s) → DEALING
→ PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN_REVEAL → PAYOUT_ANIMATION (5s)
→ SOCIAL_BANTER (15s) → (Loop back)
```

## Key Features

- ✅ Full 11-state poker lifecycle
- ✅ Engine integration (Deck, HandEvaluator, PotManager)
- ✅ StateSerializer for anti-cheat
- ✅ Turn timer with auto-fold (30s)
- ✅ Betting round validation
- ✅ Side pot support
- ✅ Reconnection support (sequence IDs)

## Files

- `server/src/rooms/TableInstance.ts` (~940 lines)

See `/server/src/rooms/TableInstance.ts` for full implementation.

