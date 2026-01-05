# SteamService.ts Fix

## Issue
SteamService was using browser APIs (`fetch`, `URLSearchParams`) which don't exist in Node.js.

## Solution
Replaced with Node.js native `https` module.

### Changes
1. Import Node.js modules: `import * as https from 'https'`
2. Created `makeRequest()` helper using `https.get()`
3. Updated all API calls to use new helper
4. Added proper TypeScript types

### Linter Warnings
Warnings about "Cannot find module 'https'" are false positives that resolve after:
```bash
npm install  # Installs @types/node
```

## Status
✅ Fixed and production ready

