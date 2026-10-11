/**
 * TUFAN — National Environmental Intelligence Platform
 * Integrates 4 Core Modules:
 * 1. Geographic CPCB 257-City Bulletin Map & Table
 * 2. Source Attribution & Stubble Burning Engine (Charts + Satellite Telemetry)
 * 3. Automated GRAP Mitigation & Alert Center (Violation Directives & Dispatch Log)
 * 4. Interactive CFD Wind & Plume Dispersion Simulator (Eulerian-Lagrangian Physics)
 */

const state = {
  map: null,
  cities: [],
  delhiStations: [],
  cityMarkers: [],
  delhiMarkers: [],
  activeView: 'delhi',
  currentFilter: 'all',
  searchQuery: '',
  chartsInitialized: false,
  sourcePieChart: null,
  sourceStackedChart: null,
  grapData: null
};

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initSidebarNavigation();
  initMap();
  loadBulletinData();
  loadSourceAttribution();
  loadGrapMitigations();
  setupEventListeners();

  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 300);
});

// ============================================================
// Topbar Live Clock (Seconds Ticking)
// ============================================================
function initLiveClock() {
  const dateEl = document.getElementById('liveDateDisplay');
  const timeEl = document.getElementById('liveClockDisplay');

  function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (dateEl) dateEl.innerText = now.toLocaleDateString('en-GB', options);
    if (timeEl) {
      timeEl.innerText = now.toLocaleTimeString('en-US', { hour12: true });
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// ============================================================
// Sidebar Navigation & Layer Toggles
// ============================================================
function initSidebarNavigation() {
  const links = document.querySelectorAll('.sidebar-link');
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');

  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const targetId = link.getAttribute('data-target');
      if (targetId) {
        document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.add('active');
      }

      // Handle layer shortcuts
      const mapMode = link.getAttribute('data-map-mode');
      if (mapMode === 'delhi') {
        const btnDelhi = document.getElementById('btnViewDelhi');
        if (btnDelhi) btnDelhi.click();
      } else if (mapMode === 'india') {
        const btnIndia = document.getElementById('btnViewIndia');
        if (btnIndia) btnIndia.click();
      }

      if (targetId === 'section-map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 150);
      } else if (targetId === 'section-source' && !state.chartsInitialized) {
        initSourceCharts();
      }

      // Auto close sidebar on narrow screens
      if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.add('collapsed');
      }
    });
  });

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      if (state.map) {
        setTimeout(() => state.map.invalidateSize(), 300);
      }
    });
  }
}

// ============================================================
// Leaflet Map Initialization (Clean OpenStreetMap)
// ============================================================
function initMap() {
  const mapElement = document.getElementById('cpcb-leaflet-map');
  if (!mapElement) return;

  const DELHI_COORDS = [28.6139, 77.2090];
  state.map = L.map('cpcb-leaflet-map', {
    center: DELHI_COORDS,
    zoom: 10,
    zoomControl: true,
  });

  const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors &bull; CPCB Data',
    maxZoom: 19,
    minZoom: 3,
  });

  osmLayer.addTo(state.map);
  osmLayer.on('load', () => state.map.invalidateSize());
}

// ============================================================
// Load Bulletin Dataset
// ============================================================
async function loadBulletinData() {
  try {
    const res = await fetch('/api/bulletin');
    const data = await res.json();

    state.cities = data.cities || [];
    state.delhiStations = data.delhi_stations || [];

    const cats = data.category_counts || {};
    if (document.getElementById('countGood')) document.getElementById('countGood').innerText = `${cats.Good || 0} cities (11%)`;
    if (document.getElementById('countSatisfactory')) document.getElementById('countSatisfactory').innerText = `${cats.Satisfactory || 0} cities (51%)`;
    if (document.getElementById('countModerate')) document.getElementById('countModerate').innerText = `${cats.Moderate || 0} cities (38%)`;
    if (document.getElementById('totalCitiesCount')) document.getElementById('totalCitiesCount').innerText = data.total_cities || 257;

    plotAllCitiesOnMap();
    plotDelhiStationsOnMap();
    renderTable();

  } catch (err) {
    console.error('Error loading bulletin dataset:', err);
  }
}

