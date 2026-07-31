// Backend Lambda URL — all /api/ calls go here directly, bypassing Amplify proxy
const API_BASE = window.__API_BASE__ || (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000'
        ? ''
        : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:' || !window.location.hostname
            ? 'http://localhost:3000'
            : 'https://4o62k0vv38.execute-api.ap-south-1.amazonaws.com')
);

// --- CLEAN URL SYSTEM ---
// Proactively strips .html from ALL navigations before the browser sees them
(function() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
    if (!isCleanActive) return;

    // Helper: convert a .html URL to a clean URL
    function toClean(url) {
        if (!url || typeof url !== 'string') return url;
        // Handle portal.html?branch=X → /portal/branch-slug
        if (/portal/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/portal/' + slug;
            }
        }
        // Handle details.html?branch=X → /admin/branch-slug
        if (/details/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/admin/' + slug;
            }
        }
        // Handle media.html?branch=X → /branch-slug
        if (/media/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/' + slug;
            }
        }
        // Handle orders.html?branch=X → /orders/branch-slug
        if (/orders/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/orders/' + slug;
            }
        }
        // Handle announcements.html?branch=X → /announcements/branch-slug
        if (/announcements/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/announcements/' + slug;
            }
        }
        // Handle index.html?branch=X → /ammas-pastries/branch-slug
        if (/index\.html/.test(url) && url.includes('branch=')) {
            const match = url.match(/[?&]branch=([^&]+)/);
            if (match) {
                const slug = decodeURIComponent(match[1]).toLowerCase().trim().replace(/\s+/g, '-');
                return '/ammas-pastries/' + slug;
            }
            return '/ammas-pastries';
        }
        // Strip .html from other pages, preserve query string
        return url.replace(/([^?#]*)\.html/, '$1');
    }

    // 1. Intercept ALL <a href> clicks (capture phase = before any other handler)
    document.addEventListener('click', function(e) {
        // Skip if the actual click target is a button or inside a button
        if (e.target.closest('button')) return;
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || !href.includes('.html') || href.startsWith('http') || href.startsWith('//')) return;
        e.preventDefault();
        window.location.href = toClean(href);
    }, true);

    // 2. Expose clean navigate helper for programmatic use
    window._navigate = function(url) {
        window.location.href = toClean(url);
    };

    // 3. Rewrite current URL (for when .html pages are still accessed directly)
    const pathname = window.location.pathname;
    const search = window.location.search;
    const branch = new URLSearchParams(search).get('branch');
    if (pathname.endsWith('.html')) {
        const clean = toClean(pathname + search);
        history.replaceState(null, '', clean);
    } else if ((pathname === '/' || pathname === '/ammas-pastries') && !branch) {
        if (pathname === '/') history.replaceState(null, '', '/ammas-pastries');
    }
})();



// Fallback for non-local: _navigate just does a normal redirect
if (!window._navigate) window._navigate = function(url) { window.location.href = url; };


// --- AUTHENTICATION INTERCEPTOR ---
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(input, init = {}) {
        let url = '';
        if (typeof input === 'string') {
            // Rewrite relative /api/ paths to absolute Lambda URL
            if (input.startsWith('/api/')) {
                input = API_BASE + input;
            }
            url = input;
        } else if (input instanceof URL) {
            url = input.toString();
        } else if (input && typeof input.url === 'string') {
            url = input.url;
        }

        const isApi = url.includes('/api/');
        if (isApi) {
            const token = localStorage.getItem('adminToken');
            if (token) {
                init.headers = init.headers || {};
                if (init.headers instanceof Headers) {
                    init.headers.set('Authorization', token);
                } else if (Array.isArray(init.headers)) {
                    const authIdx = init.headers.findIndex(([k]) => k.toLowerCase() === 'authorization');
                    if (authIdx > -1) {
                        init.headers[authIdx][1] = token;
                    } else {
                        init.headers.push(['Authorization', token]);
                    }
                } else {
                    init.headers['Authorization'] = token;
                }
            }
        }

        return originalFetch(input, init).then(response => {
            if (response.status === 401 && isApi) {
                handleLogout();
            }
            return response;
        });
    };
})();

function isAdmin() {
    return localStorage.getItem('userRole') === 'admin';
}

function handleLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userBranch');
    const currentPath = window.location.pathname;
    if (currentPath !== '/login' && currentPath !== '/login.html' && currentPath !== '/ammas-pastries' && currentPath !== '/') {
        _navigate('login.html');
    }
}

