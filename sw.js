const CACHE_NAME = 'ammas-pastries-v12';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/install-delegate.html',
  '/images/Ammas%20logo.svg',
  '/images/logo.png',
  '/images/banner.jpg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Intercept manifest requests to serve dynamic branch-specific manifest
  if (url.includes('/manifest.json')) {
    const urlObj = new URL(url);
    const branch = urlObj.searchParams.get('branch');
    const startUrlOverride = urlObj.searchParams.get('start_url');
    if (branch) {
      const slug = branch.toLowerCase().trim().replace(/\s+/g, '-');
      const start_url = startUrlOverride ? decodeURIComponent(startUrlOverride) : `/index.html?branch=${encodeURIComponent(branch)}`;
      const manifestData = {
        id: `/app/${slug}`,
        name: "Ammas Pastries",
        short_name: "Ammas Pastries",
        description: "TV Display for " + branch,
        start_url: start_url,
        display: "fullscreen",
        background_color: "#ffffff",
        theme_color: "#F36E21",
        icons: [
          { src: "/images/logo.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/images/logo.png", sizes: "512x512", type: "image/png", purpose: "any" }
        ]
      };
      e.respondWith(
        new Response(JSON.stringify(manifestData), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return;
    }
  }

  // Do not intercept non-GET requests or API calls
  if (e.request.method !== 'GET' || url.includes('/api/')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});