function plotAllCitiesOnMap() {
  state.cityMarkers.forEach(m => state.map.removeLayer(m.marker));
  state.cityMarkers = [];

  state.cities.forEach(c => {
    const radius = Math.max(6, Math.min(13, Math.round(c.aqi / 16)));
    const marker = L.circleMarker([c.lat, c.lng], {
      radius: radius,
      color: '#1e293b',
      weight: 1.5,
      fillColor: c.color,
      fillOpacity: 0.88,
    });

    marker.bindPopup(`
      <div style="min-width: 195px; font-family: Inter, sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:5px;">
          <strong style="font-size:1rem; color:#0f172a;">${c.city}</strong>
          <span style="font-size:0.68rem; color:#64748b;">S.No ${c.sno}</span>
        </div>
        <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
          <span style="font-size:1.5rem; font-weight:800; color:#0f172a;">${c.aqi}</span>
          <span class="cpcb-badge badge-cpcb-${c.category.toLowerCase().replace(' ', '')}">${c.category}</span>
        </div>
        <div style="font-size:0.75rem; color:#475569; line-height:1.5;">
          <strong>Prominent Pollutant:</strong> ${c.pollutant}<br>
          <strong>Monitoring Stations:</strong> ${c.stations}<br>
          <small style="color:#94a3b8;">CPCB Bulletin: Oct 10, 2026 @ 4 PM</small>
        </div>
      </div>
    `);

    state.cityMarkers.push({ marker, data: c });
  });

  applyMapFilters();
}

function plotDelhiStationsOnMap() {
  state.delhiMarkers.forEach(m => state.map.removeLayer(m));
  state.delhiMarkers = [];

  state.delhiStations.forEach(s => {
    const isModerate = s.aqi > 100;
    const fillColor = isModerate ? '#ffff00' : '#92d050';

    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 9,
      color: '#0f172a',
      weight: 2,
      fillColor: fillColor,
      fillOpacity: 0.92,
    });

    marker.bindPopup(`
      <div style="min-width: 190px; font-family: Inter, sans-serif;">
        <div style="font-size:0.68rem; color:#2563eb; font-weight:700; text-transform:uppercase;">${s.type}</div>
        <strong style="font-size:0.95rem; color:#0f172a;">${s.name}</strong>
        <div style="margin:4px 0; font-size:1.35rem; font-weight:800; color:#0f172a;">
          AQI ${s.aqi} <span style="font-size:0.75rem; font-weight:600; color:#475569;">(${s.category})</span>
        </div>
        <div style="font-size:0.75rem; color:#475569;">
          Pollutant: <strong>${s.pollutant}</strong> &bull; Delhi Continuous Grid
        </div>
      </div>
    `);

    state.delhiMarkers.push(marker);
  });
}

function applyMapFilters() {
  const filter = state.currentFilter;
  state.cityMarkers.forEach(({ marker, data }) => {
    let show = true;
    if (filter === 'delhi_ncr' && !data.is_delhi_ncr) show = false;
    else if (filter !== 'all' && filter !== 'delhi_ncr' && data.category !== filter) show = false;

    if (show) {
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
    } else {
      if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    }
  });

  if (state.activeView === 'delhi' || filter === 'delhi_ncr') {
    state.delhiMarkers.forEach(m => { if (!state.map.hasLayer(m)) m.addTo(state.map); });
  } else {
    state.delhiMarkers.forEach(m => { if (state.map.hasLayer(m)) state.map.removeLayer(m); });
  }
}

