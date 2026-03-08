/* ─── address-analysis.js ───────────────────────────────────────── */

const WATERLOO_CENTER = { lat: 43.4723, lng: -80.5449 };
const BACKEND_URL     = 'http://localhost:8000';

let map        = null;
let marker     = null;
let radarChart = null;
let geocoder   = null;

/* ── Category config for range bars ─────────────────────────────── */
const COST_META = [
    { key: 'rent',          label: 'Rent',          icon: '🏠', color: '#60a5fa', max: 3000 },
    { key: 'commute',       label: 'Commute',        icon: '🚗', color: '#f59e0b', max: 600  },
    { key: 'groceries',     label: 'Groceries',      icon: '🛒', color: '#4ade80', max: 800  },
    { key: 'utilities',     label: 'Utilities',      icon: '💡', color: '#a78bfa', max: 400  },
    { key: 'entertainment', label: 'Entertainment',  icon: '🎬', color: '#fb7185', max: 500  },
    { key: 'transport',     label: 'Transport',      icon: '🚌', color: '#34d399', max: 400  },
];

/* Livability factor labels */
const FACTOR_LABELS = {
    commute:          'Commute',
    healthcare:       'Healthcare',
    parks_recreation: 'Parks & Recreation',
    noise_pollution:  'Noise / Pollution',
    groceries:        'Groceries',
    transport:        'Transport',
};

/* ── Google Maps callback ────────────────────────────────────── */
function initMap() {
    geocoder = new google.maps.Geocoder();

    map = new google.maps.Map(document.getElementById('map'), {
        center: WATERLOO_CENTER,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        styles: DARK_MAP_STYLE,
    });

    /* Hide spinner immediately once the API is ready — don't wait for tiles */
    document.getElementById('map-loading').classList.add('hide');

    map.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        placeMarker(e.latLng);
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            const label = (status === 'OK' && results[0])
                ? results[0].formatted_address
                : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            triggerAnalysis(lat, lng, label);
        });
    });

    const input = document.getElementById('address-input');
    const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ['geometry', 'formatted_address'],
    });
    autocomplete.bindTo('bounds', map);

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        map.panTo(place.geometry.location);
        map.setZoom(15);
        placeMarker(place.geometry.location);
        triggerAnalysis(lat, lng, place.formatted_address);
    });
}

window.gm_authFailure = function () {
    document.getElementById('map-loading').classList.add('hide');
    document.getElementById('map-error').classList.add('show');
    setupManualFallback();
};

function setupManualFallback() {
    const input = document.getElementById('address-input');
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const label = input.value.trim();
        if (!label) return;
        triggerAnalysis(WATERLOO_CENTER.lat, WATERLOO_CENTER.lng, label);
    });
}

function placeMarker(location) {
    if (marker) {
        marker.setPosition(location);
    } else {
        marker = new google.maps.Marker({
            position: location, map,
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#60a5fa', fillOpacity: 1,
                strokeColor: '#fff', strokeWeight: 2.5,
            },
        });
    }
}

/* ── Read user preferences ───────────────────────────────────── */
function _loadUserPrefs() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('look_profile_')) {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : {};
            }
        }
    } catch (_) {}
    return {};
}

/* ── Main trigger ────────────────────────────────────────────── */
function triggerAnalysis(lat, lng, label) {
    /* Show right panel with spinner radar */
    document.getElementById('idle-panel').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('show');
    setTimeout(() => document.getElementById('results-panel').classList.add('show'), 30);

    document.getElementById('selected-addr-text').textContent = label;

    /* Render a placeholder radar with zeros while loading */
    renderRadarPlaceholder();
    document.getElementById('livability-number').textContent = '—';

    /* Show livability section in loading state */
    const livSection = document.getElementById('livability-section');
    livSection.classList.add('show');
    document.getElementById('ai-loading-bar').classList.remove('hidden');
    document.getElementById('ai-error-box').style.display = 'none';
    document.getElementById('livability-card').classList.remove('show');

    /* Hide cost section until data arrives */
    document.getElementById('cost-section').classList.remove('show');

    /* Call backend */
    fetchAnalysis(lat, lng, label);
}

