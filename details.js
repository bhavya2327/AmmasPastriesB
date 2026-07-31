// Branch-specific media management script

const urlBranch = getBranchFromUrl();
const isGlobalPage = window.location.pathname.includes('image') || 
                     window.location.pathname.includes('video') || 
                     (!urlBranch && (window.location.pathname.includes('announcements') || window.location.pathname.includes('orders')));

const branchName = urlBranch || (isGlobalPage ? 'global' : 'Kalyan Nagar');

// Only set branch name as title on the details page, not on global pages
if (!isGlobalPage) {
    const h1 = document.querySelector('h1');
    if (h1) h1.innerText = branchName;
}

const isVideoPage = window.location.pathname.includes('video');
const pathPartsDetails = window.location.pathname.split('/').filter(Boolean);
const isMediaPage = window.location.pathname.includes('media.html') ||
    (pathPartsDetails.length === 1 && 
     !['login','branch','portal','details','announcements','orders','image','video','apk','header','index1','ammas-pastries','admin'].includes(pathPartsDetails[0]) && 
     !pathPartsDetails[0].includes('.'));
const isAnnouncementsViewPage = window.location.pathname.startsWith('/announcements/') || window.location.pathname.includes('announcements-view.html');

const imgGrid = isVideoPage ? null : document.getElementById('card-grid');
const vidGrid = isVideoPage ? document.getElementById('card-grid') : document.getElementById('videocard-grid');
const logoGrid = isVideoPage ? null : document.getElementById('logo-setting-grid');
const annList = document.getElementById('announcement-list');

// --- LOAD DATA ---
function loadMedia() {
    const branch = getBranchFromUrl();
    const isGlobalPage = window.location.pathname.includes('image') || window.location.pathname.includes('video');

    const fetchUrl = isGlobalPage || !branch
      ? '/api/global/media'
      : `/api/branches/${encodeURIComponent(branch)}/media`;

    fetch(fetchUrl)
        .then(res => res.json())
        .then(media => {
            let displayMedia = media;
            if (isMediaPage) {
                displayMedia = media.filter(m => m.active === true);
            }
            const logoItem = media.find(m => m.id === 'logo');
            if (logoItem) {
                if (logoGrid) renderLogoSetting(logoItem);
                updateLogoUI(logoItem.active);
            }
            if (imgGrid) renderImages(displayMedia.filter(m => m.type === 'image' && m.id !== 'logo'));
            if (vidGrid) renderVideos(displayMedia.filter(m => m.type === 'video'));
        })
        .catch(err => console.error("Error loading media:", err));
}

function loadAnnouncements() {
    const branch = getBranchFromUrl() || branchName;
    if (!annList) return;

    fetch(`/api/branches/${encodeURIComponent(branch)}/announcements?_t=${Date.now()}`)
        .then(res => res.json())
        .then(anns => {
            const bannerSettings = anns.find(a => a.id === 'banner-settings');
            if (bannerSettings) {
                updateBannerUI(bannerSettings.active);
            }
            const normalAnns = anns.filter(a => a.id !== 'banner-settings');
            // On public view page: only show active announcements
            const displayAnns = isAnnouncementsViewPage
                ? normalAnns.filter(a => a.active === true)
                : normalAnns;
            renderAnnouncements(displayAnns);
        })
        .catch(err => console.error("Error loading announcements:", err));
}

// --- RENDER FUNCTIONS ---
function renderLogoSetting(item) {
    if (!logoGrid) return;
    logoGrid.innerHTML = `
        <div class="image-card animate-reveal flex flex-col items-center" data-id="${item.id}">
            <div class="relative group w-full cursor-pointer" onclick="toggleLogoClick('${item.id}')">
                <div class="aspect-[4/5] w-full rounded-[13px] overflow-hidden bg-gray-100 flex items-center justify-center p-6 group-hover:shadow-lg transition-all duration-300 border-2 ${item.active ? 'border-[#F36E21]' : 'border-transparent'}">
                    <img src="${item.url}" class="max-w-full max-h-full object-contain">
                </div>

                <label class="absolute bottom-0 right-0 p-[15px] rounded-[10px] rounded-br-0 bg-white cursor-pointer custom-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" id="logoCheckInput" class="hidden media-check" data-id="${item.id}" ${item.active ? 'checked' : ''} onchange="toggleLogoStateOnly('${item.id}', this.checked)">
                    <div class="checkbox-box w-5 h-5 bg-white border border-black rounded-[4px] flex items-center justify-center">
                        <i class="fa-solid fa-check text-[10px] ${item.active ? '' : 'hidden'}"></i>
                    </div>
                </label>
            </div>
            <button onclick="toggleLogoClick('${item.id}')" id="logoActionButton" class="w-full mt-3 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 border ${item.active ? 'bg-[#F36E21] text-white border-[#F36E21]' : 'bg-transparent text-gray-500 border-gray-300 hover:border-gray-500'}">
                ${item.active ? 'Selected' : 'Unselected'}
            </button>
        </div>
    `;
}

