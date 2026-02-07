# StayFree Documentation

This folder contains technical documentation and implementation guides.

## Files

| File                                                         | Purpose                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [GLOBE_KEY_IMPLEMENTATION.md](./GLOBE_KEY_IMPLEMENTATION.md) | Complete guide for implementing Globe/Fn key support using native Swift |

## Quick Reference

### Current Hotkey: Left Option (⌥)

- **Status:** Working ✅
- **File:** `src/main/hotkey.ts`
- **Library:** uiohook-napi

### Future Hotkey: Globe Key (🌐)

- **Status:** Planned 📋
- **Guide:** See GLOBE_KEY_IMPLEMENTATION.md
- **Requires:** Native Swift module with IOHIDManager

## When to Implement Globe Key

Implement when:

1. Basic app features are complete (recording, transcription, UI)
2. Users request Globe key support
3. You have time for 2-4 hours of implementation + testing
