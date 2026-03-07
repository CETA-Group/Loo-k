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

/* ── Trigger full analysis for a coordinate ──────────────────── */
function triggerAnalysis(lat, lng, label) {
    document.getElementById('idle-panel').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('show');
    /* Slight delay so the remove-then-add triggers CSS animation again */
    setTimeout(() => {
        document.getElementById('results-panel').classList.add('show');
        document.getElementById('breakdown-section').classList.add('show');
    }, 30);

    document.getElementById('selected-addr-text').textContent = label;

    /* ── TODO: replace mock with real POST /api/cost-analysis ── */
    const data = mockCostAnalysis(lat, lng);

    renderCostNumber(data.total_cost);
    renderRadar(data.breakdown);
    renderBreakdown(data.breakdown);

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