// Access control check: Staff can only access their logged-in branch
function checkBranchAccess() {
    const role = localStorage.getItem('userRole');
    const userBranch = localStorage.getItem('userBranch');
    const urlBranch = getBranchFromUrl();

    if (role && role !== 'admin') {
        if (urlBranch && userBranch && urlBranch.toLowerCase().trim() !== userBranch.toLowerCase().trim()) {
            const slug = userBranch.toLowerCase().trim().replace(/\s+/g, '-');
            const pathname = window.location.pathname;
            const parts = pathname.split('/').filter(Boolean);
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
            if (pathname.includes('details') || pathname.includes('image') || pathname.includes('video') || 
                (parts.length === 2 && parts[0] === 'admin') || 
                (parts.length === 1 && !pathname.includes('.'))) {
                _navigate(isCleanActive ? '/admin/' + slug : '/details.html?branch=' + encodeURIComponent(userBranch));
            } else if (pathname.includes('announcements')) {
                _navigate(isCleanActive ? '/announcements/' + slug : '/announcements.html?branch=' + encodeURIComponent(userBranch));
            } else if (pathname.includes('orders')) {
                _navigate(isCleanActive ? '/orders/' + slug : '/orders.html?branch=' + encodeURIComponent(userBranch));
            } else if (pathname.includes('portal')) {
                _navigate(isCleanActive ? '/portal/' + slug : '/portal.html?branch=' + encodeURIComponent(userBranch));
            }
        }
    }
}

function applyRoleBasedNav() {
    checkBranchAccess();

    const role = localStorage.getItem('userRole');
    const branch = getBranchFromUrl() || localStorage.getItem('userBranch') || 'Kalyan Nagar';

    if (role === 'admin') {
        const nav = document.getElementById('nav-admin');
        if (nav) nav.classList.remove('hidden');
        const logoLink = document.getElementById('nav-logo-link');
        if (logoLink) {
            logoLink.href = '/portal';
        }
    } else if (branch) {
        const nav = document.getElementById('nav-branch');
        if (nav) {
            nav.classList.remove('hidden');
            const mediaLink = document.getElementById('nav-media-link');
            const annLink = document.getElementById('nav-ann-link');
            const wafflesLink = document.getElementById('nav-waffles-link');
            const tokensLink = document.getElementById('nav-tokens-link');
            const logoLink = document.getElementById('nav-logo-link');
            const slug = branch.toLowerCase().trim().replace(/\s+/g, '-');
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
            // Always route Media link to /:slug from any page
            if (mediaLink) mediaLink.href = isCleanActive ? '/' + slug : '/media.html?branch=' + encodeURIComponent(branch);
            if (annLink) annLink.href = isCleanActive ? '/announcements/' + slug : '/announcements.html?branch=' + encodeURIComponent(branch);
            if (wafflesLink) wafflesLink.href = isCleanActive ? '/branch/menu?branch=' + encodeURIComponent(branch) : '/branch/menu.html?branch=' + encodeURIComponent(branch);
            if (tokensLink) tokensLink.href = isCleanActive ? '/orders/' + slug : '/orders.html?branch=' + encodeURIComponent(branch);
            if (logoLink) logoLink.href = isCleanActive ? '/portal/' + slug : '/portal.html?branch=' + encodeURIComponent(branch);
        }
    }
}