function renderImages(images) {
    if (!imgGrid) return;
    imgGrid.innerHTML = '';
    if (images.length === 0) {
        imgGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 text-sm italic">No images uploaded.</div>';
        return;
    }

    images.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'image-card animate-reveal flex flex-col items-center';
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute('data-id', item.id);

        const deleteBtnHtml = isGlobalPage ? `
            <button onclick="deleteCard('${item.id}', this)" class="trash-btn absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow opacity-100 lg:opacity-0 transition-opacity flex items-center justify-center hover:text-red-500">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        ` : '';

        const checkboxHtml = isMediaPage ? '' : `
            <label class="absolute bottom-0 right-0 p-[15px] rounded-[10px] rounded-br-0 bg-white cursor-pointer custom-checkbox">
                <input type="checkbox" class="hidden media-check" data-id="${item.id}" ${item.active ? 'checked' : ''} onchange="toggleMediaActive('${item.id}', this.checked)">
                <div class="checkbox-box w-5 h-5 bg-white border border-black rounded-[4px] flex items-center justify-center">
                    <i class="fa-solid fa-check text-[10px] ${item.active ? '' : 'hidden'}"></i>
                </div>
            </label>
        `;

        card.innerHTML = `
            <div class="relative group w-full">
                <div class="aspect-[4/5] w-full rounded-[13px] overflow-hidden group-hover:shadow-lg transition-all duration-300">
                    <img src="${item.url}" class="w-full rounded-[13px] h-full object-cover">
                </div>
                ${deleteBtnHtml}
                ${checkboxHtml}
            </div>
            <p class="lg:text-lg sm:text-base text-sm text-black mt-3 font-medium w-full truncate px-2 text-center capitalize">
                ${item.name}
            </p>
        `;

        imgGrid.appendChild(card);
    });

    // Make Sortable
    if (!isMediaPage) {
        new Sortable(imgGrid, {
            animation: 300,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            easing: "cubic-bezier(0.22,1,0.36,1)",
            onEnd: function() {
                const cards = [...imgGrid.querySelectorAll('.image-card')];
                const order = cards.map(c => c.getAttribute('data-id'));
                saveMediaOrder(order);
            }
        });
    }
}

function renderVideos(videos) {
    if (!vidGrid) return;
    vidGrid.innerHTML = '';
    if (videos.length === 0) {
        vidGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-6 text-sm italic">No videos uploaded.</div>';
        return;
    }

    videos.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'video-card animate-reveal flex flex-col items-center';
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute('data-id', item.id);

        const thumb = item.thumbnail || 'images/image.jpg';

        const deleteBtnHtml = isGlobalPage ? `
            <button onclick="deleteCard('${item.id}', this)" class="trash-btn absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow opacity-100 lg:opacity-0 transition-opacity flex items-center justify-center hover:text-red-500">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        ` : '';

        const checkboxHtml = isMediaPage ? '' : `
            <label class="absolute bottom-0 right-0 p-[15px] rounded-[10px] rounded-br-0 bg-white cursor-pointer custom-checkbox">
                <input type="checkbox" class="hidden media-check" data-id="${item.id}" ${item.active ? 'checked' : ''} onchange="toggleMediaActive('${item.id}', this.checked)">
                <div class="checkbox-box w-5 h-5 bg-white border border-black rounded-[4px] flex items-center justify-center">
                    <i class="fa-solid fa-check text-[10px] ${item.active ? '' : 'hidden'}"></i>
                </div>
            </label>
        `;

        card.innerHTML = `
            <div class="relative group w-full">
                <div class="aspect-[4/5] w-full rounded-[13px] overflow-hidden group-hover:shadow-lg transition-all duration-300">
                    <img src="${thumb}" class="w-full rounded-[13px] h-full object-cover">
                </div>
                ${deleteBtnHtml}
                <div onclick="videoOpen('${item.url}')" class="text-white bg-[#F36E21]/80 flex items-center justify-center lg:w-[50px] sm:w-[40px] w-[30px] aspect-square absolute bottom-0 left-0 right-0 top-0 m-auto rounded-full cursor-pointer">
                    <i class="fa-regular fa-circle-play lg:text-3xl sm:text-2xl text-xl"></i> 
                </div>
                ${checkboxHtml}
            </div>
            <p class="lg:text-lg sm:text-base text-sm text-black mt-3 font-medium w-full truncate px-2 text-center capitalize">
                ${item.name}
            </p>
        `;

        vidGrid.appendChild(card);
    });

    // Make Sortable
    if (!isMediaPage) {
        new Sortable(vidGrid, {
            animation: 300,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            easing: "cubic-bezier(0.22,1,0.36,1)",
            onEnd: function() {
                const cards = [...vidGrid.querySelectorAll('.video-card')];
                const order = cards.map(c => c.getAttribute('data-id'));
                saveMediaOrder(order);
            }
        });
    }
}

