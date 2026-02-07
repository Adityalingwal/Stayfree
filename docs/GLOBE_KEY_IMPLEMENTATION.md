# 🌐 Globe/Fn Key Implementation Guide

> **Purpose:** This document contains all the research, steps, and code needed to implement Globe key (🌐) detection on macOS for the StayFree app.
>
> **Status:** PLANNED (Not yet implemented)
>
> **Last Updated:** February 2026

---

## 📋 Table of Contents

1. [Problem Statement](#problem-statement)
2. [Why Current Solution Doesn't Work](#why-current-solution-doesnt-work)
3. [Research Findings](#research-findings)
4. [Solution Options](#solution-options)
5. [Recommended Approach](#recommended-approach)
6. [Implementation Steps](#implementation-steps)
7. [Code Examples](#code-examples)
8. [Testing Guide](#testing-guide)
9. [References & Resources](#references--resources)

---

## Problem Statement

### Current Situation

- StayFree uses `uiohook-napi` library for hotkey detection
- Works perfectly for most keys (Option, Ctrl, Shift, etc.)
- **DOES NOT detect Globe/Fn key** on newer MacBooks

### User Expectation

- Users want to use Globe key (🌐) for push-to-talk (like Wispr Flow)
- Globe key is convenient as it's not used by other apps
- Same experience as Apple Dictation or Wispr Flow

### Goal

- Detect Globe key press/release events
- Trigger recording on press, stop on release
- Same behavior as current Option key implementation

---

## Why Current Solution Doesn't Work

### Technical Explanation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KEYBOARD INPUT LAYERS ON macOS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Layer 1: HARDWARE/FIRMWARE (Keyboard Controller)                      │
│   ─────────────────────────────────────────────────                     │
│   Globe key is PROCESSED HERE - never leaves keyboard firmware!         │
│   - Emoji picker trigger                                                 │
│   - Dictation trigger                                                    │
│   - F-key modifier                                                       │
│                                                                          │
│   Layer 2: KERNEL SPACE (IOKit / IOHIDManager)                          │
│   ─────────────────────────────────────────────                         │
│   Globe key MAY BE VISIBLE here with special APIs                       │
│   - IOHIDManager can access raw HID events                              │
│   - Requires native Swift/Objective-C code                              │
│                                                                          │
│   Layer 3: USER SPACE (CGEventTap) ← uiohook-napi uses this            │
│   ────────────────────────────────                                      │
│   Globe key is NOT VISIBLE here!                                        │
│   - This is where most keyboard libraries work                          │
│   - CGEventTap doesn't receive Globe key events                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why uiohook-napi Fails

- `uiohook-napi` uses `libuiohook` internally
- `libuiohook` uses `CGEventTap` on macOS
- `CGEventTap` operates at Layer 3 (User Space)
- Globe key events never reach Layer 3
- **Result:** Globe key (keycode 63) is never detected

---

## Research Findings

### 1. Globe Key Technical Details

- **Key Code:** `kVK_Function` = `0x3F` = `63` (decimal)
- **HID Usage Page:** `0x01` (Generic Desktop)
- **HID Usage:** Varies by keyboard model
- **Behavior:** System-intercepted before reaching apps

### 2. How Wispr Flow (Probably) Does It

Based on reverse engineering and observation:

- Wispr integrates with **Apple Dictation API**
- When user presses Globe key → macOS triggers dictation
- Wispr **replaces** the default transcription engine
- They may also use IOHIDManager for additional detection

### 3. Available APIs for Detection

| API             | Layer            | Can Detect Globe? | Complexity |
| --------------- | ---------------- | ----------------- | ---------- |
| CGEventTap      | User Space       | ❌ No             | Easy       |
| IOHIDManager    | Kernel Interface | ✅ Maybe          | Hard       |
| IOKit HID       | Direct Driver    | ✅ Yes            | Very Hard  |
| Apple Dictation | System Service   | ✅ Yes (indirect) | Medium     |

---

## Solution Options

### Option A: IOHIDManager Native Module ⭐ RECOMMENDED

**What:** Write Swift code to access HID events at driver level

**Pros:**

- Direct detection of Globe key
- No dependency on Apple Dictation
- Full control over behavior

**Cons:**

- Requires native Swift code
- Needs Node.js addon wrapper
- May require entitlements

**Estimated Time:** 2-4 hours

---

### Option B: Apple Dictation Integration

**What:** Hook into Apple's dictation system

**Pros:**

- Uses existing macOS infrastructure
- Reliable, Apple-supported
- Same UX as system dictation

**Cons:**

- User must enable Apple Dictation first
- Depends on Apple's implementation
- Less control

**Estimated Time:** 1-2 hours

---

### Option C: Hybrid Approach

**What:** Use both - IOHIDManager as primary, Dictation as fallback

**Pros:**

- Most reliable
- Works in all scenarios
- Best user experience

**Cons:**

- Most complex
- More code to maintain

**Estimated Time:** 4-6 hours

---

## Recommended Approach

**We recommend Option A: IOHIDManager Native Module**

### Reasons:

1. Direct control over Globe key detection
2. No dependency on system Dictation being enabled
3. Same approach likely used by Wispr Flow
4. One-time effort, works reliably

---

## Implementation Steps

### Phase 1: Create Swift Native Module

#### Step 1.1: Create Directory Structure

```
StayFree/
├── native/
│   ├── macos/
│   │   ├── GlobeKeyDetector.swift    # Main Swift code
│   │   ├── GlobeKeyBridge.mm         # Objective-C++ bridge to Node
│   │   └── Package.swift             # Swift package manifest
│   └── binding.gyp                    # Node.js build config
```

#### Step 1.2: Write Swift Code for IOHIDManager

See [Code Examples](#code-examples) section below.

#### Step 1.3: Create N-API Bridge

Bridge Swift to Node.js using Objective-C++ wrapper.

#### Step 1.4: Configure Build System

Set up `binding.gyp` for node-gyp compilation.

---

### Phase 2: Integrate with Electron

#### Step 2.1: Build Native Module

```bash
cd StayFree
npm install node-gyp
npx node-gyp rebuild
```

#### Step 2.2: Import in Main Process

```typescript
// In src/main/hotkey.ts
const globeKey = require("../../build/Release/globe_key.node");

globeKey.startListening((event: string) => {
  if (event === "press") {
    this.emit("recording-start");
  } else if (event === "release") {
    this.emit("recording-stop");
  }
});
```

#### Step 2.3: Add Fallback Logic

Keep Option key as fallback if Globe key detection fails.

---

### Phase 3: Testing & Refinement

#### Step 3.1: Test on Multiple MacBooks

- M1/M2/M3 MacBooks (with Globe key)
- Intel MacBooks (with old Fn key)
- External keyboards

#### Step 3.2: Handle Edge Cases

- Multiple keyboards connected
- Globe key remapped in System Settings
- Keyboard with no Globe key

---

## Code Examples

### Swift: IOHIDManager Globe Key Detector

```swift
// native/macos/GlobeKeyDetector.swift

import Foundation
import IOKit.hid

/// Callback type for Globe key events
public typealias GlobeKeyCallback = (Bool) -> Void  // true = pressed, false = released

/// Detects Globe/Fn key presses using IOHIDManager
public class GlobeKeyDetector {
    private var manager: IOHIDManager?
    private var callback: GlobeKeyCallback?
    private var isGlobeKeyPressed = false

    // Globe key constants
    // kHIDUsage_KeyboardFn = 0x00, kHIDPage_AppleVendorTopCase = 0xFF
    private let kGlobeKeyUsagePage: UInt32 = 0xFF  // Apple Vendor Top Case
    private let kGlobeKeyUsage: UInt32 = 0x03      // Fn/Globe key

    public init() {}

    /// Start listening for Globe key events
    public func startListening(callback: @escaping GlobeKeyCallback) {
        self.callback = callback

        // Create HID Manager
        manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        guard let manager = manager else {
            print("[GlobeKey] Failed to create IOHIDManager")
            return
        }

        // Match keyboard devices
        let matchingDict: [String: Any] = [
            kIOHIDDeviceUsagePageKey: kHIDPage_GenericDesktop,
            kIOHIDDeviceUsageKey: kHIDUsage_GD_Keyboard
        ]

        IOHIDManagerSetDeviceMatching(manager, matchingDict as CFDictionary)

        // Register input callback
        let inputCallback: IOHIDValueCallback = { context, result, sender, value in
            guard let context = context else { return }
            let detector = Unmanaged<GlobeKeyDetector>.fromOpaque(context).takeUnretainedValue()
            detector.handleHIDValue(value)
        }

        let selfPointer = Unmanaged.passUnretained(self).toOpaque()
        IOHIDManagerRegisterInputValueCallback(manager, inputCallback, selfPointer)

        // Schedule with run loop
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)

        // Open manager
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        if result != kIOReturnSuccess {
            print("[GlobeKey] Failed to open IOHIDManager: \(result)")
            return
        }

        print("[GlobeKey] Started listening for Globe key")
    }

    /// Stop listening
    public func stopListening() {
        guard let manager = manager else { return }
        IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        self.manager = nil
        print("[GlobeKey] Stopped listening")
    }

    /// Handle HID input values
    private func handleHIDValue(_ value: IOHIDValue) {
        let element = IOHIDValueGetElement(value)
        let usagePage = IOHIDElementGetUsagePage(element)
        let usage = IOHIDElementGetUsage(element)

        // Check if this is the Globe/Fn key
        // Note: Usage page and usage may vary by keyboard model
        // Common combinations:
        // - Apple Internal: Page 0xFF, Usage 0x03
        // - Some keyboards: Page 0x01, Usage 0x00

        let isGlobeKey = (usagePage == kGlobeKeyUsagePage && usage == kGlobeKeyUsage) ||
                         (usage == 0x3F)  // Fallback: kVK_Function

        if isGlobeKey {
            let pressed = IOHIDValueGetIntegerValue(value) == 1

            if pressed != isGlobeKeyPressed {
                isGlobeKeyPressed = pressed
                callback?(pressed)
                print("[GlobeKey] Globe key \(pressed ? "PRESSED" : "RELEASED")")
            }
        }
    }
}
```

---

### Objective-C++ Bridge to Node.js

```objc
// native/macos/GlobeKeyBridge.mm

#import <Foundation/Foundation.h>
#include <napi.h>
#import "GlobeKeyDetector-Swift.h"

// Store reference to JS callback
static Napi::ThreadSafeFunction tsfn;
static GlobeKeyDetector* detector = nil;

// Called from Swift when Globe key event occurs
void OnGlobeKeyEvent(bool pressed) {
    tsfn.NonBlockingCall([pressed](Napi::Env env, Napi::Function jsCallback) {
        jsCallback.Call({Napi::String::New(env, pressed ? "press" : "release")});
    });
}

// Start listening - JS API
Napi::Value StartListening(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Create thread-safe function for callback
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "GlobeKeyCallback",
        0,
        1
    );

    // Initialize and start detector
    detector = [[GlobeKeyDetector alloc] init];
    [detector startListeningWithCallback:^(BOOL pressed) {
        OnGlobeKeyEvent(pressed);
    }];

    return Napi::Boolean::New(env, true);
}

// Stop listening - JS API
Napi::Value StopListening(const Napi::CallbackInfo& info) {
    if (detector) {
        [detector stopListening];
        detector = nil;
    }
    tsfn.Release();
    return info.Env().Undefined();
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startListening", Napi::Function::New(env, StartListening));
    exports.Set("stopListening", Napi::Function::New(env, StopListening));
    return exports;
}

NODE_API_MODULE(globe_key, Init)
```

---

### binding.gyp (Node.js Build Config)

```json
{
  "targets": [
    {
      "target_name": "globe_key",
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": ["native/macos/GlobeKeyBridge.mm"],
            "include_dirs": [
              "<!@(node -p \"require('node-addon-api').include\")"
            ],
            "libraries": ["-framework IOKit", "-framework Foundation"],
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "MACOSX_DEPLOYMENT_TARGET": "11.0",
              "OTHER_CFLAGS": ["-fobjc-arc"]
            },
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
          }
        ]
      ]
    }
  ]
}
```

---

### Integration in hotkey.ts

```typescript
// src/main/hotkey.ts - Future integration

import { EventEmitter } from "events";

export class HotkeyManager extends EventEmitter {
  private globeKeyModule: any = null;
  private useGlobeKey: boolean = false;

  constructor() {
    super();
    this.tryLoadGlobeKeyModule();
  }

  private tryLoadGlobeKeyModule(): void {
    try {
      // Try to load native Globe key module
      this.globeKeyModule = require("../../build/Release/globe_key.node");
      this.useGlobeKey = true;
      console.log("[Hotkey] Globe key module loaded successfully");
    } catch (error) {
      console.log("[Hotkey] Globe key module not available, using fallback");
      this.useGlobeKey = false;
    }
  }

  start(): void {
    if (this.useGlobeKey && this.globeKeyModule) {
      console.log("[Hotkey] Using Globe key (🌐) for push-to-talk");
      this.globeKeyModule.startListening((event: string) => {
        if (event === "press") {
          this.emit("recording-start");
        } else if (event === "release") {
          this.emit("recording-stop");
        }
      });
    } else {
      // Fallback to uiohook with Option key
      console.log("[Hotkey] Using Option key for push-to-talk");
      // ... existing uiohook code ...
    }
  }

  stop(): void {
    if (this.useGlobeKey && this.globeKeyModule) {
      this.globeKeyModule.stopListening();
    }
    // ... existing cleanup ...
  }
}
```

---

## Testing Guide

### Prerequisites

1. macOS 11+ (Big Sur or later)
2. MacBook with Globe key (M1/M2/M3)
3. Xcode Command Line Tools installed
4. Node.js 18+

### Build Steps

```bash
# Install dependencies
npm install node-addon-api node-gyp

# Build native module
npx node-gyp configure
npx node-gyp build

# Test the module
node -e "const m = require('./build/Release/globe_key.node'); m.startListening(console.log);"
```

### Test Cases

| Test                | Expected Result            |
| ------------------- | -------------------------- |
| Press Globe key     | Console: "press"           |
| Release Globe key   | Console: "release"         |
| Hold Globe key      | Only one "press" event     |
| Rapid press/release | Correct sequence of events |
| With other keys     | No interference            |

### Debugging

If Globe key not detected:

1. Check `IOHIDManager` permissions in System Settings → Privacy → Input Monitoring
2. Verify usage page/usage values match your keyboard
3. Add logging to see all HID events
4. Try different usage page combinations

---

## References & Resources

### Official Documentation

- [Apple IOKit Documentation](https://developer.apple.com/documentation/iokit)
- [IOHIDManager Reference](https://developer.apple.com/documentation/iokit/iohidmanager)
- [Node-API (N-API) Documentation](https://nodejs.org/api/n-api.html)

### Relevant Projects

- [libuiohook](https://github.com/kwhat/libuiohook) - What uiohook-napi uses
- [Hammerspoon](https://github.com/Hammerspoon/hammerspoon) - macOS automation, uses IOHIDManager
- [Karabiner-Elements](https://github.com/pqrs-org/Karabiner-Elements) - Keyboard customization

### Key Codes Reference

- `kVK_Function` = `0x3F` = `63` (decimal)
- Apple Vendor Top Case Usage Page: `0xFF`
- Globe Key Usage: `0x03`

### Useful Commands

```bash
# List connected HID devices
ioreg -p IOUSB -l

# Monitor HID events (requires hidutil)
hidutil monitor

# Check keyboard HID report descriptor
ioreg -n "Apple Internal Keyboard" -r
```

---

## Checklist Before Implementation

- [ ] Xcode Command Line Tools installed
- [ ] node-gyp working (`npx node-gyp --version`)
- [ ] Test keyboard HID values with `hidutil monitor`
- [ ] Add app to Input Monitoring in System Settings
- [ ] Back up current hotkey.ts

---

## Notes

1. **Globe key behavior varies by keyboard model** - Some keyboards report different usage pages
2. **System Settings may intercept Globe key** - User may need to disable system Globe key features
3. **External keyboards** - May not have Globe key, fallback needed
4. **Accessibility permissions** - May need Input Monitoring permission in addition to Accessibility

---

## Questions for Future Implementation

1. Should we support BOTH Globe key AND Option key simultaneously?
2. Should user be able to choose which key to use in Settings?
3. Do we need to handle external keyboards differently?
4. Should we auto-detect if Globe key is available?

---

**Document Version:** 1.0
**Created By:** AI Assistant
**For Project:** StayFree Voice Dictation App
