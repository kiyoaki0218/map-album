/* static/js/app.js */


const markersMap = {};

// --- Hardcoded Admin List (visible to ALL users) ---
// Add admin usernames here after they enter the code once
// This is the ONLY way to make admin effects visible across all browsers
const HARDCODED_ADMIN_USERNAMES = [
    "user_7c7fkpiie",  // 管理者 (PC)
    "user_wqldnphp4"   // 管理者 (スマホ) - note: small L, not 1
];

// --- Hardcoded Supporter List (visible to ALL users) ---
// Supporters get a special badge but no admin powers
const HARDCODED_SUPPORTER_USERNAMES = [
    "user_nihj67h3l",  // 支援者
    "user_5ibklldsx"   // 支援者 - アヒンアヒン / カーメロアンソニー
];

// Merge hardcoded list with localStorage (for local testing)
let knownAdminUsernames = [
    ...HARDCODED_ADMIN_USERNAMES,
    ...JSON.parse(localStorage.getItem('map_album_known_admins') || '[]')
];
// Remove duplicates
knownAdminUsernames = [...new Set(knownAdminUsernames)];

// Debug: Log admin list on load
console.log("Map Album v1.3.5 - Known Admins:", knownAdminUsernames);
console.log("Map Album v1.3.5 - Supporters:", HARDCODED_SUPPORTER_USERNAMES);

// --- Global Helpers (Available immediately) ---

window.showInfoModal = () => {
    const modal = document.getElementById('info-modal');
    if (modal) {
        const userIdDisplay = document.getElementById('user-id-display');
        const userId = localStorage.getItem('map_album_user');
        if (userIdDisplay) {
            userIdDisplay.textContent = userId || '(未設定)';
        }
        modal.classList.add('active');
    }
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

window.fetchUserProfile = async function () {
    if (!currentUser) return;
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(currentUser)}`);
        if (response.ok) {
            const user = await response.json();
            const profile = JSON.parse(localStorage.getItem('map_album_profile') || '{}');
            if (profile.username === currentUser) {
                localStorage.setItem('map_album_profile', JSON.stringify(profile));
            }
        }
    } catch (e) {
        console.error("Failed to fetch user profile", e);
    }
};

window.downloadImage = async function () {
    const imgEl = document.getElementById('modal-image');
    if (!imgEl || !imgEl.src) return;
    let src = imgEl.src;

    if (src.includes('cloudinary.com')) {
        if (src.includes('/upload/') && !src.includes('fl_attachment')) {
            src = src.replace('/upload/', '/upload/fl_attachment/');
            window.location.href = src;
            return;
        }
    }

    try {
        const response = await fetch(src);
        if (!response.ok) throw new Error("CORS error");
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = src.split('/').pop() || "photo.jpg";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        window.open(src, '_blank');
    }
};


let currentViewedMedia = null;

function openImageModal(mediaId) {
    const media = allMediaCache.find(m => m.id === mediaId);
    if (!media) return;
    
    currentViewedMedia = media;

    const modal = document.getElementById('image-modal');
    const imgParam = document.getElementById('modal-image');
    const descParam = document.getElementById('modal-desc');

    imgParam.src = media.filepath;
    descParam.innerText = media.description || '';

    // Manage buttons
    const unlockBtn = document.getElementById('unlock-btn');
    const tipBtn = document.getElementById('tip-btn');
    const dlBtn = document.getElementById('download-btn');

    if (media.is_secret && !media.unlocked_by_me) {
        unlockBtn.style.display = 'flex';
        tipBtn.style.display = 'none';
        dlBtn.style.display = 'none';
    } else {
        unlockBtn.style.display = 'none';
        tipBtn.style.display = 'flex';
        dlBtn.style.display = 'flex';
    }

    modal.classList.add('active');
}

async function signAndSendKC(toAddress, amountStr) {
    const kcSecretBase64 = localStorage.getItem('kc_secret');
    if (!kcSecretBase64) {
        alert("KC秘密鍵が設定されていません。プロフィールから設定してください。");
        return null;
    }
    
    try {
        const secretBytes = nacl.util.decodeBase64(kcSecretBase64);
        const keyPair = nacl.sign.keyPair.fromSecretKey(secretBytes);
        const publicKeyBase64 = nacl.util.encodeBase64(keyPair.publicKey);
        const fromAddress = localStorage.getItem('kc_address');
        
        // Construct transaction message: fromAddress:toAddress:amountStr:nonceStr
        const nonceStr = Date.now().toString();
        const msgStr = `${fromAddress}:${toAddress}:${amountStr}:${nonceStr}`;
        const msgBytes = nacl.util.decodeUTF8(msgStr);
        
        const signatureBytes = nacl.sign.detached(msgBytes, keyPair.secretKey);
        const signatureBase64 = nacl.util.encodeBase64(signatureBytes);
        
        const payload = {
            from: fromAddress,
            to: toAddress,
            amount: amountStr,
            nonce: nonceStr,
            signature: signatureBase64,
            publicKey: publicKeyBase64
        };
        
        // POST to MapAlbum Backend Proxy
        const kcResponse = await fetch('/api/kc-proxy/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!kcResponse.ok) {
            const err = await kcResponse.text();
            throw new Error(err);
        }
        
        return await kcResponse.json();
    } catch (e) {
        console.error("KC Send Error:", e);
        alert("送金エラー: " + e.message);
        return null;
    }
}

window.showTipModal = function() {
    closeModal('image-modal');
    const modal = document.getElementById('tip-modal');
    if (modal) modal.classList.add('active');
};

window.sendTip = async function() {
    if (!currentViewedMedia || !currentViewedMedia.owner || !currentViewedMedia.owner.kc_address) {
        alert("この投稿者はKCウォレットを連携していません。");
        return;
    }
    
    const amountInput = document.getElementById('tip-amount').value;
    if (!amountInput || amountInput <= 0) {
        alert("正しい金額を入力してください。");
        return;
    }
    
    const submitBtn = document.getElementById('tip-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "送金中...";
    
    const result = await signAndSendKC(currentViewedMedia.owner.kc_address, amountInput);
    
    submitBtn.disabled = false;
    submitBtn.innerText = "送金する";
    
    if (result) {
        alert("投げ銭を送りました！");
        closeModal('tip-modal');
    }
};

window.unlockSecretPhoto = async function() {
    if (!currentViewedMedia || !currentViewedMedia.owner || !currentViewedMedia.owner.kc_address) {
        alert("この投稿者はKCウォレットを連携していません。");
        return;
    }
    
    const unlockBtn = document.getElementById('unlock-btn');
    unlockBtn.disabled = true;
    unlockBtn.innerText = "送金確認中...";
    
    // 1. Send 100 KC to the owner
    const result = await signAndSendKC(currentViewedMedia.owner.kc_address, "100");
    
    if (result) {
        // 2. Report unlock to MapAlbum backend
        try {
            const unlockRes = await fetch(`/api/media/${currentViewedMedia.id}/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUser,
                    tx_id: result.txId || "unknown_tx"
                })
            });
            
            if (unlockRes.ok) {
                alert("ロックを解除しました！");
                closeModal('image-modal');
                fetchMedia(); // Refresh to get the clear image
            } else {
                alert("MapAlbumでのロック解除記録に失敗しました。管理者に連絡してください。");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました。");
        }
    }
    
    unlockBtn.disabled = false;
    unlockBtn.innerText = "100 KCで見る";
};

