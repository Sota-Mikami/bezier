// snapshot_helper.m — WKWebView snapshot without Screen Recording permission.
//
// `takeSnapshotWithConfiguration:completionHandler:` renders the webview's
// OWN content into an NSImage in-process. No CGWindowListCreateImage, no
// ScreenCaptureKit, no `screencapture` — so macOS never shows the TCC
// Screen Recording prompt regardless of app signature.
//
// Called from the Rust command `webview_snapshot` via the `bz_webview_snapshot`
// C entry point. Must be invoked on the main thread (enforced by the Tauri
// `with_webview` dispatch).
//
// Threading model:
//   - `bz_webview_snapshot` runs on the main thread (winit event loop /
//     Tauri `with_webview` closure).
//   - `takeSnapshotWithConfiguration:completionHandler:` is async; it
//     schedules work and fires its block on the main GCD queue.
//   - We wait by spinning `[[NSRunLoop currentRunLoop] runMode:beforeDate:]`
//     in 50ms increments. The GCD main queue IS drained by NSRunLoop, so the
//     completion block fires during the spin. This is the same mechanism
//     AppKit uses for modal dialog loops and is explicitly supported by
//     macOS nested run-loop semantics.

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <string.h>
#include <stdio.h>

/// Snapshot a WKWebView region to a PNG file.
///
/// @param webviewPtr   The WKWebView* cast to void*. MUST be called on the
///                     main thread.
/// @param x, y, w, h  Crop rect in the webview's logical coordinate space
///                     (CSS pixels == macOS points). Pass all-zeros for a
///                     full-view capture (WKSnapshotConfiguration default).
/// @param outPath      Filesystem path for the output PNG (UTF-8). Parent
///                     directory must already exist.
/// @param errBuf       On failure, filled with a null-terminated message.
/// @param errBufLen    Capacity of errBuf including the terminating '\0'.
/// @return 0 on success, -1 on error (errBuf describes what went wrong).
int bz_webview_snapshot(
    void * _Nonnull webviewPtr,
    double x, double y, double w, double h,
    const char * _Nonnull outPath,
    char * _Nonnull errBuf,
    int errBufLen
) {
    @autoreleasepool {
        WKWebView *webview = (__bridge WKWebView *)webviewPtr;

        // Build config only when the caller requests a specific crop rect.
        WKSnapshotConfiguration *config = nil;
        if (w > 0.5 && h > 0.5) {
            config = [[WKSnapshotConfiguration alloc] init];
            config.rect = NSMakeRect(x, y, w, h);
        }

        __block NSData   *pngData = nil;
        __block NSString *snapError = nil;
        __block BOOL      done = NO;

        [webview takeSnapshotWithConfiguration:config
                             completionHandler:^(NSImage * _Nullable image,
                                                 NSError * _Nullable error) {
            @autoreleasepool {
                if (error) {
                    snapError = [error.localizedDescription copy];
                } else if (!image) {
                    snapError = @"takeSnapshot returned nil image";
                } else {
                    // Primary path: NSImage → CGImage → NSBitmapImageRep → PNG.
                    CGImageRef cgImg = [image CGImageForProposedRect:NULL
                                                            context:nil
                                                              hints:nil];
                    if (cgImg) {
                        NSBitmapImageRep *rep =
                            [[NSBitmapImageRep alloc] initWithCGImage:cgImg];
                        pngData = [[rep representationUsingType:NSBitmapImageFileTypePNG
                                                    properties:@{}] copy];
                    }
                    // Fallback: TIFF round-trip (avoids CGImage dependency on
                    // display-attached screens for headless builds).
                    if (!pngData) {
                        NSData *tiff = [image TIFFRepresentation];
                        if (tiff) {
                            NSBitmapImageRep *rep =
                                [[NSBitmapImageRep alloc] initWithData:tiff];
                            pngData = [[rep representationUsingType:NSBitmapImageFileTypePNG
                                                        properties:@{}] copy];
                        }
                    }
                    if (!pngData) {
                        snapError = @"failed to convert snapshot to PNG";
                    }
                }
                done = YES;
            }
        }];

        // Spin the run loop until the completion handler fires or we time out.
        // `takeSnapshotWithConfiguration:` dispatches its callback on the GCD
        // main queue; GCD main-queue blocks are drained during
        // `runMode:beforeDate:` in any run-loop mode, so this correctly wakes
        // the block. Timeout: 15 s (same as the Rust-side safety net).
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:15.0];
        while (!done) {
            if ([deadline timeIntervalSinceNow] <= 0.0) {
                snprintf(errBuf, (size_t)errBufLen,
                         "webview_snapshot: timed out waiting for completion");
                return -1;
            }
            [[NSRunLoop currentRunLoop]
                runMode:NSDefaultRunLoopMode
             beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }

        if (snapError) {
            const char *msg = [snapError UTF8String];
            snprintf(errBuf, (size_t)errBufLen, "%s", msg ? msg : "snapshot failed");
            return -1;
        }

        // Write the PNG atomically.
        NSString *path = [NSString stringWithUTF8String:outPath];
        NSError  *writeErr = nil;
        if (![pngData writeToFile:path options:NSDataWritingAtomic error:&writeErr]) {
            const char *msg = writeErr
                ? [[writeErr localizedDescription] UTF8String]
                : "write failed";
            snprintf(errBuf, (size_t)errBufLen, "%s", msg ? msg : "write error");
            return -1;
        }

        errBuf[0] = '\0';
        return 0;
    }
}