function renderAnnouncements(anns) {
    if (!annList) return;
    annList.innerHTML = '';

    // Show/hide empty state placeholder (used on details.html)
    const emptyEl = document.getElementById('announcement-empty');

    // Determine if we're on the details/branch page (not a dedicated announcements page)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // Never treat the standalone announcements page as a branch details page
    const isStandaloneAnnPage = window.location.pathname.includes('announcements');
    const isDetailsBranchPage = !isStandaloneAnnPage && (
        window.location.pathname.includes('details.html') ||
        (pathParts.length === 2 && pathParts[0] === 'admin') ||
        (pathParts.length === 1 &&
         !['login','branch','portal','announcements','orders','image','video','apk','ammas-pastries','media','admin'].includes(pathParts[0]))
    );

    if (anns.length === 0) {
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
        } else {
            annList.innerHTML = '<div class="text-center text-gray-400 py-6 text-sm italic">No announcements found.</div>';
        }
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    anns.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'bg-[#f2f2f2] p-4 flex justify-between items-center rounded-lg shadow-sm border border-gray-100 hover:border-[#F36E21]/30 transition-all';
        row.setAttribute('data-ann-id', item.id);

        if (isAnnouncementsViewPage) {
            // Read-only: just the text, no controls
            row.innerHTML = `
                <span class="text-black text-sm sm:text-base font-medium">${item.text}</span>
            `;
        } else if (isDetailsBranchPage) {
            // Branch details page: checkbox to toggle + text, no delete (global announcements)
            row.innerHTML = `
                <div class="flex items-start gap-4 flex-1">
                    <label class="cursor-pointer custom-checkbox mt-1">
                        <input type="checkbox" class="hidden announcements-checkbox" data-id="${item.id}" ${item.active ? 'checked' : ''} onchange="toggleAnnouncementActive('${item.id}', this.checked)">
                        <div class="checkbox-box w-5 h-5 bg-white border border-black rounded-[4px] flex items-center justify-center">
                            <i class="fa-solid fa-check text-[10px] ${item.active ? '' : 'hidden'}"></i>
                        </div>
                    </label>
                    <span class="text-black text-sm sm:text-base font-medium pr-4">${item.text}</span>
                </div>
                <span class="text-xs text-gray-400 whitespace-nowrap">${item.active ? '<span class="text-green-500 font-semibold">Active</span>' : 'Hidden'}</span>
            `;
        } else {
            // Full announcements page: checkbox + text + trash
            row.innerHTML = `
                <div class="flex items-start gap-4 flex-1">
                    <label class="cursor-pointer custom-checkbox mt-1">
                        <input type="checkbox" class="hidden announcements-checkbox" data-id="${item.id}" ${item.active ? 'checked' : ''} onchange="toggleAnnouncementActive('${item.id}', this.checked)">
                        <div class="checkbox-box w-5 h-5 bg-white border border-black rounded-[4px] flex items-center justify-center">
                            <i class="fa-solid fa-check text-[10px] ${item.active ? '' : 'hidden'}"></i>
                        </div>
                    </label>
                    <span class="text-black text-sm sm:text-base font-medium pr-4">${item.text}</span>
                </div>
                <button onclick="deleteAnnouncement('${item.id}', this.closest('[data-ann-id]'))" class="trash-btn w-8 h-8 bg-white rounded-full shadow flex items-center justify-center hover:text-red-500 transition-colors">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            `;
        }
        annList.appendChild(row);
    });
}