/* ── Backend call ────────────────────────────────────────────── */
async function fetchAnalysis(lat, lng, label) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/cost-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat, lng, address: label,
                user_preferences: _loadUserPrefs(),
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

        const data = await res.json();
        document.getElementById('ai-loading-bar').classList.add('hidden');

        if (data.ai_error) {
            document.getElementById('ai-error-text').textContent = data.ai_error;
            document.getElementById('ai-error-box').style.display = 'block';
            /* Still render cost + solana even if AI failed */
            if (data.cost_breakdown) renderCostSection(data.cost_breakdown);
            renderSolanaSection(data.solana_tx || null);
            return;
        }

        /* Render livability */
        if (data.livability) {
            renderLivability(data.livability, data.personalized);
            renderRadarFromLivability(data.livability);
        }

        /* Render cost breakdown */
        if (data.cost_breakdown) renderCostSection(data.cost_breakdown);

        /* Render Solana verification */
        renderSolanaSection(data.solana_tx || null);

    } catch (err) {
        document.getElementById('ai-loading-bar').classList.add('hidden');
        document.getElementById('ai-error-text').textContent = err.message;
        document.getElementById('ai-error-box').style.display = 'block';
    }
}

/* ── Render livability section ───────────────────────────────── */
function renderLivability(liv, personalized) {
    const criteria = liv.criteria || {};
    const overall  = liv.overall_score ?? 0;

    /* Update overall score in right panel */
    document.getElementById('livability-number').textContent = overall.toFixed(1);

    /* Show/update personalised badge */
    let badge = document.getElementById('personalized-badge');
    if (personalized) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'personalized-badge';
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);color:#4ade80;font-size:0.7rem;font-weight:700;letter-spacing:0.06em;padding:3px 10px;border-radius:99px;margin-bottom:0.8rem;text-transform:uppercase;';
            badge.innerHTML = '✦ Personalised for you';
            document.getElementById('livability-card').prepend(badge);
        }
        badge.style.display = 'inline-flex';
    } else if (badge) {
        badge.style.display = 'none';
    }

    /* Show explore button now that cost section will be populated */
    const exploreBtn = document.getElementById('explore-cost-btn');
    if (exploreBtn) exploreBtn.style.display = 'inline-flex';

    /* Summary */
    document.getElementById('lc-summary').textContent = liv.summary || '';

    /* Factor bars */
    const factorList = document.getElementById('factor-list');
    factorList.innerHTML = '';
    Object.entries(criteria).forEach(([key, val]) => {
        const pct = Math.round(val * 10);
        const col = val >= 7 ? '#4ade80' : val >= 4 ? '#facc15' : '#f87171';
        const row = document.createElement('div');
        row.className = 'factor-row';
        row.innerHTML = `
            <span class="factor-name">${FACTOR_LABELS[key] || key}</span>
            <div class="factor-track"><div class="factor-fill" style="width:0%;background:${col}"></div></div>
            <span class="factor-score" style="color:${col}">${val}/10</span>
        `;
        factorList.appendChild(row);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            row.querySelector('.factor-fill').style.width = pct + '%';
        }));
    });

    /* Pros / Warnings */
    const pwGrid = document.getElementById('pw-grid');
    const pros  = liv.pros     || [];
    const warns = liv.warnings || [];
    pwGrid.innerHTML = `
        <div>
            <p class="pw-col-title green">✅ Strengths</p>
            <ul class="pw-list">${pros.map(t => `<li>${t}</li>`).join('')}</ul>
        </div>
        <div>
            <p class="pw-col-title yellow">⚠️ Considerations</p>
            <ul class="pw-list">${warns.map(t => `<li>${t}</li>`).join('')}</ul>
        </div>
    `;

    document.getElementById('livability-card').classList.add('show');
}

