/* ─── address-analysis.js ───────────────────────────────────────── */

const WATERLOO_CENTER = { lat: 43.4723, lng: -80.5449 };

let map        = null;
let marker     = null;
let radarChart = null;
let geocoder   = null;

/* ── Breakdown metadata ──────────────────────────────────────── */
const BREAKDOWN_META = [
    { key: 'rent',          label: 'Rent',         icon: '🏠', fillClass: 'rent-fill',          max: 3000 },
    { key: 'commute',       label: 'Commute',       icon: '🚗', fillClass: 'commute-fill',       max: 600  },
    { key: 'groceries',     label: 'Groceries',     icon: '🛒', fillClass: 'groceries-fill',     max: 800  },
    { key: 'utilities',     label: 'Utilities',     icon: '💡', fillClass: 'utilities-fill',     max: 400  },
    { key: 'entertainment', label: 'Entertainment', icon: '🎬', fillClass: 'entertainment-fill', max: 500  },
    { key: 'transport',     label: 'Transport',     icon: '🚌', fillClass: 'transport-fill',     max: 400  },
];

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

    /* Hide spinner once tiles are loaded */
    google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
        document.getElementById('map-loading').classList.add('hide');
    });

    /* Click on map → drop pin + analyse */
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

    /* Places Autocomplete */
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

/* If Google Maps script fails to load (wrong key / APIs not enabled) */
window.gm_authFailure = function () {
    document.getElementById('map-loading').classList.add('hide');
    document.getElementById('map-error').classList.add('show');
    /* Fallback: still allow mock results if user types an address manually */
    setupManualFallback();
};

/* Manual fallback — press Enter in the search box without autocomplete */
function setupManualFallback() {
    const input = document.getElementById('address-input');
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const label = input.value.trim();
        if (!label) return;
        /* Use a fixed lat/lng so mock still works */
        triggerAnalysis(WATERLOO_CENTER.lat, WATERLOO_CENTER.lng, label);
    });
}

/* ── Place / move the marker ─────────────────────────────────── */
function placeMarker(location) {
    if (marker) {
        marker.setPosition(location);
    } else {
        marker = new google.maps.Marker({
            position: location,
            map,
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#60a5fa',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2.5,
            },
        });
    }
}

/* ── Read user preferences from localStorage (no auth.js needed) ── */
function _loadUserPrefs() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('look_profile_')) {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : {};
            }
        }
    } catch (_) { /* ignore */ }
    return {};
}

const BACKEND_URL = 'http://localhost:8000';