// Global helper: Get current branch from URL query parameters or path slug
function getBranchFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const queryBranch = params.get('branch');
    if (queryBranch) return queryBranch;

    // On local/Amplify clean URLs, the path may be /:branchSlug or /media/:branchSlug
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
    if (isCleanActive) {
        const pathname = window.location.pathname;
        const parts = pathname.split('/').filter(Boolean);
        
        // 1. Match /orders/:branchSlug, /announcements/:branchSlug
        if (parts.length === 2 && ['orders', 'announcements'].includes(parts[0])) {
            const slug = parts[1];
            const stored = localStorage.getItem('userBranch') || '';
            if (stored && stored.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()) {
                return stored;
            }
            return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        // 2. Match /:branchSlug or /admin/:branchSlug (not /portal/*, /ammas-pastries/*, or other named routes)
        if (parts.length === 2 && parts[0] === 'admin') {
            const slug = parts[1];
            if (slug.toLowerCase() === 'waffles') return '';
            const stored = localStorage.getItem('userBranch') || '';
            if (stored && stored.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()) {
                return stored;
            }
            return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        const namedRoutes = ['login','branch','portal','details','announcements','orders','image','video','apk','header','index1','ammas-pastries','media','admin'];
        if (parts.length === 1 && !namedRoutes.includes(parts[0]) && !parts[0].includes('.')) {
            // It's a branch slug like /kalyan-nagar — convert to title case
            const stored = localStorage.getItem('userBranch') || '';
            if (stored && stored.toLowerCase().replace(/\s+/g, '-') === parts[0].toLowerCase()) {
                return stored;
            }
            return parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
    }
    return '';
}

// Dynamically point manifest to same-origin branch-specific URL to trigger PWA beforeinstallprompt
function setupDynamicManifest() {
    const branchName = getBranchFromUrl();
    if (!branchName) return;
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
    }
    link.href = '/manifest.json?branch=' + encodeURIComponent(branchName);
}
setupDynamicManifest();

// Global helper: Get active branch name or format
function getActiveBranchId() {
    const branch = getBranchFromUrl();
    return branch ? branch.toLowerCase().trim().replace(/\s+/g, '-') : '';
}

// Global helper: Test Display Sign
function testDisplaySign() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
    const branch = getBranchFromUrl();
    if (branch) {
        const slug = branch.toLowerCase().trim().replace(/\s+/g, '-');
        if (isCleanActive) {
            window.open('/ammas-pastries/' + slug + '?preview=true', '_blank');
        } else {
            window.open('/index.html?branch=' + encodeURIComponent(branch) + '&preview=true', '_blank');
        }
    } else {
        if (isCleanActive) {
            window.open('/ammas-pastries?preview=true', '_blank');
        } else {
            window.open('/index.html?preview=true', '_blank');
        }
    }
}



// Auto-preload current page manifest on load so prompt is ready before user clicks Download
window.addEventListener('load', () => {
    const branchName = getBranchFromUrl();
    if (branchName) {
        let manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.id = 'pwa-manifest';
            document.head.appendChild(manifestLink);
        }
        const slug = branchName.toLowerCase().trim().replace(/\s+/g, '-');
        const startUrl = `/ammas-pastries/${slug}?preview=true`;
        
        // Use a Data URI in the main window so we don't rely on SW interception which can be flaky on first load
        const origin = window.location.origin;
        const start_url_absolute = startUrl.startsWith('http') ? startUrl : origin + startUrl;
        
        const manifest = {
          id: `${origin}/app/${slug}-${Date.now()}`,
          name: "Ammas Pastries",
          short_name: "Ammas Pastries",
          description: 'TV Display for ' + branchName,
          start_url: start_url_absolute,
          display: 'fullscreen',
          background_color: '#ffffff',
          theme_color: '#F36E21',
          icons: [
            { src: `${origin}/images/logo-192-maskable.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: `${origin}/images/logo-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${origin}/images/logo-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }
          ]
        };
        
        const manifestString = JSON.stringify(manifest);
        const dataUri = 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(manifestString);
        manifestLink.href = dataUri;
        console.log('[PWA] Injected dynamic Data URI manifest into main window for:', branchName);
    }
});

// Global variable to store the top-level PWA install prompt
window.globalInstallPrompt = null;

// Listen for the native install prompt on the top-level window
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent Chrome from showing the mini-infobar
    window.globalInstallPrompt = e;
    console.log('[PWA] Top-level beforeinstallprompt intercepted and ready.');
});

// Global helper: Install TV Display App as PWA directly on home screen
async function downloadDisplayPage(branchNameOverride) {
    if (window.globalInstallPrompt) {
        try {
            await window.globalInstallPrompt.prompt();
            const { outcome } = await window.globalInstallPrompt.userChoice;
            console.log('Main window PWA install outcome:', outcome);
            window.globalInstallPrompt = null;
        } catch (err) {
            console.error('Failed to trigger top-level install prompt:', err);
            showToast('Install blocked. It may already be installed.', 'error');
        }
    } else {
        console.log('[PWA] No top-level prompt found.');
        showToast('App is already installed, or Chrome is blocking it. If already installed, open it from chrome://apps', 'info');
    }
}