/* ── Render radar from livability criteria ───────────────────── */
function renderRadarFromLivability(liv) {
    const criteria = liv.criteria || {};
    const order = ['commute', 'healthcare', 'parks_recreation', 'noise_pollution', 'groceries', 'transport'];
    const labels = order.map(k => FACTOR_LABELS[k] || k);
    const values = order.map(k => criteria[k] ?? 0);

    const ctx = document.getElementById('radar-chart').getContext('2d');
    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Livability',
                data: values,
                backgroundColor: 'rgba(74,222,128,0.15)',
                borderColor: '#4ade80',
                borderWidth: 2,
                pointBackgroundColor: '#4ade80',
                pointRadius: 4,
                pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => `  ${ctx.raw}/10` },
                    backgroundColor: 'rgba(7,17,30,0.9)',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                    titleColor: '#fff', bodyColor: '#4ade80',
                },
            },
            scales: {
                r: {
                    min: 0, max: 10,
                    ticks: { display: false, stepSize: 2 },
                    grid:        { color: 'rgba(255,255,255,0.07)' },
                    angleLines:  { color: 'rgba(255,255,255,0.07)' },
                    pointLabels: { color: 'rgba(232,240,255,0.55)', font: { size: 11, weight: '600' } },
                },
            },
            animation: { duration: 700, easing: 'easeInOutQuart' },
        },
    });
}

/* Placeholder radar while loading */
function renderRadarPlaceholder() {
    const order  = ['commute', 'healthcare', 'parks_recreation', 'noise_pollution', 'groceries', 'transport'];
    const labels = order.map(k => FACTOR_LABELS[k]);
    const ctx    = document.getElementById('radar-chart').getContext('2d');
    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(96,165,250,0.05)',
                borderColor: 'rgba(96,165,250,0.2)',
                borderWidth: 1.5,
                pointRadius: 0,
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                r: {
                    min: 0, max: 10,
                    ticks: { display: false },
                    grid:        { color: 'rgba(255,255,255,0.05)' },
                    angleLines:  { color: 'rgba(255,255,255,0.05)' },
                    pointLabels: { color: 'rgba(232,240,255,0.3)', font: { size: 11 } },
                },
            },
            animation: { duration: 0 },
        },
    });
}