/* ── Call backend and render AI analysis ────────────────────── */
async function fetchAiAnalysis(lat, lng, label) {
    const aiSection  = document.getElementById('ai-section');
    const aiLoading  = document.getElementById('ai-loading');
    const aiErrorBox = document.getElementById('ai-error-box');
    const aiRaw      = document.getElementById('ai-raw');

    /* Show the section and loading state */
    aiSection.classList.add('show');
    aiLoading.style.display  = 'flex';
    aiErrorBox.style.display = 'none';
    aiRaw.style.display      = 'none';

    try {
        const res = await fetch(`${BACKEND_URL}/api/cost-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat,
                lng,
                address: label,
                user_preferences: _loadUserPrefs(),
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();
        aiLoading.style.display = 'none';

        if (data.ai_error) {
            document.getElementById('ai-error-text').textContent = data.ai_error;
            aiErrorBox.style.display = 'block';
        } else {
            renderAiAnalysis(data.ai_analysis, data._demo_mode || data.ai_analysis?._demo_mode);
            aiRaw.style.display = 'block';
        }
    } catch (err) {
        aiLoading.style.display = 'none';
        document.getElementById('ai-error-text').textContent = err.message;
        aiErrorBox.style.display = 'block';
    }
}

/* ── Render structured AI analysis ──────────────────────────── */
function renderAiAnalysis(ai, isDemo) {
    const aiRaw = document.getElementById('ai-raw');
    if (!ai) { aiRaw.textContent = 'No AI data returned.'; aiRaw.style.display = 'block'; return; }

    const s   = ai.summary || {};
    const opt = (ai.ranked_options || [])[0] || {};
    const exp = ai.explainability || {};
    const fs  = opt.factor_scores || {};

    const factorLabel = { rent_cost:'Rent Cost', commute:'Commute', healthcare_access:'Healthcare',
                          parks_recreation:'Parks & Recreation', noise_pollution:'Noise / Pollution',
                          groceries_food_cost:'Groceries' };

    const factorRows = Object.entries(fs).map(([k, v]) => {
        const pct = Math.round(v * 10);
        const col = v >= 7 ? '#4ade80' : v >= 4 ? '#facc15' : '#f87171';
        return `<div class="ai-factor-row">
            <span class="ai-factor-name">${factorLabel[k] || k}</span>
            <div class="ai-factor-bar-wrap"><div class="ai-factor-bar" style="width:${pct}%;background:${col}"></div></div>
            <span class="ai-factor-score" style="color:${col}">${v}/10</span>
        </div>`;
    }).join('');

    const strengths = (opt.strengths || []).map(t => `<li>✅ ${t}</li>`).join('');
    const weaknesses = (opt.weaknesses || []).map(t => `<li>⚠️ ${t}</li>`).join('');

    aiRaw.innerHTML = `
        ${isDemo ? '<div class="ai-demo-note">⚡ Demo mode — connect a Gemini API key for live AI analysis</div>' : ''}
        <div class="ai-scores-row">
            <div class="ai-score-card">
                <div class="ai-score-val">${s.livability_score ?? '—'}</div>
                <div class="ai-score-lbl">Livability</div>
            </div>
            <div class="ai-score-card">
                <div class="ai-score-val">${s.suitability_score ?? '—'}</div>
                <div class="ai-score-lbl">Suitability</div>
            </div>
            <div class="ai-score-card">
                <div class="ai-score-val">${s.confidence ?? '—'}%</div>
                <div class="ai-score-lbl">Confidence</div>
            </div>
        </div>
        <p class="ai-summary-text">${s.why_this_wins || ''}</p>
        <div class="ai-factors">${factorRows}</div>
        ${strengths || weaknesses ? `
        <div class="ai-sw-grid">
            ${strengths ? `<ul class="ai-sw-list">${strengths}</ul>` : ''}
            ${weaknesses ? `<ul class="ai-sw-list">${weaknesses}</ul>` : ''}
        </div>` : ''}
        ${opt.tradeoffs ? `<p class="ai-tradeoffs">⚖️ ${opt.tradeoffs}</p>` : ''}
        ${exp.scoring_notes ? `<p class="ai-notes">📝 ${exp.scoring_notes}</p>` : ''}
    `;
    aiRaw.style.display = 'block';
}
function triggerAnalysis(lat, lng, label) {
    document.getElementById('idle-panel').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('show');
    /* Slight delay so the remove-then-add triggers CSS animation again */
    setTimeout(() => {
        document.getElementById('results-panel').classList.add('show');
        document.getElementById('breakdown-section').classList.add('show');
    }, 30);

    document.getElementById('selected-addr-text').textContent = label;

    /* Render mock cost data immediately while Gemini is thinking */
    const data = mockCostAnalysis(lat, lng);
    renderCostNumber(data.total_cost);
    renderRadar(data.breakdown);
    renderBreakdown(data.breakdown);

    /* Fire backend call (non-blocking) */
    fetchAiAnalysis(lat, lng, label);

    /* Scroll the results into view smoothly */
    setTimeout(() => {
        document.getElementById('results-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

/* ── Deterministic mock based on coordinates ─────────────────── */
function mockCostAnalysis(lat, lng) {
    let seed = Math.abs(Math.sin(lat * 127.1 + lng * 311.7)) * 1e6;
    const rand = (min, max) => {
        seed = (seed * 9301 + 49297) % 233280;
        return Math.round(min + (seed / 233280) * (max - min));
    };
    const rent          = rand(900,  2200);
    const commute       = rand(100,  500);
    const groceries     = rand(280,  650);
    const utilities     = rand(90,   260);
    const entertainment = rand(80,   350);
    const transport     = rand(60,   200);
    return {
        total_cost: rent + commute + groceries + utilities + entertainment + transport,
        breakdown: { rent, commute, groceries, utilities, entertainment, transport },
    };
}

/* ── Big cost number ─────────────────────────────────────────── */
function renderCostNumber(total) {
    const el = document.getElementById('cost-number');
    el.textContent = '$' + total.toLocaleString();
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'pulseCost 0.5s ease';
}

/* ── Radar chart ─────────────────────────────────────────────── */
function renderRadar(breakdown) {
    const ctx    = document.getElementById('radar-chart').getContext('2d');
    const labels = BREAKDOWN_META.map(m => m.label);
    const norm   = BREAKDOWN_META.map(m => Math.min(100, Math.round((breakdown[m.key] / m.max) * 100)));

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Cost Score',
                data: norm,
                backgroundColor: 'rgba(96,165,250,0.15)',
                borderColor: '#60a5fa',
                borderWidth: 2,
                pointBackgroundColor: '#60a5fa',
                pointRadius: 4,
                pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `  $${BREAKDOWN_META.map(m => breakdown[m.key])[ctx.dataIndex].toLocaleString()}`,
                    },
                    backgroundColor: 'rgba(7,17,30,0.9)',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                    titleColor: '#fff', bodyColor: '#93c5fd',
                },
            },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { display: false },
                    grid:        { color: 'rgba(255,255,255,0.07)' },
                    angleLines:  { color: 'rgba(255,255,255,0.07)' },
                    pointLabels: { color: 'rgba(232,240,255,0.5)', font: { size: 11, weight: '600' } },
                },
            },
            animation: { duration: 700, easing: 'easeInOutQuart' },
        },
    });
}

/* ── Breakdown cards ─────────────────────────────────────────── */
function renderBreakdown(breakdown) {
    const grid = document.getElementById('breakdown-grid');
    grid.innerHTML = '';
    BREAKDOWN_META.forEach(meta => {
        const val  = breakdown[meta.key];
        const pct  = Math.min(100, Math.round((val / meta.max) * 100));
        const card = document.createElement('div');
        card.className = 'breakdown-item';
        card.innerHTML = `
            <span class="bi-icon">${meta.icon}</span>
            <div class="bi-label">${meta.label}</div>
            <div class="bi-value">$${val.toLocaleString()}</div>
            <div class="bi-bar"><div class="bi-fill ${meta.fillClass}" style="width:0%"></div></div>
        `;
        grid.appendChild(card);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            card.querySelector('.bi-fill').style.width = pct + '%';
        }));
    });
}

/* ── Dark map style ──────────────────────────────────────────── */
const DARK_MAP_STYLE = [
    { elementType: 'geometry',      stylers: [{ color: '#0d1f38' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#8ba3c4' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#07111e' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#93c5fd' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry',        stylers: [{ color: '#1e3a5f' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0a1a2e' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a5080' }] },
    { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'water', elementType: 'geometry',        stylers: [{ color: '#051422' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a6090' }] },
];

/* ── Keyframe injection ──────────────────────────────────────── */
(function () {
    const s = document.createElement('style');
    s.textContent = '@keyframes pulseCost { 0%{opacity:0;transform:scale(0.88)} 60%{opacity:1;transform:scale(1.04)} 100%{transform:scale(1)} }';
    document.head.appendChild(s);
})();