// Global helper: Custom animated Toast system
function showToast(message, type = 'success') {
    const existing = document.getElementById('amma-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'amma-toast';
    
    let bgClass = 'bg-[#F36E21]';
    if (type === 'error') bgClass = 'bg-red-600';
    if (type === 'info') bgClass = 'bg-blue-600';

    toast.className = `fixed top-6 right-6 z-[99999] px-6 py-4 rounded-2xl shadow-2xl text-white font-bold flex items-center gap-3 transition-all duration-300 transform translate-x-12 opacity-0 ${bgClass}`;
    
    let icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
    if (type === 'info') icon = '<i class="fa-solid fa-circle-info"></i>';

    toast.innerHTML = `${icon} <span class="text-sm font-medium tracking-wide">${message}</span>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-x-12', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    }, 50);

    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-12', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Load dynamic header component
loadComponent('header.html', '.header').then(() => {
    applyRoleBasedNav();
    currentPage();
}).catch(error => console.error('Error loading header:', error));

let selectedFile = null;

// --- POPUP CONTROLS ---
function openUploadModal() {
    const modal = document.getElementById('modal-overlay');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeUploadModal() {
    const modal = document.getElementById('modal-overlay');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    resetForm();
}

// --- FILE HANDLING ---
function uploadHandleSingleFile(input) {
    if (input.files && input.files[0]) {
        selectedFile = input.files[0];
        updateSingleFileUI();
    }
}

function updateSingleFileUI() {
    const container = document.getElementById('single-file-display');
    if (!selectedFile) { container.innerHTML = ''; return; }

    const size = (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB';
    let icon = 'fa-file-image';
    let color = 'bg-orange-50 text-orange-500';

    if (selectedFile.name.match(/\.(doc|docx)$/i)) { icon = 'fa-file-word'; color = 'bg-blue-50 text-blue-500'; }
    else if (selectedFile.name.match(/\.(pdf)$/i)) { icon = 'fa-file-pdf'; color = 'bg-red-50 text-red-500'; }

    container.innerHTML = `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm animate-in fade-in zoom-in duration-200">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 flex items-center justify-center rounded-xl ${color}">
                    <i class="fa-solid ${icon} text-xl"></i>
                </div>
                <div class="overflow-hidden">
                    <p class="text-sm font-bold text-gray-800 truncate w-48">${selectedFile.name}</p>
                    <p class="text-xs text-gray-400 font-medium">${size}</p>
                </div>
            </div>
            <button onclick="removeSelectedFile()" class="w-9 h-9 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>
        </div>
    `;
}

function removeSelectedFile() {
    selectedFile = null;
    document.getElementById('upload-file-input').value = "";
    updateSingleFileUI();
}

function resetForm() {
    selectedFile = null;
    const titleInput = document.getElementById('upload-image-title');
    if (titleInput) titleInput.value = '';
    const fileInput = document.getElementById('upload-file-input');
    if (fileInput) fileInput.value = "";
    updateSingleFileUI();
}

// --- SUBMIT ACTION (IMAGE UPLOAD) ---
async function uploadSubmitAction() {
    const titleInput = document.getElementById('upload-image-title');
    const submitBtn = document.getElementById('upload-submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');
    const title = titleInput.value.trim();

    if (!selectedFile) { showToast('Please select a file.', 'error'); return; }
    if (!title) { showToast('Please enter a title.', 'error'); return; }

    submitBtn.disabled = true;
    btnText.innerText = 'Uploading...';
    btnIcon.className = 'fa-solid fa-circle-notch fa-spin text-xs';

    try {
        const branch = getBranchFromUrl();
        const isGlobalPage = !branch;
        const token = localStorage.getItem('adminToken') || '';

        // 1. Get presigned S3 URL
        const presignUrl = API_BASE + `/api/upload/presign?filename=${encodeURIComponent(selectedFile.name)}&contentType=${encodeURIComponent(selectedFile.type || 'image/jpeg')}`;
        const presignRes = await fetch(presignUrl, {
            headers: { 'Authorization': token }
        });
        if (!presignRes.ok) throw new Error('Could not get upload URL: ' + presignRes.statusText);
        const { uploadUrl, fileUrl } = await presignRes.json();

        // 2. Upload file directly to S3 (or local mock S3)
        btnText.innerText = 'Uploading image...';
        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': selectedFile.type || 'image/jpeg' },
            body: selectedFile
        });
        if (!uploadRes.ok) throw new Error('Image upload to S3 failed');

        // 3. Save metadata to backend database
        btnText.innerText = 'Saving...';
        const saveUrl = isGlobalPage
            ? API_BASE + '/api/global/media'
            : API_BASE + `/api/branches/${encodeURIComponent(branch)}/media`;

        const saveRes = await fetch(saveUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ 
                title: title, 
                type: 'image', 
                url: fileUrl 
            })
        });
        if (!saveRes.ok) throw new Error('Failed to save image metadata: ' + saveRes.statusText);

        showToast('Image uploaded successfully!');
        resetForm();
        closeUploadModal();
        
        // Refresh items list on parent page if loadMedia() exists
        if (typeof loadMedia === 'function') {
            loadMedia();
        } else {
            window.location.reload();
        }
    } catch (err) {
        console.error(err);
        showToast('Upload failed: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        btnText.innerText = 'Upload Now';
        btnIcon.className = 'fa-solid fa-arrow-right text-xs';
    }
}

// --- VIDEO CONTROLS ---
function videoOpen(url) {
  const iframe = document.getElementById('videoIframe');
  if (url.includes('?')) {
    iframe.src = url + '&autoplay=1&mute=1';
  } else {
    iframe.src = url + '?autoplay=1&mute=1';
  }
  document.getElementById('videoOverlay').classList.remove('hidden');
}

function videoClose() {
  document.getElementById('videoOverlay').classList.add('hidden');
  document.getElementById('videoIframe').src = '';
}

function videoOverlay(event) {
  const container = document.getElementById('videoContainer');
  if (!container.contains(event.target)) {
    videoClose();
  }
}

function loadComponent(url, elementSelector) {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response.text();
    })
    .then(data => {
      const element = document.querySelector(elementSelector);
      if (element) {
        element.innerHTML = data;
      } else {
        throw new Error(`Element ${elementSelector} not found`);
      }
    })
    .catch(error => console.error('Error loading component:', error));
}

function currentPage() {
  // Works with both clean URLs (/orders/kalyan-nagar → 'orders') and legacy .html (/orders.html → 'orders')
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(Boolean);
  // Use first segment as page identifier (handles /orders/kalyan-nagar correctly)
  const firstSeg = (parts[0] || '').replace(/\.html$/, '');
  const rawPath = pathname.split('/').pop() || '';
  const currentClean = firstSeg || rawPath.replace(/\.html$/, '');

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isCleanActive = isLocal || window.location.hostname === 'tv.spydernet.in';
  const userBranch = getBranchFromUrl() || localStorage.getItem('userBranch') || '';

  document.querySelectorAll('.menu-link').forEach(link => {
      let href = link.getAttribute('href') || '';
      
      // Keep track of the original raw destination (e.g. '/image' or '/admin/waffles')
      const originalHref = href;
      
      // Clean it for active state comparison
      const hrefParts = href.split('/').filter(Boolean);
      let hrefClean = (hrefParts[hrefParts.length - 1] || '').replace(/\.html$/, '').split('?')[0];
      // special case: if it was just /branch or /admin/waffles
      if (hrefParts[0] === 'admin' && hrefParts[1] === 'waffles') hrefClean = 'waffles';
      else if (hrefParts[0] === 'branch') hrefClean = 'branch';
      else hrefClean = (hrefParts[0] || '').replace(/\.html$/, '').split('?')[0];

      if (hrefClean && hrefClean === currentClean) {
          link.classList.add('menu-active');
      } else {
          link.classList.remove('menu-active');
      }

      // Rewrite the URL if we need fallback routing and it's a root-relative link
      if (!isCleanActive && href.startsWith('/')) {
         // Determine target file
         let targetFile = '';
         if (originalHref === '/image') targetFile = '/image.html';
         else if (originalHref === '/video') targetFile = '/video.html';
         else if (originalHref === '/announcements') targetFile = '/announcements.html';
         else if (originalHref === '/admin/waffles') targetFile = '/admin/waffles.html';
         else if (originalHref === '/branch/menu') targetFile = '/branch/menu.html';
         else if (originalHref === '/branch') targetFile = '/branch.html';
         
         if (targetFile) {
             link.setAttribute('href', targetFile + (userBranch ? '?branch=' + encodeURIComponent(userBranch) : ''));
         }
      }
  });
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('-translate-x-full');
  document.getElementById('overlay').classList.toggle('hidden');
}

// --- BRANCH CONTROLS ---
function openModal() {
    document.getElementById('branchModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('branchModal').classList.add('hidden');
}

// Submit a new branch to the server
function handleBranchSubmit() {
    const branchName = document.getElementById('branchName').value.trim();
    const state = document.getElementById('stateName').value;

    if (branchName === "") {
        showToast("Please enter a branch name.", "error");
        return;
    }

    fetch(API_BASE + '/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName, state: state })
    })
    .then(res => {
        if (!res.ok) return res.json().then(data => { throw new Error(data.error || 'Failed to create branch'); });
        return res.json();
    })
    .then(data => {
        showToast(`Branch "${data.name}" added to ${data.state}!`);
        document.getElementById('branchName').value = "";
        closeModal();
        if (typeof loadBranches === 'function') {
            loadBranches();
        } else {
            window.location.reload();
        }
    })
    .catch(err => {
        console.error(err);
        showToast(err.message, "error");
    });
}

// --- CLONE MODAL POPUP ---
function openBranchPopup() {
    document.getElementById('branchPopupWrapper').classList.remove('hidden');
    loadBranchesForCloning();
}

function closeBranchPopup() {
    document.getElementById('branchPopupWrapper').classList.add('hidden');
}

function toggleAllCheckboxes(master) {
    const items = document.querySelectorAll('.branch-item');
    items.forEach(checkbox => {
        checkbox.checked = master.checked;
    });
}

function checkMasterStatus() {
    const master = document.getElementById('selectAllBtn');
    const items = document.querySelectorAll('.branch-item');
    const checkedCount = document.querySelectorAll('.branch-item:checked').length;
    
    if (master) {
        master.checked = (items.length === checkedCount);
        master.indeterminate = (checkedCount > 0 && checkedCount < items.length);
    }
}

// Load branches dynamically inside the cloning popup modal
function loadBranchesForCloning() {
    fetch(API_BASE + '/api/branches')
        .then(res => res.json())
        .then(branches => {
            const popupGrid = document.querySelector('#branchPopup .grid');
            if (!popupGrid) return;
            
            popupGrid.innerHTML = '';
            
            // Group branches by state
            const grouped = {};
            branches.forEach(b => {
                if (!grouped[b.state]) grouped[b.state] = [];
                grouped[b.state].push(b);
            });
            
            const currentBranchId = getActiveBranchId();
            
            // Build the dynamic grid columns
            Object.keys(grouped).forEach(state => {
                const col = document.createElement('div');
                col.className = 'space-y-4';
                
                let branchItemsHtml = '';
                grouped[state].forEach(b => {
                    // Don't show current branch in target clone list
                    if (b.id === currentBranchId) return;
                    
                    branchItemsHtml += `
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" class="branch-item clone-checkbox" value="${b.id}" onclick="checkMasterStatus()"> ${b.name}
                        </label>
                    `;
                });
                
                col.innerHTML = `
                    <h3 class="lg:text-2xl sm:text-xl text-lg font-medium literata text-[#D3540A]">${state}</h3>
                    <div class="flex flex-col lg:text-lg sm:text-base text-sm text-black capitalize sm:gap-y-2 gap-y-1">
                        ${branchItemsHtml || '<span class="text-gray-400 text-xs italic">No other branches</span>'}
                    </div>
                `;
                
                popupGrid.appendChild(col);
            });
            
            // Uncheck master box
            const master = document.getElementById('selectAllBtn');
            if (master) {
                master.checked = false;
                master.indeterminate = false;
            }
        })
        .catch(err => console.error("Error loading branches for cloning:", err));
}

// Clone all media from current branch to selected target branches
function applySelection() {
    const selectedBranches = [];
    document.querySelectorAll('.branch-item:checked').forEach(item => {
        selectedBranches.push(item.value);
    });

    if (selectedBranches.length === 0) {
        showToast("Please select at least one branch.", "error");
        return;
    }

    const isGlobal = window.location.pathname.includes('image') || window.location.pathname.includes('video');
    const currentBranch = getBranchFromUrl() || localStorage.getItem('userBranch') || (window.location.pathname.includes('details') ? 'Kalyan Nagar' : '');

    if (!currentBranch && !isGlobal) {
        showToast("No source branch detected.", "error");
        return;
    }

    const fetchUrl = isGlobal
        ? API_BASE + `/api/global/media`
        : API_BASE + `/api/branches/${encodeURIComponent(currentBranch)}/media`;

    fetch(fetchUrl)
        .then(res => res.json())
        .then(media => {
            if (media.length === 0) {
                showToast("No media found to clone.", "error");
                return;
            }
            executeClone(media.map(m => m.id), selectedBranches);
        })
        .catch(err => showToast("Failed to fetch media: " + err.message, "error"));
}

function executeClone(selectedMedia, selectedBranches) {
    fetch(API_BASE + '/api/global/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mediaIds: selectedMedia,
            targetBranches: selectedBranches
        })
    })
    .then(res => {
        if (!res.ok) throw new Error('Cloning failed');
        return res.json();
    })
    .then(data => {
        showToast(`Cloned ${selectedMedia.length} item(s) to ${selectedBranches.length} branch(es) successfully!`);
        closeBranchPopup();
    })
    .catch(err => {
        console.error(err);
        showToast('Cloning failed: ' + err.message, 'error');
    });
}

// Clone announcements from current branch (or global) to selected branches
function applyAnnouncementClone() {
    const selectedBranches = [];
    document.querySelectorAll('.branch-item:checked').forEach(item => {
        selectedBranches.push(item.value);
    });

    if (selectedBranches.length === 0) {
        showToast("Please select at least one branch.", "error");
        return;
    }

    // Use current branch as source, fallback to global
    const sourceBranch = getBranchFromUrl() || localStorage.getItem('userBranch') || 'global';

    fetch(`${API_BASE}/api/branches/${encodeURIComponent(sourceBranch)}/announcements`)
        .then(res => res.json())
        .then(anns => {
            const ids = anns.filter(a => a.id !== 'banner-settings').map(a => a.id);
            if (ids.length === 0) {
                showToast("No announcements to clone.", "error");
                return;
            }
            return fetch(API_BASE + '/api/global/clone-announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('adminToken') || '' },
                body: JSON.stringify({ announcementIds: ids, targetBranches: selectedBranches })
            });
        })
        .then(res => {
            if (!res || !res.ok) throw new Error('Clone failed');
            return res.json();
        })
        .then(data => {
            showToast(`Announcements cloned to ${selectedBranches.length} branch(es) successfully!`);
            closeBranchPopup();
        })
        .catch(err => showToast('Clone failed: ' + err.message, 'error'));
}

// --- VIDEO UPLOAD POPUP CONTROLS ---
let videoupSelectedVideo = null;
let videoupSelectedThumb = null;

function videoupOpenModal() {
    const videoupOverlay = document.getElementById('videoup-modal-overlay');
    videoupOverlay.classList.remove('hidden');
    videoupOverlay.classList.add('flex');
}

function videoupCloseModal() {
    const videoupOverlay = document.getElementById('videoup-modal-overlay');
    videoupOverlay.classList.add('hidden');
    videoupOverlay.classList.remove('flex');
    videoupResetForm();
}

function videoupHandleVideoSelection(input) {
    if (input.files && input.files[0]) {
        videoupSelectedVideo = input.files[0];
        videoupUpdateUI('video');
    }
}

function videoupHandleThumbSelection(input) {
    if (input.files && input.files[0]) {
        videoupSelectedThumb = input.files[0];
        videoupUpdateUI('thumb');
    }
}

function videoupUpdateUI(type) {
    if (type === 'video') {
        const videoupContainer = document.getElementById('videoup-video-display');
        if (!videoupSelectedVideo) { videoupContainer.innerHTML = ''; return; }
        videoupContainer.innerHTML = videoupGenerateFileRow(videoupSelectedVideo.name, 'fa-circle-play', 'text-blue-500', 'bg-blue-50', 'videoupRemoveVideo');
    } else {
        const videoupContainer = document.getElementById('videoup-thumb-display');
        if (!videoupSelectedThumb) { videoupContainer.innerHTML = ''; return; }
        videoupContainer.innerHTML = videoupGenerateFileRow(videoupSelectedThumb.name, 'fa-image', 'text-purple-500', 'bg-purple-50', 'videoupRemoveThumb');
    }
}

function videoupGenerateFileRow(name, icon, textColor, bgColor, removeFn) {
    return `
        <div class="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg ${bgColor} ${textColor}">
                    <i class="fa-solid ${icon} text-sm"></i>
                </div>
                <p class="text-[11px] font-bold text-gray-600 truncate">${name}</p>
            </div>
            <button onclick="${removeFn}()" class="text-gray-300 hover:text-red-500 transition-colors ml-2">
                <i class="fa-solid fa-circle-xmark"></i>
            </button>
        </div>
    `;
}

function videoupRemoveVideo() {
    videoupSelectedVideo = null;
    document.getElementById('videoup-video-input').value = "";
    videoupUpdateUI('video');
}

function videoupRemoveThumb() {
    videoupSelectedThumb = null;
    document.getElementById('videoup-thumb-input').value = "";
    videoupUpdateUI('thumb');
}

function videoupResetForm() {
    videoupSelectedVideo = null;
    videoupSelectedThumb = null;
    document.getElementById('videoup-title-input').value = '';
    document.getElementById('videoup-video-input').value = '';
    document.getElementById('videoup-thumb-input').value = '';
    videoupUpdateUI('video');
    videoupUpdateUI('thumb');
}

// --- VIDEO SUBMIT ACTION (presigned S3 upload to bypass Lambda payload limit) ---
async function videoupSubmitAction() {
    const videoupTitleVal = document.getElementById('videoup-title-input').value.trim();
    const videoupBtn = document.getElementById('videoup-submit-btn');
    const videoupTxt = document.getElementById('videoup-btn-text');
    const videoupIco = document.getElementById('videoup-btn-icon');

    if (!videoupSelectedVideo) { showToast('Please select an MP4 video.', 'error'); return; }
    if (!videoupSelectedThumb) { showToast('Please select a thumbnail image.', 'error'); return; }
    if (!videoupTitleVal) { showToast('Please enter a video title.', 'error'); return; }

    videoupBtn.disabled = true;
    videoupTxt.innerText = 'Uploading...';
    videoupIco.className = 'fa-solid fa-circle-notch fa-spin text-xs';

    try {
        const branch = getBranchFromUrl();
        const isGlobalPage = !branch;
        const token = localStorage.getItem('adminToken') || '';

        // 1. Get presigned URL for video
        const presignRes = await fetch(API_BASE + `/api/upload/presign?filename=${encodeURIComponent(videoupSelectedVideo.name)}&contentType=${encodeURIComponent(videoupSelectedVideo.type || 'video/mp4')}`, {
            headers: { 'Authorization': token }
        });
        if (!presignRes.ok) throw new Error('Could not get upload URL: ' + presignRes.statusText);
        const { uploadUrl: videoUploadUrl, fileUrl: videoFileUrl } = await presignRes.json();

        // 2. Upload video directly to S3
        videoupTxt.innerText = 'Uploading video...';
        const videoUploadRes = await fetch(videoUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': videoupSelectedVideo.type || 'video/mp4' },
            body: videoupSelectedVideo
        });
        if (!videoUploadRes.ok) throw new Error('Video upload to S3 failed');

        // 3. Upload thumbnail via Lambda (small file, fine through API)
        videoupTxt.innerText = 'Uploading thumbnail...';
        const thumbFormData = new FormData();
        thumbFormData.append('file', videoupSelectedThumb);
        thumbFormData.append('title', videoupTitleVal);
        thumbFormData.append('type', 'image');
        // Upload thumbnail to get its URL (re-use image upload endpoint temporarily)
        const thumbPresignRes = await fetch(API_BASE + `/api/upload/presign?filename=${encodeURIComponent(videoupSelectedThumb.name)}&contentType=${encodeURIComponent(videoupSelectedThumb.type || 'image/jpeg')}`, {
            headers: { 'Authorization': token }
        });
        if (!thumbPresignRes.ok) throw new Error('Could not get thumbnail upload URL: ' + thumbPresignRes.statusText);
        const { uploadUrl: thumbUploadUrl, fileUrl: thumbFileUrl } = await thumbPresignRes.json();
        
        const thumbUploadRes = await fetch(thumbUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': videoupSelectedThumb.type || 'image/jpeg' },
            body: videoupSelectedThumb
        });
        if (!thumbUploadRes.ok) throw new Error('Thumbnail upload failed');

        // 4. Save metadata to backend
        videoupTxt.innerText = 'Saving...';
        const saveUrl = isGlobalPage
            ? API_BASE + '/api/global/media'
            : API_BASE + `/api/branches/${encodeURIComponent(branch)}/media`;

        const saveRes = await fetch(saveUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ title: videoupTitleVal, type: 'video', url: videoFileUrl, thumbnail: thumbFileUrl })
        });
        if (!saveRes.ok) throw new Error('Failed to save video metadata: ' + saveRes.statusText);

        showToast('Video uploaded successfully!');
        videoupResetForm();
        videoupCloseModal();
        if (typeof loadMedia === 'function') loadMedia();
        else window.location.reload();

    } catch (err) {
        console.error(err);
        showToast('Upload failed: ' + err.message, 'error');
    } finally {
        videoupBtn.disabled = false;
        videoupTxt.innerText = 'Publish Video';
        videoupIco.className = 'fa-solid fa-paper-plane text-xs';
    }
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    const registerSW = () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    };
    if (document.readyState === 'complete') {
        registerSW();
    } else {
        window.addEventListener('load', registerSW);
    }
}