// --- CONTROLS IMPLEMENTATION ---

// Toggle media checkbox active state
function toggleMediaActive(mediaId, isActive) {
    const branch = getBranchFromUrl();
    const isGlobalPage = !branch;
    const token = localStorage.getItem('adminToken') || '';

    const url = isGlobalPage
      ? `/api/global/media/${mediaId}/toggle`
      : `/api/branches/${encodeURIComponent(branch)}/media/${mediaId}/toggle`;

    fetch(url, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ active: isActive })
    })
    .then(res => res.json())
    .then(data => {
        const cb = document.querySelector(`.media-check[data-id="${mediaId}"]`);
        if (cb) {
            const icon = cb.nextElementSibling.querySelector('i');
            if (isActive) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
            }
        }
        showToast("Visibility state updated!");
    })
    .catch(err => {
        console.error("Error toggling active state:", err);
        showToast("Error updating visibility: " + err.message, "error");
    });
}

// Delete image or video
function deleteCard(mediaId, btn) {
    const modal = document.getElementById('confirmDeleteModal');
    if (!modal) {
        if (!confirm("Are you sure you want to delete this media item?")) return;
        executeCardDelete(mediaId, btn);
        return;
    }

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.onclick = function() {
            executeCardDelete(mediaId, btn);
        };
    }
    modal.classList.remove('hidden');
}

function executeCardDelete(mediaId, btn) {
    const branch = getBranchFromUrl();
    const isGlobalPage = !branch;
    const card = btn.closest('.image-card, .video-card');
    const token = localStorage.getItem('adminToken') || '';

    const url = isGlobalPage
      ? `/api/global/media/${mediaId}`
      : `/api/branches/${encodeURIComponent(branch)}/media/${mediaId}`;

    fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': token
        }
    })
    .then(res => {
        if (!res.ok) throw new Error('Delete failed');
        closeConfirmDeleteModal();
        if (card) {
            card.style.transform = 'scale(.8)';
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                loadMedia();
                showToast("Media item deleted successfully!");
            }, 300);
        } else {
            loadMedia();
            showToast("Media item deleted successfully!");
        }
    })
    .catch(err => {
        closeConfirmDeleteModal();
        showToast("Error: " + err.message, "error");
    });
}

// Save media reordering from drag and drop
function saveMediaOrder(orderArray) {
    const branch = getBranchFromUrl();
    const isGlobalPage = !branch;
    const token = localStorage.getItem('adminToken') || '';

    const url = isGlobalPage
      ? `/api/global/media/order`
      : `/api/branches/${encodeURIComponent(branch)}/media/order`;

    fetch(url, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ order: orderArray })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Sorted order saved:", data);
        showToast("Display sequence updated successfully!");
    })
    .catch(err => {
        console.error("Error saving order:", err);
        showToast("Failed to save sequence: " + err.message, "error");
    });
}

// Submit announcement
function submitNewAnnouncement() {
    const textInput = document.getElementById('announcementInput');
    const text = textInput.value.trim();
    if (text === "") {
        showToast("Please enter a message before submitting.", "error");
        return;
    }

    const branch = getBranchFromUrl() || branchName;
    const token = localStorage.getItem('adminToken') || '';
    fetch(`/api/branches/${encodeURIComponent(branch)}/announcements`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ text: text })
    })
    .then(res => {
        if (!res.ok) throw new Error('Create announcement failed');
        return res.json();
    })
    .then(data => {
        textInput.value = "";
        loadAnnouncements();
        showToast("Announcement created successfully!");
    })
    .catch(err => showToast("Error: " + err.message, "error"));
}