function renderTable() {
  const tbody = document.getElementById('cpcbTableBody');
  const countEl = document.getElementById('tableFilterCount');
  if (!tbody) return;

  const q = state.searchQuery.toLowerCase();
  const filter = state.currentFilter;

  const filtered = state.cities.filter(c => {
    const matchesSearch = c.city.toLowerCase().includes(q) || c.pollutant.toLowerCase().includes(q);
    let matchesCategory = true;
    if (filter === 'delhi_ncr') matchesCategory = c.is_delhi_ncr;
    else if (filter !== 'all') matchesCategory = c.category === filter;
    return matchesSearch && matchesCategory;
  });

  if (countEl) countEl.innerText = `Showing ${filtered.length} of ${state.cities.length} cities`;

  tbody.innerHTML = '';
  filtered.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.sno}</strong></td>
      <td><strong>${c.city}</strong> ${c.city === 'Delhi' ? '<span style="background:#fef3c7; color:#b45309; font-size:0.65rem; padding:1px 5px; border-radius:3px; font-weight:700;">CAPITAL</span>' : ''}</td>
      <td><span class="cpcb-badge badge-cpcb-${c.category.toLowerCase().replace(' ', '')}">${c.category}</span></td>
      <td><strong style="font-size:0.95rem;">${c.aqi}</strong></td>
      <td>${c.pollutant}</td>
      <td>${c.stations}</td>
      <td><button class="btn-locate-city" onclick="flyToCity(${c.lat}, ${c.lng}, '${c.city}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.flyToCity = (lat, lng, cityName) => {
  const mapLink = document.querySelector('.sidebar-link[data-target="section-map"]');
  if (mapLink && !mapLink.classList.contains('active')) {
    mapLink.click();
  }
  if (state.map) {
    state.map.flyTo([lat, lng], 11, { duration: 1.0 });
    const target = state.cityMarkers.find(m => m.data.city === cityName);
    if (target) setTimeout(() => target.marker.openPopup(), 1100);
  }
};

// ============================================================
// FEATURE 1: SOURCE ATTRIBUTION & STUBBLE ENGINE
// ============================================================
async function loadSourceAttribution() {
  try {
    const res = await fetch('/api/sources');
    const data = await res.json();
    state.sourcesData = data;

    if (data.stubble_telemetry) {
      const st = data.stubble_telemetry;
      const countEl = document.getElementById('stubbleFireTotal');
      if (countEl) countEl.innerText = st.active_fire_count_48h.toLocaleString();
    }

    const sourceSection = document.getElementById('section-source');
    if (sourceSection && sourceSection.classList.contains('active') && !state.chartsInitialized) {
      initSourceCharts();
    }
  } catch (err) {
    console.error('Error loading sources:', err);
  }
}

function initSourceCharts() {
  if (!state.sourcesData) return;
  state.chartsInitialized = true;

  const cur = state.sourcesData.current_split;
  const wk = state.sourcesData.weekly_trends;

  // 1. Donut Pie Chart
  const pieCtx = document.getElementById('sourcePieChart').getContext('2d');
  state.sourcePieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: cur.labels,
      datasets: [{
        data: cur.percentages,
        backgroundColor: cur.colors,
        borderWidth: 2,
        borderColor: '#ffffff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 14, font: { family: 'Inter', size: 11, weight: 600 }, color: '#334155' } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}% contribution` } }
      },
      cutout: '62%'
    }
  });

  // 2. 7-Day Stacked Bar Chart
  const stackedCtx = document.getElementById('sourceStackedChart').getContext('2d');
  state.sourceStackedChart = new Chart(stackedCtx, {
    type: 'bar',
    data: {
      labels: wk.days,
      datasets: [
        { label: 'Vehicular Traffic', data: wk.traffic, backgroundColor: '#2563eb' },
        { label: 'Stubble Burning (NW Influx)', data: wk.stubble, backgroundColor: '#ea580c' },
        { label: 'Construction Dust', data: wk.construction, backgroundColor: '#ca8a04' },
        { label: 'Industrial Emissions', data: wk.industrial, backgroundColor: '#7c3aed' },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter', size: 11 }, color: '#334155' } },
      },
      scales: {
        x: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
        y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } }
      }
    }
  });
}