window.toggleCommentSection = function (mediaId) {
    const el = document.getElementById(`comment-section-${mediaId}`);
    if (el) {
        if (el.style.display === "none") {
            el.style.display = "block";
        } else {
            el.style.display = "none";
        }
    }
};

// Helper: Check if a username is a known admin
function isKnownAdmin(username) {
    const result = knownAdminUsernames.includes(username);
    // Debug: Log every check to see what usernames are being compared
    console.log(`isKnownAdmin check: "${username}" -> ${result}`);
    return result;
}

// Helper: Check if a username is a supporter
function isSupporter(username) {
    return HARDCODED_SUPPORTER_USERNAMES.includes(username);
}

// Version List Accordion
window.toggleVersionGroup = function (id) {
    const content = document.getElementById(id);
    const header = document.querySelector(`[onclick="toggleVersionGroup('${id}')"]`);
    if (content) {
        if (content.style.display === "none") {
            content.style.display = "block";
            header.classList.add('active');
        } else {
            content.style.display = "none";
            header.classList.remove('active');
        }
    }
};


// --- Like Users Modal (Admin Only) ---

window.showLikeUsers = function (media) {
    const isOwner = media.owner && media.owner.username === currentUser;
    if (!isKnownAdmin(currentUser) && !isOwner) {
        alert("この機能は投稿者と管理者限定です。");
        return;
    }

    const modal = document.getElementById('like-users-modal');
    const list = document.getElementById('like-users-list');

    if (!modal || !list) return;

    // Get likes from the media object (stored during fetchMedia)
    if (!media.likes || media.likes.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center;">まだ誰もいいねしていません</p>';
    } else {
        let html = '';
        media.likes.forEach(like => {
            const user = like.user || {};
            const username = user.username || '';
            const isLikerAdmin = user.username && isKnownAdmin(user.username);
            const isLikerSupporter = user.username && isSupporter(user.username);
            const likerIcon = isLikerAdmin ? '👑' : (isLikerSupporter ? '⭐' : (user.icon || '👤'));
            const likerNameClass = 'admin-badge-text'; // Simplified class
            const likerBadge = isLikerAdmin
                ? '<span class="admin-badge" style="font-size:0.5rem;">ADMIN</span>'
                : (isLikerSupporter ? '<span class="supporter-badge" style="font-size:0.5rem;">支援者</span>' : '');

            html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 1.5rem;">${likerIcon}</span>
                    <span class="${likerNameClass}">${user.display_name || user.username || '不明'}</span>
                    ${likerBadge}
                </div>
            `;
        });
        list.innerHTML = html;
    }

    modal.classList.add('active');
};

// Helper to find media from marker and show like users
window.showLikeUsersForMedia = function (mediaId, latLngKey) {
    const marker = markersMap[latLngKey];
    if (marker && marker.mediaGroup) {
        const media = marker.mediaGroup.find(m => m.id === mediaId);
        if (media) {
            showLikeUsers(media);
        }
    }
};

// --- Posts List Modal ---

let allMediaCache = [];  // Cache all media for the posts list
let currentPostsSort = 'time';  // 'time' or 'popular'
let sortAscending = false;  // false = newest first (▼), true = oldest first (▲)

window.showPostsListModal = async function () {
    const modal = document.getElementById('posts-list-modal');
    if (modal) modal.classList.add('active');

    // Fetch and display posts
    await loadPostsList();
};

async function loadPostsList() {
    try {
        let url = '/api/media/?t=' + new Date().getTime();
        if (currentUser) {
            url += '&username=' + encodeURIComponent(currentUser);
        }
        const response = await fetch(url);
        allMediaCache = await response.json();

        renderPostsGrid();
    } catch (err) {
        console.error("Failed to load posts:", err);
    }
}

function renderPostsGrid() {
    const grid = document.getElementById('posts-grid');
    if (!grid) return;

    // Filter out media without location
    let posts = allMediaCache.filter(m => m.latitude && m.longitude);

    // Sort based on current mode
    if (currentPostsSort === 'popular') {
        posts.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    } else {
        // Time sort - respect direction
        if (sortAscending) {
            // Oldest first (▲)
            posts.sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at));
        } else {
            // Newest first (▼)
            posts.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
        }
    }

    let html = '';
    posts.forEach(media => {
        const thumbUrl = media.filepath.includes('cloudinary')
            ? media.filepath.replace('/upload/', '/upload/w_200,h_200,c_fill/')
            : media.filepath;

        html += `
            <div class="post-item" onclick="navigateToPost(${media.latitude}, ${media.longitude}, ${media.id})">
                <img src="${thumbUrl}" alt="" loading="lazy">
                ${media.like_count > 0 ? `<div class="post-likes">❤️ ${media.like_count}</div>` : ''}
            </div>
        `;
    });

    if (posts.length === 0) {
        html = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">投稿がありません</p>';
    }

    grid.innerHTML = html;
}

window.setPostsSort = function (sortType) {
    currentPostsSort = sortType;

    // Update tab UI
    document.querySelectorAll('.sort-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`sort-tab-${sortType}`).classList.add('active');

    renderPostsGrid();
};

window.toggleSortDirection = function () {
    sortAscending = !sortAscending;

    // Update button UI
    const btn = document.getElementById('sort-direction-btn');
    if (btn) {
        btn.textContent = sortAscending ? '▲' : '▼';
        btn.title = sortAscending ? '古い順（クリックで新しい順）' : '新しい順（クリックで古い順）';
    }

    // Also switch to time sort if not already
    if (currentPostsSort !== 'time') {
        setPostsSort('time');
    } else {
        renderPostsGrid();
    }
};

window.navigateToPost = function (lat, lng, mediaId) {
    // Close any open modals
    closeModal('posts-list-modal');


    // Pan map to location
    if (map) {
        map.panTo({ lat, lng });
        map.setZoom(17); // Zoom in more to avoid clustering issues
    }

    // Find the marker containing this mediaId (may be clustered)
    setTimeout(() => {
        let foundMarker = null;
        let foundIndex = -1;

        // Search through all markers
        for (const key in markersMap) {
            const marker = markersMap[key];
            if (marker.mediaGroup) {
                const idx = marker.mediaGroup.findIndex(m => m.id === mediaId);
                if (idx >= 0) {
                    foundMarker = marker;
                    foundIndex = idx;
                    break;
                }
            }
        }

        if (foundMarker) {
            foundMarker.currentIndex = foundIndex;
            // Trigger click to open InfoWindow
            google.maps.event.trigger(foundMarker, 'click');
        } else {
            console.warn('Marker not found for mediaId:', mediaId);
        }
    }, 800); // Longer delay to allow clustering to settle after zoom
};

// --- Initialization ---

let map;
let currentInfoWindow = null; // Track currently open info window
let currentUser = localStorage.getItem('map_album_user');
// Auth Check - use helper
let isAdmin = currentUser ? isKnownAdmin(currentUser) : false;

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded");

    // Auth Check
    if (currentUser) {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.classList.remove('active');
        updateUserDisplay();
    }

    // UI Listeners (if any specific ones needed outside of inline onclick)
});

function initMap() {
    console.log("initMap called");
    // Default to Tokyo
    const initialPos = { lat: 35.6895, lng: 139.6917 };

    // Check if API key is replaced
    const script = document.getElementById('gmap-script');
    if (script && script.src.includes('YOUR_API_KEY')) {
        alert("Google Maps API Keyが設定されていません。index.htmlのYOUR_API_KEYを書き換えてください。");
        const warning = document.getElementById('api-key-warning');
        if (warning) warning.style.display = 'block';
    }

    map = new google.maps.Map(document.getElementById("map"), {
        center: initialPos,
        zoom: 13,
        // mapId: 'DEMO_MAP_ID', // Removed to avoid conflict with styles property
        disableDefaultUI: false,
        gestureHandling: 'greedy', // Enable 1-finger touch
        styles: [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            {
                featureType: "administrative.locality",
                elementType: "labels.text.fill",
                stylers: [{ color: "#d59563" }],
            },
        ],
    });

    // Try HTML5 geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                map.setCenter(pos);
            },
            () => {
                console.log("Geolocation permission denied or error.");
            }
        );
    }

    // Load markers
    fetchMedia();

    // Auto-refresh every 2 seconds as requested
    setInterval(fetchMedia, 2000);

    // Recalculate clusters when zoom or pan stops (v1.3.0 Clustering)
    map.addListener('idle', () => {
        updateMarkers();
    });
}

// --- Auth Handling ---

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Use existing ID if available, otherwise generate new
    let username = localStorage.getItem('map_album_user');
    if (!username) {
        username = 'user_' + Math.random().toString(36).substr(2, 9);
    }

    const displayName = document.getElementById('display-name').value;
    const selectedIcon = document.querySelector('input[name="icon"]:checked').value;
    const kcSecret = document.getElementById('kc-secret').value;

    let kcAddress = null;
    let publicKeyBase64 = null;

    if (kcSecret) {
        try {
            const secretBytes = nacl.util.decodeBase64(kcSecret);
            const keyPair = nacl.sign.keyPair.fromSecretKey(secretBytes);
            publicKeyBase64 = nacl.util.encodeBase64(keyPair.publicKey);
            
            const binaryString = window.atob(publicKeyBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            kcAddress = hashHex.slice(0, 40);
            
            localStorage.setItem('kc_secret', kcSecret);
            localStorage.setItem('kc_public', publicKeyBase64);
            localStorage.setItem('kc_address', kcAddress);
        } catch (err) {
            console.error(err);
            alert("KC秘密鍵の形式が不正です。Base64形式の64バイトキーを入力してください。");
            return;
        }
    } else {
        kcAddress = localStorage.getItem('kc_address');
    }

    // Register/Login via API
    try {
        const response = await fetch('/api/users/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                password: 'password123', // Dummy password for this demo
                display_name: displayName,
                icon: selectedIcon,
                kc_address: kcAddress
            })
        });

        if (response.ok || response.status === 400) {
            currentUser = username;

            // Save rich profile to local storage
            const userProfile = {
                username: username,
                display_name: displayName,
                icon: selectedIcon
            };
            localStorage.setItem('map_album_profile', JSON.stringify(userProfile));
            localStorage.setItem('map_album_user', username);

            // Update local admin state
            isAdmin = isKnownAdmin(username);

            const loginModal = document.getElementById('login-modal');
            if (loginModal) loginModal.classList.remove('active');

            // Initial UI update from local storage
            updateUserDisplay();

            // Fetch latest user data
            fetchUserProfile(true);

        } else {
            alert("登録に失敗しました。");
        }
    } catch (err) {
        console.error(err);
        alert("エラーが発生しました。");
    }
});


// Helper to get formatted user name HTML
function getUserNameHtml(user) {
    if (!user) return '<span class="user-name">Unknown</span>';

    // Check flags
    const isAdmin = isKnownAdmin(user.username);
    const isSupporterUser = isSupporter(user.username);

    // Determine class
    let nameClass = 'user-name';
    if (isAdmin) nameClass += ' admin-name';
    if (isSupporterUser) nameClass += ' supporter-name';

    // Badge
    let badge = '';
    if (isAdmin) badge = '<span class="admin-badge">ADMIN</span>';
    else if (isSupporterUser) badge = '<span class="supporter-badge">支援者</span>';

    // Color style (inline for safety)
    let style = '';
    if (isAdmin) style = 'color: #ef4444; font-weight: bold; font-family: "Courier New", monospace; letter-spacing: -0.5px;';

    return `<span class="${nameClass}" style="${style}">${user.display_name || user.username}</span> ${badge}`;
}

function updateUserDisplay() {
    const currentUsernameSpan = document.getElementById('current-username');
    if (!currentUsernameSpan) return;

    // Get profile from local storage
    const profile = JSON.parse(localStorage.getItem('map_album_profile') || 'null');

    if (profile) {
        let displayHtml = `${profile.icon || '👤'} ${profile.display_name || currentUser}`;
        currentUsernameSpan.innerHTML = displayHtml;
    } else {
        currentUsernameSpan.innerText = currentUser;
    }
    currentUsernameSpan.parentElement.style.display = 'flex';
}


function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.add('active');

        // Pre-fill if profile exists
        const profile = JSON.parse(localStorage.getItem('map_album_profile'));
        if (profile) {
            document.getElementById('display-name').value = profile.display_name || '';
            if (profile.icon) {
                const radio = document.querySelector(`input[name="icon"][value="${profile.icon}"]`);
                if (radio) radio.checked = true;
            }
            const btn = document.querySelector('#login-form button');
            if (btn) btn.innerText = "更新する";
        }
        
        const kcSecretInput = document.getElementById('kc-secret');
        if (kcSecretInput) {
            if (localStorage.getItem('kc_secret')) {
                kcSecretInput.placeholder = "保存済み（変更する場合のみ入力）";
            } else {
                kcSecretInput.placeholder = "省略可能ですが、投げ銭に必要です";
            }
            kcSecretInput.value = ''; // Always clear it for security
        }
    }
}

// --- Upload Handling (Consolidated logic at bottom) ---


// Helper: Compress Image
async function compressImage(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize logic
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

const uploadForm = document.getElementById('upload-form');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const submitBtn = e.target.querySelector('button[type="submit"]');

        // Cooldown check
        if (submitBtn.disabled) return;

        // Disable and set cooldown
        submitBtn.disabled = true;
        const originalText = submitBtn.innerText;
        submitBtn.innerText = "送信中...";

        setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }, 5000);

        const fileInput = document.getElementById('photo-file');
        const descInput = document.getElementById('photo-desc');
        const secretInput = document.getElementById('photo-secret');
        let latInput = document.getElementById('upload-lat');
        let lngInput = document.getElementById('upload-lng');

        const originalFile = fileInput.files[0];
        let fileToUpload = originalFile;

        // Compress if image
        if (originalFile && originalFile.type.startsWith('image/')) {
            submitBtn.innerText = "圧縮中...";
            try {
                const compressedBlob = await compressImage(originalFile);
                // Re-create File object to preserve name
                fileToUpload = new File([compressedBlob], originalFile.name, { type: 'image/jpeg' });
                console.log(`Compressed: ${(originalFile.size / 1024).toFixed(1)}KB -> ${(fileToUpload.size / 1024).toFixed(1)}KB`);
                submitBtn.innerText = "送信中...";
            } catch (err) {
                console.error("Compression failed", err);
                submitBtn.innerText = "送信中...";
            }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('username', currentUser);
        formData.append('description', descInput.value);
        if (secretInput && secretInput.checked) {
            formData.append('is_secret', 'true');
        }

        // Fallback: If no GPS/Location, use Map Center
        let finalLat = latInput.value;
        let finalLng = lngInput.value;

        if (!finalLat || !finalLng || finalLat === "0") {
            const center = map.getCenter();
            finalLat = center.lat();
            finalLng = center.lng();
            console.log("Using map center for upload location:", finalLat, finalLng);
        }

        formData.append('latitude', finalLat);
        formData.append('longitude', finalLng);
        formData.append('taken_at', new Date().toISOString());

        try {
            const response = await fetch('/api/upload/', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                alert("アップロードしました！");

                // Reset form and file input
                fileInput.value = '';
                descInput.value = '';
                closeModal('upload-modal');
                fetchMedia(); // Refresh map
            } else {
                const errText = await response.text();
                alert("アップロードに失敗しました: " + errText);
            }
        } catch (err) {
            console.error(err);
            alert("エラーが発生しました。");
        }
    });
}

// --- Map Markers ---


async function fetchMedia() {
    try {
        // Include username to get liked_by_me status
        let url = '/api/media/?t=' + new Date().getTime();
        if (currentUser) {
            url += '&username=' + encodeURIComponent(currentUser);
        }
        const response = await fetch(url);
        allMediaCache = await response.json(); // Update global cache

        updateMarkers();
    } catch (err) {
        console.error(err);
        // alert("エラーが発生しました。"); // Suppress initial load error alert to avoid spam
    }
}

// Clustering Logic
function updateMarkers() {
    if (!map || !allMediaCache) return;

    const zoom = map.getZoom();
    // Calculate cluster radius based on zoom
    // Equator: 156543.034 meters/pixel at zoom 0
    // At latitude L, meters/pixel = 156543.034 * cos(L) / 2^zoom
    // We use a simplified calculation assuming roughly 40-60px cluster distance

    // Approximate meters per pixel at equator
    const metersPerPx = 156543 / Math.pow(2, zoom);
    const clusterLimitMeters = metersPerPx * 30; // 30px cluster radius (less aggressive)

    const processed = new Set();
    const newGroups = {}; // key -> media array

    // Filter valid media first
    const validMedia = allMediaCache.filter(m => m.latitude && m.longitude);

    // Sort by newness so the newest item usually becomes the cluster center/key
    validMedia.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

    validMedia.forEach(media => {
        if (processed.has(media.id)) return;

        const cluster = [media];
        processed.add(media.id);

        // Find neighbors using simple distance calculation
        validMedia.forEach(other => {
            if (processed.has(other.id)) return;

            // Haversine-like approximation (simplified for small distances)
            const lat1 = media.latitude * Math.PI / 180;
            const lat2 = other.latitude * Math.PI / 180;
            const dLat = (other.latitude - media.latitude) * Math.PI / 180;
            const dLng = (other.longitude - media.longitude) * Math.PI / 180;

            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const dist = 6371000 * c; // Earth radius in meters

            if (dist <= clusterLimitMeters) {
                cluster.push(other);
                processed.add(other.id);
            }
        });

        // Use the center media's coordinates as the key
        const key = `${media.latitude},${media.longitude}`;
        newGroups[key] = cluster;
    });

    // 1. Remove markers not in new groups
    for (const key in markersMap) {
        if (!newGroups[key]) {
            markersMap[key].setMap(null);
            delete markersMap[key];
        }
    }

    // 2. Add or Update markers
    for (const key in newGroups) {
        const group = newGroups[key];
        // Center position is the key's coordinates (the first item in group)
        const [lat, lng] = key.split(',').map(Number);

        if (markersMap[key]) {
            // Update existing
            markersMap[key].mediaGroup = group;
            markersMap[key].locationKey = key; // Ensure key is updated
            updateMarkerIcon(markersMap[key], group.length);
        } else {
            // Create new
            const marker = new google.maps.Marker({
                position: { lat, lng },
                map: map,
                // title: group[0].description, // Removed simple title
            });

            marker.mediaGroup = group;
            marker.locationKey = key; // Store exact key to avoid float precision issues
            markersMap[key] = marker; // Store by location key

            // Initial Icon
            updateMarkerIcon(marker, group.length);

            // Click Listener
            const infowindow = new google.maps.InfoWindow({ minWidth: 200 });
            marker.infowindow = infowindow;
            marker.currentIndex = 0;

            marker.addListener('click', (e) => {
                // Close previous info window
                if (currentInfoWindow && currentInfoWindow !== infowindow) {
                    currentInfoWindow.close();
                }
                currentInfoWindow = infowindow;

                // Cycle through images on repeated clicks
                if (e && infowindow.getMap()) {
                    marker.currentIndex = (marker.currentIndex + 1) % marker.mediaGroup.length;
                }
                updateInfoWindowContent(marker, infowindow);
                if (!infowindow.getMap()) {
                    infowindow.open({ anchor: marker, map });
                }
            });
        }
    }
}

function updateMarkerIcon(marker, count) {
    // Color logic: 1=Red, 2-3=Blue, 4+=Purple
    let url = "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
    if (count >= 4) {
        url = "http://maps.google.com/mapfiles/ms/icons/purple-dot.png";
    } else if (count >= 2) {
        url = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
    }

    if (marker.getIcon() !== url) {
        marker.setIcon(url);
    }
}

function updateInfoWindowContent(marker, infowindow) {
    const media = marker.mediaGroup[marker.currentIndex];
    const total = marker.mediaGroup.length;

    const isOwner = media.owner && media.owner.username === currentUser;

    const ownerName = media.owner ? media.owner.display_name : `User ${media.owner_id}`;
    const ownerIcon = media.owner ? media.owner.icon : '👤';

    // Comment HTML Generation
    let commentsHtml = `
        <div id="comment-section-${media.id}" style="display: none; margin-top: 8px;">
            <div class="comments-list" style="max-height: 100px; overflow-y: auto; margin-bottom: 5px; font-size: 0.8rem; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 5px;">
    `;

    if (media.comments && media.comments.length > 0) {
        media.comments.forEach(c => {
            const cOwnerName = c.owner ? c.owner.display_name : 'Unknown';
            const cOwnerIcon = c.owner ? c.owner.icon : '👤';
            const isCommentOwner = c.owner && c.owner.username === currentUser;

            // Use getUserNameHtml for consistent effects
            const cNameHtml = getUserNameHtml(c.owner);

            // Icon Prefix (Left of name) - Use helper checks
            const isCommentOwnerAdmin = c.owner && isKnownAdmin(c.owner.username);
            const isCommentOwnerSupporter = c.owner && isSupporter(c.owner.username);
            const cIconDisplay = isCommentOwnerAdmin ? '👑' : (isCommentOwnerSupporter ? '⭐' : cOwnerIcon);

            commentsHtml += `
                <div style="margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; position: relative; word-break: break-all; overflow-wrap: break-word;">
                    <div style="margin-bottom:2px;">
                        <strong>${cIconDisplay} ${cNameHtml}</strong>: <span style="font-weight:normal;">${c.content}</span>
                    </div>
                    ${isCommentOwner || isAdmin ? `
                        <button onclick="deleteComment(${c.id}, '${marker.locationKey}')" 
                                style="background:none; border:none; color:#f87171; cursor:pointer; font-size:10px; padding:0; position:absolute; right:0; top:0;">[削除]</button>
                    ` : ''}
                </div>
             `;
        });
    } else {
        commentsHtml += `<div style="color: #94a3b8; text-align: center;">コメントはまだありません</div>`;
    }

    commentsHtml += `
            </div>
             <div style="display: flex; gap: 5px; margin-bottom: 5px; align-items: center;">
                <input type="text" id="comment-input-${media.id}" placeholder="コメント..." style="flex: 1; min-width: 0; padding: 4px; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: white;">
                <button onclick="postComment(${media.id}, '${marker.locationKey}')" style="background: var(--primary-color); border: none; color: white; border-radius: 4px; cursor: pointer; padding: 4px 8px; white-space: nowrap;">送信</button>
            </div>
        </div>`;

    // Process filepath for display vs download
    const displayPath = media.filepath.startsWith('http') ? media.filepath : '/' + media.filepath;

    // User Name with Effects
    // Use getUserNameHtml for consistent name display (colors, badges)
    const nameHtml = getUserNameHtml(media.owner);

    // Icon Prefix (Left of name) - Use helper checks
    const isPostOwnerAdmin = media.owner && isKnownAdmin(media.owner.username);
    const isPostOwnerSupporter = media.owner && isSupporter(media.owner.username);
    const iconPrefix = isPostOwnerAdmin ? '👑' : (isPostOwnerSupporter ? '⭐' : ownerIcon);

    // Date Format - Server stores UTC, so we need to convert to local time
    // Append 'Z' to indicate UTC if not already present, then convert to local
    let uploadedAt = media.uploaded_at;
    if (uploadedAt && !uploadedAt.endsWith('Z') && !uploadedAt.includes('+')) {
        uploadedAt += 'Z'; // Treat as UTC
    }
    const uploadDate = new Date(uploadedAt);
    const dateStr = uploadDate.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const contentString = `
        <div class="custom-iw" style="max-width: 220px; word-wrap: break-word; overflow-wrap: break-word;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <span style="font-size: 1.5rem; flex-shrink: 0;">${iconPrefix}</span>
                    <div style="min-width: 0; flex: 1;">
                        <h5 style="margin: 0; font-size: 1rem; word-break: break-word; line-height: 1.2;">
                            ${nameHtml}
                        </h5>
                    </div>
                </div>
                ${total > 1 ? `<span style="background:#334155; color:white; padding:2px 8px; border-radius:10px; font-size:0.8rem; white-space: nowrap;">${marker.currentIndex + 1}/${total}</span>` : ''}
            </div>
            
            <div style="position: relative; overflow: hidden; border-radius: 8px; margin-bottom: 8px;">
                <img src="${displayPath}" class="fade-in" onclick="openImageModal(${media.id})" style="cursor: pointer; width: 100%; height: 150px; object-fit: cover; display: block;">
            </div>
            
            <p style="margin-bottom: 5px; overflow-wrap: break-word;">${media.description || ''}</p>
            
            <div style="display: flex; justify-content: flex-end; margin-bottom: 5px;">
                <button onclick="toggleCommentSection(${media.id})" class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; white-space: nowrap;">💬 コメント (${media.comments ? media.comments.length : 0})</button>
            </div>

            <!-- Comments Section -->
            ${commentsHtml}

            <!-- Like Button -->
                <button onclick="toggleLike(${media.id}, '${marker.locationKey}')" 
                        class="like-btn ${media.liked_by_me ? 'liked' : ''}"
                        style="background: none; border: none; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 3px; color: ${media.liked_by_me ? '#ef4444' : '#94a3b8'}; transition: all 0.2s; white-space: nowrap;">
                    <span class="like-icon">${media.liked_by_me ? '❤️' : '🤍'}</span>
                    <span class="like-count" style="font-size: 0.8rem;">${media.like_count || 0}</span>
                </button>
                ${isAdmin || isOwner ? `<a href="#" onclick="showLikeUsersForMedia(${media.id}, '${marker.locationKey}'); return false;" style="font-size: 0.7rem; color: #60a5fa; white-space: nowrap;">詳細</a>` : ''}
                <small style="color: #94a3b8; margin-left: auto; white-space: nowrap; font-size: 0.7rem;">${dateStr}</small>
                ${isOwner || isAdmin ? `<button onclick="deleteMedia(${media.id}, '${marker.locationKey}')" style="padding: 2px 6px; font-size: 0.65rem; background: #ef4444; border: none; color: white; border-radius: 4px; cursor: pointer; white-space: nowrap;">削除</button>` : ''}
            </div>
            
            ${total > 1 ? `
            <div style="margin-top:8px; display:flex; gap:5px;">
                <button onclick="cycleMarkerImage('${marker.locationKey}', 1)" class="btn btn-secondary" style="padding: 4px; margin:0; flex:1;">次の写真へ</button>
            </div>
            ` : ''}
        </div>
    `;

    infowindow.setContent(contentString);
}


// Global helper for the button inside InfoWindow
window.cycleMarkerImage = function (latLngKey, direction) {
    const marker = markersMap[latLngKey];
    if (marker) {
        marker.currentIndex = (marker.currentIndex + direction) % marker.mediaGroup.length;
        if (marker.currentIndex < 0) marker.currentIndex = marker.mediaGroup.length - 1;

        // Update content directly if open
        if (marker.infowindow && marker.infowindow.getMap()) {
            updateInfoWindowContent(marker, marker.infowindow);
        } else {
            // Otherwise trigger click to open
            new google.maps.event.trigger(marker, 'click');
        }
    }
};

window.deleteMedia = async function (mediaId, latLngKey) {
    if (!confirm("本当にこの写真を削除しますか？")) return;

    try {
        const response = await fetch(`/api/media/${mediaId}?username=${currentUser}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("削除しました。");
            fetchMedia();
        } else {
            alert("削除に失敗しました。");
        }
    } catch (err) {
        console.error(err);
        alert("エラーが発生しました。");
    }
};

window.postComment = async function (mediaId, latLngKey) {
    const input = document.getElementById(`comment-input-${mediaId}`);
    const content = input.value;
    if (!content) return;

    if (!currentUser) {
        showLoginModal();
        return;
    }

    try {
        const response = await fetch(`/api/comments/?media_id=${mediaId}&username=${currentUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });

        if (response.ok) {
            input.value = "";
            await fetchMedia();

            // Attempt to re-open
            const marker = markersMap[latLngKey];
            if (marker) {
                new google.maps.event.trigger(marker, 'click');
            }
        } else {
            alert("コメントできませんでした");
        }
    } catch (err) {
        console.error(err);
    }
};

window.deleteComment = async function (commentId, latLngKey) {
    if (!confirm("コメントを削除しますか？")) return;

    console.log("deleteComment called:", { commentId, latLngKey, currentUser });

    try {
        const url = `/api/comments/${commentId}?username=${currentUser}`;
        console.log("DELETE request to:", url);

        const response = await fetch(url, {
            method: 'DELETE'
        });

        console.log("Response status:", response.status);

        if (response.ok) {
            // Local update for immediate feedback
            const marker = markersMap[latLngKey];
            if (marker && marker.mediaGroup) {
                marker.mediaGroup.forEach(media => {
                    if (media.comments) {
                        media.comments = media.comments.filter(c => c.id !== commentId);
                    }
                });
                // Re-render immediately
                updateInfoWindowContent(marker, marker.infowindow);
            }

            // Sync with server
            await fetchMedia();
        } else {
            const errText = await response.text();
            console.error("Delete failed:", response.status, errText);
            alert("削除に失敗しました: " + errText);
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert("削除エラー: " + err.message);
    }
};

window.deleteMedia = async function (mediaId, latLngKey) {
    if (!confirm("この画像を削除しますか？")) return;

    try {
        const url = `/api/media/${mediaId}?username=${encodeURIComponent(currentUser)}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Local update
            const marker = markersMap[latLngKey];
            if (marker && marker.mediaGroup) {
                marker.mediaGroup = marker.mediaGroup.filter(m => m.id !== mediaId);
                
                if (marker.mediaGroup.length === 0) {
                    marker.setMap(null);
                    delete markersMap[latLngKey];
                } else {
                    // Update index if needed
                    if (marker.currentIndex >= marker.mediaGroup.length) {
                        marker.currentIndex = 0;
                    }
                    updateInfoWindowContent(marker, marker.infowindow);
                }
            }
            alert("削除しました");
            fetchMedia();
        } else {
            const errText = await response.text();
            alert("削除に失敗しました: " + errText);
        }
    } catch (err) {
        console.error(err);
        alert("削除中にエラーが発生しました");
    }
};

// --- Like Functionality ---

// 連打防止用のSet
const pendingLikes = new Set();

window.toggleLike = async function (mediaId, latLngKey) {
    if (!currentUser) {
        alert("いいねするにはログインしてください。");
        return;
    }

    if (pendingLikes.has(mediaId)) {
        return; // 処理中なら何もしない
    }
    pendingLikes.add(mediaId);

    // Immediate feedback (optimistic UI) could go here, but waiting for server is safer for points

    try {
        const response = await fetch(`/api/likes/${mediaId}?username=${encodeURIComponent(currentUser)}`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();

            // Update local marker data
            const marker = markersMap[latLngKey];
            if (marker && marker.mediaGroup) {
                const media = marker.mediaGroup.find(m => m.id === mediaId);
                if (media) {
                    media.liked_by_me = data.liked;
                    media.like_count = data.like_count;
                }
                // Re-render InfoWindow
                if (marker.infowindow && marker.infowindow.getMap()) {
                    updateInfoWindowContent(marker, marker.infowindow);
                }
            }
        } else {
            console.error("Like toggle failed:", response.status);
        }
    } catch (err) {
        console.error("Like error:", err);
    } finally {
        pendingLikes.delete(mediaId);
    }
};

// --- Upload UX Improvements (Phase v1.3.0) ---

window.showUploadModal = function () {
    const modal = document.getElementById('upload-modal');
    if (modal) {
        modal.classList.add('active');
        clearUploadFile(); // Reset on open
    }
};

window.clearUploadFile = function () {
    const fileInput = document.getElementById('photo-file');
    const previewContainer = document.getElementById('file-preview-container');
    const dropArea = document.getElementById('file-drop-area');
    const msg = document.getElementById('file-select-msg');
    const submitBtn = document.getElementById('upload-submit-btn');

    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (dropArea) dropArea.style.border = '2px dashed #475569';
    if (msg) msg.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;
};

window.handleFileSelect = function (e) {
    const file = e.target.files[0];
    processSelectedFile(file);
};

async function processSelectedFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    console.log("Processing file:", file.name, file.size);

    const previewContainer = document.getElementById('file-preview-container');
    const previewImg = document.getElementById('file-preview-img');
    const msg = document.getElementById('file-select-msg');
    const submitBtn = document.getElementById('upload-submit-btn');
    const dropArea = document.getElementById('file-drop-area');

    // 1. Show Preview (FileReader)
    const reader = new FileReader();
    reader.onload = async function (e) {
        if (previewImg) previewImg.src = e.target.result;
        if (previewContainer) previewContainer.style.display = 'block';
        if (msg) msg.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        if (dropArea) dropArea.style.border = '2px solid var(--primary-color)';

        // 2. Sequential EXIF Parsing (after preview is at least loading)
        try {
            if (typeof ExifReader !== 'undefined') {
                const tags = await ExifReader.load(file);
                if (tags['GPSLatitude'] && tags['GPSLongitude']) {
                    let lat = tags['GPSLatitude'].description;
                    let lng = tags['GPSLongitude'].description;
                    
                    if (typeof lat === 'string' || typeof lat === 'number') {
                        lat = parseFloat(lat);
                        lng = parseFloat(lng);
                        const latRef = tags['GPSLatitudeRef'] ? tags['GPSLatitudeRef'].value[0] : 'N';
                        const lngRef = tags['GPSLongitudeRef'] ? tags['GPSLongitudeRef'].value[0] : 'E';
                        if (latRef === 'S') lat = -lat;
                        if (lngRef === 'W') lng = -lng;
                        
                        if (!isNaN(lat) && !isNaN(lng)) {
                            document.getElementById('upload-lat').value = lat;
                            document.getElementById('upload-lng').value = lng;
                            console.log("GPS Location set from EXIF:", lat, lng);
                            if (msg) {
                                msg.style.display = 'block';
                                msg.innerHTML = '<span style="color: #10b981; font-size: 0.8rem;">📍 写真の位置情報を取得しました</span>';
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn("EXIF read failed:", err);
        }
    };
    reader.readAsDataURL(file);
}

// Initialize Upload Handlers
function initUploadHandlers() {
    const fileInput = document.getElementById('photo-file');
    const dropArea = document.getElementById('file-drop-area');

    if (fileInput) {
        fileInput.addEventListener('change', window.handleFileSelect);
    }

    if (dropArea) {
        dropArea.onclick = () => fileInput && fileInput.click();

        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.style.background = 'rgba(59, 130, 246, 0.1)';
            dropArea.style.borderColor = 'var(--primary-color)';
        });

        dropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropArea.style.background = 'transparent';
            dropArea.style.borderColor = '#475569';
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.style.background = 'transparent';
            dropArea.style.borderColor = '#475569';

            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (fileInput) fileInput.files = e.dataTransfer.files; // Sync with input
                processSelectedFile(file);
            }
        });
    }
}






