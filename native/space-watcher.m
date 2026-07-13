// space-watcher — a tiny, crash-isolated macOS helper for StayFree.
//
// Purpose: tell the main app whether the CURRENTLY VISIBLE Space on the main
// display is a native fullscreen-app Space (where the Dock is absent) or a
// normal desktop Space (where the Dock is present). Electron/`workArea` is blind
// to this — switching to a fullscreen app fires no display event and workArea
// keeps reporting the desktop's dock-inclusive value. So the widget cannot know
// it should drop to the screen bottom without this signal.
//
// How it works:
//   - Polls CGSCopyManagedDisplaySpaces a few times a second. That API reports
//     each display's real "Current Space" independent of which process asks — so
//     it reflects what's actually on screen, not our own Space. (We poll rather
//     than observe NSWorkspaceActiveSpaceDidChangeNotification because that
//     notification is only delivered to fully-registered NSApplications; a bare
//     spawned helper never receives it. Polling this cheap direct query in an
//     isolated 50 KB process is negligible and rock-solid.)
//   - Prints "1\n" (fullscreen / dock absent) or "0\n" (normal / dock present)
//     to stdout, only when the value changes. The parent (main process) reads
//     these lines and repositions the widget.
//
// Runs as a SEPARATE process so a fault here can never crash the app. Exits
// automatically if orphaned (parent died).
//
// CGS* are private but decade-stable APIs used by essentially every dock/space
// utility; this app is distributed directly (not App Store), so that's fine.

#import <Cocoa/Cocoa.h>

typedef int CGSConnectionID;
extern CGSConnectionID CGSMainConnectionID(void);
extern CFArrayRef CGSCopyManagedDisplaySpaces(CGSConnectionID cid);

// CGSSpaceType: 0 = user (normal desktop), 2 = system, 4 = fullscreen.
static const int kCGSSpaceFullscreen = 4;

static int gLastEmitted = -1;

static int currentlyFullscreen(void) {
  int fullscreen = 0;
  CGSConnectionID cid = CGSMainConnectionID();
  CFArrayRef displays = CGSCopyManagedDisplaySpaces(cid);
  if (displays) {
    NSArray *arr = (__bridge NSArray *)displays;
    for (NSDictionary *disp in arr) {
      NSDictionary *current = disp[@"Current Space"];
      if (current && [current[@"type"] intValue] == kCGSSpaceFullscreen) {
        fullscreen = 1;
        break;
      }
    }
    CFRelease(displays);
  }
  return fullscreen;
}

static void emitState(void) {
  int fullscreen = currentlyFullscreen();
  if (fullscreen != gLastEmitted) {
    gLastEmitted = fullscreen;
    printf("%d\n", fullscreen);
    fflush(stdout);
  }
}

int main(void) {
  @autoreleasepool {
    emitState();  // initial state, immediately

    // Poll the active Space ~3x/sec; emitState only prints on change.
    [NSTimer scheduledTimerWithTimeInterval:0.3
                                    repeats:YES
                                      block:^(NSTimer *timer) { emitState(); }];

    // Orphan guard: if the parent (StayFree) dies without killing us, our parent
    // is reparented to launchd (pid 1). Poll and exit so we never linger.
    [NSTimer scheduledTimerWithTimeInterval:2.0
                                    repeats:YES
                                      block:^(NSTimer *timer) {
                                        if (getppid() == 1) exit(0);
                                      }];

    // Broken pipe (parent closed stdout) should terminate us, not raise.
    signal(SIGPIPE, SIG_DFL);

    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