// Toggle announcement active status
function toggleAnnouncementActive(annId, isActive) {
    const branch = getBranchFromUrl() || branchName;
    const token = localStorage.getItem('adminToken') || '';
    fetch(`/api/branches/${encodeURIComponent(branch)}/announcements/${annId}/toggle`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ active: isActive })
    })
    .then(res => res.json())
    .then(data => {
        const cb = document.querySelector(`.announcements-checkbox[data-id="${annId}"]`);
        if (cb) {
            const icon = cb.nextElementSibling.querySelector('i');
            if (isActive) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
            }
        }
        // Update the status label (Active/Hidden) shown on the branch details page
        const row = document.querySelector(`[data-ann-id="${annId}"]`);
        if (row) {
            const statusSpan = row.querySelector('span.text-xs.text-gray-400');
            if (statusSpan) {
                statusSpan.innerHTML = isActive
                    ? '<span class="text-green-500 font-semibold">Active</span>'
                    : 'Hidden';
            }
        }
        showToast("Announcement visibility updated!");
    })
    .catch(err => {
        console.error("Error toggling announcement active status:", err);
        showToast("Failed to update status: " + err.message, "error");
    });
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Delete announcement
function deleteAnnouncement(annId, rowElement) {
    const modal = document.getElementById('confirmDeleteModal');
    if (!modal) {
        // Fallback to browser confirm if modal is not present (e.g., loaded on other pages)
        if (!confirm("Are you sure you want to delete this announcement?")) return;
        executeAnnouncementDelete(annId, rowElement);
        return;
    }

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.onclick = function() {
            executeAnnouncementDelete(annId, rowElement);
        };
    }
    modal.classList.remove('hidden');
}

function executeAnnouncementDelete(annId, rowElement) {
    const branch = getBranchFromUrl() || branchName;
    const token = localStorage.getItem('adminToken') || '';
    fetch(`/api/branches/${encodeURIComponent(branch)}/announcements/${annId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': token
        }
    })
    .then(res => {
        if (!res.ok) throw new Error('Delete failed');
        if (rowElement) rowElement.remove();
        closeConfirmDeleteModal();
        loadAnnouncements();
        showToast("Announcement deleted!");
    })
    .catch(err => {
        closeConfirmDeleteModal();
        showToast("Error: " + err.message, "error");
    });
}

// Close delete modal on clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal && event.target === modal) {
        closeConfirmDeleteModal();
    }
});

// Bottom Submit Button for announcements lists (optional confirmation)
function updateAnnouncementList() {
    showToast("Announcements queue updated!");
}

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    loadMedia();
    if (document.getElementById('announcement-list')) {
        loadAnnouncements();
    }
});

// Logo toggling helpers
let isLogoActiveGlobal = true;

function updateLogoUI(isActive) {
    isLogoActiveGlobal = isActive;
    
    const btn = document.getElementById('logoToggleBtn');
    const knob = document.getElementById('logoToggleKnob');
    if (btn && knob) {
        if (isActive) {
            btn.style.backgroundColor = '#F36E21';
            knob.style.transform = 'translateX(20px)';
        } else {
            btn.style.backgroundColor = '#d1d5db';
            knob.style.transform = 'translateX(4px)';
        }
    }
}

function toggleLogoClick(mediaId) {
    const newState = !isLogoActiveGlobal;
    updateLogoUI(newState);
    toggleMediaActive(mediaId, newState);
}

function toggleLogoStateOnly(mediaId, checked) {
    updateLogoUI(checked);
    toggleMediaActive(mediaId, checked);
}

// Banner toggling helpers
let isBannerActiveGlobal = true;

function updateBannerUI(isActive) {
    isBannerActiveGlobal = isActive;
    const btn = document.getElementById('bannerToggleBtn');
    const knob = document.getElementById('bannerToggleKnob');
    if (btn && knob) {
        if (isActive) {
            btn.style.backgroundColor = '#F36E21';
            knob.style.transform = 'translateX(20px)';
        } else {
            btn.style.backgroundColor = '#d1d5db';
            knob.style.transform = 'translateX(4px)';
        }
    }
}

function toggleBannerClick() {
    const branch = getBranchFromUrl() || localStorage.getItem('userBranch') || branchName;
    if (!branch) return;
    const token = localStorage.getItem('adminToken') || '';
    const newState = !isBannerActiveGlobal;

    // Optimistically update UI
    updateBannerUI(newState);

    fetch(`/api/branches/${encodeURIComponent(branch)}/announcements/banner-settings/toggle`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ active: newState })
    })
    .then(res => {
        if (!res.ok) throw new Error('Toggle failed');
        return res.json();
    })
    .catch(err => {
        console.error("Error toggling banner settings:", err);
        updateBannerUI(!newState);
    });
}