window.showLikeUsersForMedia = async function (mediaId) {
    const modal = document.getElementById('like-users-modal');
    const list = document.getElementById('like-users-list');

    // Reset list
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">読み込み中...</div>';
    modal.classList.add('active');

    try {
        // Find media in local state
        let mediaItem = null;
        Object.values(markersMap).forEach(marker => {
            if (marker.mediaGroup) {
                const found = marker.mediaGroup.find(m => m.id === mediaId);
                if (found) mediaItem = found;
            }
        });

        if (mediaItem && mediaItem.likes) {
            if (mediaItem.likes.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">まだ「いいね」はありません</div>';
                return;
            }

            list.innerHTML = '';
            mediaItem.likes.forEach(like => {
                const user = like.user; // Nested user object from schema
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.padding = '8px 0';
                div.style.borderBottom = '1px solid #334155';

                const nameHtml = getUserNameHtml(user);

                div.innerHTML = `
                    <span style="font-size: 2rem; margin-right: 10px;">${user.icon || '👤'}</span>
                    <span style="font-weight:bold; color:#e2e8f0;">${nameHtml}</span>
                 `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<div style="text-align:center;">データが見つかりません</div>';
        }

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div style="text-align:center; color:red;">エラーが発生しました</div>';
    }
};

// Start Upload Handlers
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUploadHandlers);
} else {
    initUploadHandlers();
}