/* ── Render cost breakdown section ───────────────────────────── */
function renderCostSection(cb) {
    const gt   = cb.grand_total || {};
    const cats = cb.categories  || {};

    /* ── Grand total hero ── */
    const gtLo  = gt.lowest  || 0;
    const gtAvg = gt.average || 0;
    const gtHi  = gt.highest || 0;

    document.getElementById('gt-avg').textContent   = '$' + gtAvg.toLocaleString();
    document.getElementById('gt-range').textContent = gtLo && gtHi
        ? `Range: $${gtLo.toLocaleString()} – $${gtHi.toLocaleString()}` : '';

    /* Grand total range bar */
    const gtMax   = gtHi * 1.05;
    const gtBandL = ((gtLo  / gtMax) * 100).toFixed(1);
    const gtBandW = (((gtHi - gtLo) / gtMax) * 100).toFixed(1);
    const gtMark  = ((gtAvg / gtMax) * 100).toFixed(1);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('gt-band').style.left  = gtBandL + '%';
        document.getElementById('gt-band').style.width = gtBandW + '%';
        document.getElementById('gt-marker').style.left = gtMark + '%';
    }));

    /* ── Category rows ── */
    // Find shared scale: max of all "highest" values
    const maxVal = Math.max(...COST_META.map(m => (cats[m.key] || {}).highest || 0)) * 1.08;

    const rowsEl = document.getElementById('cost-rows');
    rowsEl.innerHTML = '';

    COST_META.forEach(meta => {
        const cat = cats[meta.key] || {};
        const lo  = cat.lowest  || 0;
        const avg = cat.average || 0;
        const hi  = cat.highest || 0;

        const bandL = ((lo  / maxVal) * 100).toFixed(1);
        const bandW = (((hi - lo) / maxVal) * 100).toFixed(1);
        const dotL  = ((avg / maxVal) * 100).toFixed(1);

        const row = document.createElement('div');
        row.className = 'cost-row';
        row.innerHTML = `
            <div class="cost-row-top">
                <div class="cost-row-label">
                    <span class="cost-row-icon">${meta.icon}</span>
                    <span class="cost-row-name">${meta.label}</span>
                </div>
                <div class="cost-row-vals">
                    <div class="crv">
                        <span class="crv-amount muted">$${lo.toLocaleString()}</span>
                        <span class="crv-lbl">Low</span>
                    </div>
                    <div class="crv">
                        <span class="crv-amount">$${avg.toLocaleString()}</span>
                        <span class="crv-lbl">Avg</span>
                    </div>
                    <div class="crv">
                        <span class="crv-amount muted">$${hi.toLocaleString()}</span>
                        <span class="crv-lbl">High</span>
                    </div>
                </div>
            </div>
            <div class="cost-track">
                <div class="cost-band"  style="left:${bandL}%;width:0%;background:${meta.color}"></div>
                <div class="cost-avg-dot" style="left:0%;background:${meta.color};color:${meta.color}"
                     title="Avg $${avg.toLocaleString()}"></div>
            </div>
        `;
        rowsEl.appendChild(row);

        /* Animate after paint */
        requestAnimationFrame(() => requestAnimationFrame(() => {
            row.querySelector('.cost-band').style.width = bandW + '%';
            row.querySelector('.cost-avg-dot').style.left = dotL + '%';
        }));
    });

    /* ── Insights ── */
    const insights = cb.insights || [];
    if (insights.length) {
        const ciList = document.getElementById('ci-list');
        ciList.innerHTML = insights.map(t => `<li>${t}</li>`).join('');
        document.getElementById('cost-insights').style.display = 'block';
    }

    document.getElementById('cost-section').classList.add('show');
}

/* ── Render Solana verification section ──────────────────────── */
function renderSolanaSection(txLink) {
    const section = document.getElementById('solana-section');
    const btn     = document.getElementById('solana-explorer-btn');
    const status  = document.getElementById('solana-status');
    const hash    = document.getElementById('solana-tx-hash');

    if (txLink) {
        /* Extract the tx signature from the URL for display */
        const sig = txLink.split('/tx/')[1]?.split('?')[0] || '';
        btn.href = txLink;
        status.className = 'solana-status success';
        status.textContent = 'Confirmed';
        hash.textContent = sig ? `Tx: ${sig.slice(0, 20)}…${sig.slice(-8)}` : '';
    } else {
        /* Solana write failed or not available — show pending state */
        btn.href = 'https://explorer.solana.com/?cluster=devnet';
        status.className = 'solana-status pending';
        status.textContent = 'Pending / Unavailable';
        hash.textContent = 'Score computed — chain write unavailable (wallet needs SOL)';
    }

    section.classList.add('show');
}

/* ── Scroll helpers ──────────────────────────────────────────── */
function scrollToCost(e) {
    e.preventDefault();
    document.getElementById('cost-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Dark map style ──────────────────────────────────────────── */
const DARK_MAP_STYLE = [
    { elementType: 'geometry',           stylers: [{ color: '#0d1f38' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#8ba3c4' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#07111e' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#93c5fd' }] },
    { featureType: 'poi',           stylers: [{ visibility: 'off' }] },
    { featureType: 'road',          elementType: 'geometry',        stylers: [{ color: '#1e3a5f' }] },
    { featureType: 'road',          elementType: 'geometry.stroke', stylers: [{ color: '#0a1a2e' }] },
    { featureType: 'road.highway',  elementType: 'geometry',        stylers: [{ color: '#2a5080' }] },
    { featureType: 'transit',       stylers: [{ visibility: 'simplified' }] },
    { featureType: 'water',         elementType: 'geometry',        stylers: [{ color: '#051422' }] },
    { featureType: 'water',         elementType: 'labels.text.fill', stylers: [{ color: '#3a6090' }] },
];