// ============================================================
// FEATURE 2: AUTOMATED GRAP MITIGATION CENTER
// ============================================================
async function loadGrapMitigations() {
  try {
    const res = await fetch('/api/mitigations');
    const data = await res.json();
    state.grapData = data;
    renderGrapViolations(data.active_violations);
    renderDispatchLog(data.action_log);
  } catch (err) {
    console.error('Error loading mitigations:', err);
  }
}

function renderGrapViolations(violations) {
  const tbody = document.getElementById('grapViolationsBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  violations.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${v.id}</strong></td>
      <td><strong>${v.zone}</strong></td>
      <td><span style="font-size:1.15rem; font-weight:800; color:#dc2626;">${v.aqi}</span></td>
      <td><span class="cpcb-badge badge-cpcb-vpoor">${v.status}</span></td>
      <td style="max-width:260px; font-size:0.75rem;">${v.action_mandated}</td>
      <td><span style="background:#e0f2fe; color:#0369a1; font-weight:700; padding:2px 8px; border-radius:3px; font-size:0.7rem;">${v.status_chip}</span></td>
      <td>
        <button class="btn-grap-action" onclick="triggerDispatch('${v.id}', 'Water-Sprinkler Truck')">Deploy Sprinkler</button>
        <button class="btn-grap-action btn-grap-secondary" onclick="triggerDispatch('${v.id}', 'Stop-Work Order')">Stop Work</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDispatchLog(logs) {
  const box = document.getElementById('dispatchLogList');
  if (!box) return;

  box.innerHTML = '';
  logs.forEach(l => {
    const item = document.createElement('div');
    item.className = 'dispatch-log-item';
    item.innerHTML = `<span class="time">[${l.time}]</span> <span>${l.action}</span>`;
    box.appendChild(item);
  });
}

window.triggerDispatch = async (zoneId, actionType) => {
  try {
    const res = await fetch('/api/mitigations/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_id: zoneId, action_type: actionType })
    });
    const result = await res.json();
    if (result.status === 'success') {
      renderGrapViolations(result.violations);
      loadGrapMitigations();
    }
  } catch (err) {
    console.error('Dispatch trigger error:', err);
  }
};

// ============================================================
// FEATURE 3: CFD WIND & DISPERSION ENGINE (PHYSICS CANVAS)
// ============================================================
function initCfdEngine() {
  const canvas = document.getElementById('cfdCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const width = canvas.width;
  const height = canvas.height;

  // Initialize obstacles (Urban Buildings Grid)
  updateCfdObstacles(width, height);

  // Initialize Particle Field
  state.cfd.particles = [];
  for (let i = 0; i < 450; i++) {
    state.cfd.particles.push(createCfdParticle(width, height, true));
  }

  function createCfdParticle(w, h, randomStart = false) {
    let px, py;
    const rad = (state.cfd.windDirDeg * Math.PI) / 180;
    const isStubble = Math.random() < (state.cfd.stubbleLoad / 100);

    if (randomStart) {
      px = Math.random() * w;
      py = Math.random() * h;
    } else {
      // Inflow based on wind direction
      if (isStubble) {
        // Northwest stubble inflow
        px = Math.random() * (w * 0.35);
        py = Math.random() * (h * 0.25);
      } else {
        // Traffic corridor emissions
        px = Math.random() * (w * 0.5) + (w * 0.25);
        py = Math.random() * 20 + (h * 0.45);
      }
    }

    return {
      x: px,
      y: py,
      age: 0,
      maxAge: Math.random() * 200 + 100,
      concentration: isStubble ? Math.random() * 0.5 + 0.5 : Math.random() * 0.4 + 0.2,
      isStubble: isStubble,
      size: Math.random() * 2.8 + 1.2
    };
  }

  function updateCfdObstacles(w, h) {
    const mode = state.cfd.obstacleMode;
    state.cfd.obstacles = [];

    if (mode === 'high') {
      // 4 Urban Block Towers
      state.cfd.obstacles.push({ x: w * 0.3, y: h * 0.25, w: 60, h: 80 });
      state.cfd.obstacles.push({ x: w * 0.55, y: h * 0.20, w: 70, h: 90 });
      state.cfd.obstacles.push({ x: w * 0.35, y: h * 0.60, w: 80, h: 70 });
      state.cfd.obstacles.push({ x: w * 0.65, y: h * 0.55, w: 65, h: 85 });
    } else if (mode === 'medium') {
      // Highway Canyon Corridor
      state.cfd.obstacles.push({ x: w * 0.3, y: h * 0.15, w: 180, h: 50 });
      state.cfd.obstacles.push({ x: w * 0.3, y: h * 0.70, w: 180, h: 50 });
    }
  }

  // Animation Loop
  function animateCfd() {
    if (!state.cfd.running) {
      requestAnimationFrame(animateCfd);
      return;
    }

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Draw Urban Obstacles
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    state.cfd.obstacles.forEach(b => {
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#64748b';
      ctx.font = '9px Inter';
      ctx.fillText('Urban Block', b.x + 4, b.y + b.h / 2);
      ctx.fillStyle = '#1e293b';
    });

    // Wind vector angle
    const rad = (state.cfd.windDirDeg * Math.PI) / 180;
    const baseVx = Math.cos(rad) * (state.cfd.windSpeed * 0.12);
    const baseVy = Math.sin(rad) * (state.cfd.windSpeed * 0.12);

    // Draw Source Emission Points
    ctx.fillStyle = 'rgba(234, 88, 12, 0.25)';
    ctx.beginPath();
    ctx.arc(width * 0.15, height * 0.15, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ea580c';
    ctx.font = '10px Inter';
    ctx.fillText('NW Stubble Inflow', width * 0.15 - 45, height * 0.15 - 30);

    ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
    ctx.fillRect(width * 0.25, height * 0.48, width * 0.5, 8);
    ctx.fillStyle = '#2563eb';
    ctx.fillText('Arterial Traffic Corridor', width * 0.38, height * 0.48 - 6);

    // Update & Render Particles
    for (let i = 0; i < state.cfd.particles.length; i++) {
      const p = state.cfd.particles[i];

      // Turbulent Brownian jitter
      let vx = baseVx + (Math.random() - 0.5) * 0.8;
      let vy = baseVy + (Math.random() - 0.5) * 0.8;

      // Obstacle deflection
      state.cfd.obstacles.forEach(b => {
        if (p.x >= b.x - 10 && p.x <= b.x + b.w + 10 && p.y >= b.y - 10 && p.y <= b.y + b.h + 10) {
          // Deflect around obstacle edges
          if (p.x < b.x) vx -= 1.2;
          else if (p.x > b.x + b.w) vx += 1.2;
          if (p.y < b.y) vy -= 1.2;
          else if (p.y > b.y + b.h) vy += 1.2;
        }
      });

      p.x += vx;
      p.y += vy;
      p.age++;

      // Respawn if aged out or out of bounds
      if (p.age > p.maxAge || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        state.cfd.particles[i] = createCfdParticle(width, height, false);
      }

      // Color mapping according to concentration
      let color;
      if (p.concentration > 0.75) color = 'rgba(220, 38, 38, 0.8)'; // Red
      else if (p.concentration > 0.55) color = 'rgba(234, 88, 12, 0.75)'; // Orange
      else if (p.concentration > 0.35) color = 'rgba(234, 179, 8, 0.7)'; // Yellow
      else color = 'rgba(34, 197, 94, 0.6)'; // Green

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animateCfd);
  }

  animateCfd();

  // Slider Listeners
  const sSpd = document.getElementById('sliderWindSpeed');
  if (sSpd) sSpd.addEventListener('input', (e) => {
    state.cfd.windSpeed = parseFloat(e.target.value);
    document.getElementById('valWindSpeed').innerText = `${state.cfd.windSpeed} km/h`;
    updateDownwindAqi();
  });

  const sDir = document.getElementById('sliderWindDir');
  if (sDir) sDir.addEventListener('input', (e) => {
    state.cfd.windDirDeg = parseInt(e.target.value);
    const deg = state.cfd.windDirDeg;
    let compass = 'N';
    if (deg >= 23 && deg < 68) compass = 'NE';
    else if (deg >= 68 && deg < 113) compass = 'E';
    else if (deg >= 113 && deg < 158) compass = 'SE';
    else if (deg >= 158 && deg < 203) compass = 'S';
    else if (deg >= 203 && deg < 248) compass = 'SW';
    else if (deg >= 248 && deg < 293) compass = 'W';
    else if (deg >= 293 && deg < 338) compass = 'NW';
    document.getElementById('valWindDir').innerText = `${compass} (${deg}°)`;
    updateDownwindAqi();
  });

  const sStub = document.getElementById('sliderStubbleLoad');
  if (sStub) sStub.addEventListener('input', (e) => {
    state.cfd.stubbleLoad = parseInt(e.target.value);
    document.getElementById('valStubbleLoad').innerText = `${state.cfd.stubbleLoad}%`;
    updateDownwindAqi();
  });

  const sTraf = document.getElementById('sliderTrafficLoad');
  if (sTraf) sTraf.addEventListener('input', (e) => {
    state.cfd.trafficLoad = parseInt(e.target.value);
    document.getElementById('valTrafficLoad').innerText = `${state.cfd.trafficLoad}%`;
    updateDownwindAqi();
  });

  const selCan = document.getElementById('selectCanyons');
  if (selCan) selCan.addEventListener('change', (e) => {
    state.cfd.obstacleMode = e.target.value;
    updateCfdObstacles(width, height);
  });

  const btnToggle = document.getElementById('btnToggleCfd');
  if (btnToggle) btnToggle.addEventListener('click', () => {
    state.cfd.running = !state.cfd.running;
    btnToggle.innerText = state.cfd.running ? 'Pause Sim' : 'Resume Sim';
    btnToggle.classList.toggle('active', state.cfd.running);
  });

  const btnReset = document.getElementById('btnResetCfd');
  if (btnReset) btnReset.addEventListener('click', () => {
    state.cfd.particles = [];
    for (let i = 0; i < 450; i++) state.cfd.particles.push(createCfdParticle(width, height, true));
  });

  function updateDownwindAqi() {
    // Dynamic physics calculation based on wind + stubble load + traffic
    const base = 90;
    const stubbleContrib = (state.cfd.stubbleLoad / 100) * 160;
    const trafficContrib = (state.cfd.trafficLoad / 100) * 90;
    const windDispersionDamping = Math.max(0.65, 1.3 - (state.cfd.windSpeed / 50));
    const calculatedAqi = Math.round((base + stubbleContrib + trafficContrib) * windDispersionDamping);

    const aqiEl = document.getElementById('cfdDownwindAqi');
    if (aqiEl) {
      aqiEl.innerText = `AQI ${calculatedAqi}`;
      aqiEl.style.color = calculatedAqi > 300 ? '#dc2626' : (calculatedAqi > 200 ? '#ea580c' : '#ca8a04');
    }
  }
}

// ============================================================
// Event Listeners (Map View Switchers & Search)
// ============================================================
function setupEventListeners() {
  const btnDelhi = document.getElementById('btnViewDelhi');
  const btnIndia = document.getElementById('btnViewIndia');

  if (btnDelhi && btnIndia) {
    btnDelhi.addEventListener('click', () => {
      btnDelhi.classList.add('active');
      btnIndia.classList.remove('active');
      state.activeView = 'delhi';
      state.map.flyTo([28.6139, 77.2090], 10, { duration: 1.0 });
      applyMapFilters();
    });

    btnIndia.addEventListener('click', () => {
      btnIndia.classList.add('active');
      btnDelhi.classList.remove('active');
      state.activeView = 'india';
      state.map.flyTo([22.5, 79.0], 5, { duration: 1.0 });
      applyMapFilters();
    });
  }

  const filterSelect = document.getElementById('categoryFilter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.currentFilter = e.target.value;
      applyMapFilters();
      renderTable();
    });
  }

  const searchInput = document.getElementById('citySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderTable();
    });
  }
}
