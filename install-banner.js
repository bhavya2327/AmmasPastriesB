// install-banner.js
// Dynamically handles PWA installation guides, Android APK downloads, and branch-specific configurations

(function() {
    // 1. Detect environment and state
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
        console.log("App is running in standalone mode. Skipping install prompts.");
        return;
    }

    // Capture native PWA install prompt
    // NOTE: window.deferredPrompt is set in <head> inline script to capture early.
    // We only add a listener here as a fallback — do NOT reset it to null.
    if (!window.deferredPrompt) {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            console.log("Captured beforeinstallprompt event (install-banner fallback).");
        });
    }

    // 7. Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        const registerSW = () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('PWA Service Worker registered successfully:', reg.scope))
                .catch(err => console.error('PWA Service Worker registration failed:', err));
        };
        if (document.readyState === 'complete') {
            registerSW();
        } else {
            window.addEventListener('load', registerSW);
        }
    }
})();
