fn main() {
    tauri_build::build();

    // Compile the Objective-C snapshot helper on macOS.
    // This gives us `bz_webview_snapshot` which takes a WKWebView snapshot
    // without triggering the Screen Recording TCC permission.
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/snapshot_helper.m")
            .flag("-fobjc-arc")
            .compile("bz_snapshot");
        // WebKit is already linked by wry, but explicitly calling it out here
        // ensures the framework is available to our .m file's #import.
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
}
