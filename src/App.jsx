import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Truck, Wrench, Clock, User, LogOut, Plus, List, Map as MapIcon, AlertCircle, Navigation, Trash2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// ⚠️ CHANGE THESE BEFORE DEPLOYING ⚠️
// ══════════════════════════════════════════════════════════════════════════════
const APP_PASSWORD = 'orchard2026';
const ADMIN_OVERRIDE_CODE = 'admin-bypass-2026';
// ══════════════════════════════════════════════════════════════════════════════

const GEOFENCE_RADIUS_KM = 5;

const DEFAULT_USERS = [
  { id: 'u1', name: 'Alice Johnson', role: 'requester' },
  { id: 'u2', name: 'Bob Smith', role: 'requester' },
  { id: 'u3', name: 'Charlie Brown', role: 'requester' },
  { id: 'u4', name: 'Dana White', role: 'fulfiller' },
  { id: 'u5', name: 'Evan Lee', role: 'fulfiller' },
  { id: 'u6', name: 'Fiona Green', role: 'fulfiller' },
];
const DEFAULT_EQUIPMENT = [
  { id: 'e1', name: 'Tractor 1' }, { id: 'e2', name: 'Tractor 2' },
  { id: 'e3', name: 'Tractor 3' }, { id: 'e4', name: 'Sprayer A' },
  { id: 'e5', name: 'Sprayer B' }, { id: 'e6', name: 'Quad Bike 1' },
  { id: 'e7', name: 'Quad Bike 2' }, { id: 'e8', name: 'Harvester' },
];
const DEFAULT_TASKS = [
  { id: 't1', name: 'Refuelling', icon: '⛽' },
  { id: 't2', name: 'Needs Towing', icon: '🪝' },
  { id: 't3', name: 'Breakdown', icon: '🔧' },
  { id: 't4', name: 'Needs Servicing', icon: '🛠️' },
  { id: 't5', name: 'Flat Tyre', icon: '🛞' },
  { id: 't6', name: 'Battery Flat', icon: '🔋' },
];

// ── Orchard locations for geofencing + tile caching ───────────────────────────
const ORCHARDS = [
  { name: 'Jasper', center: { lat: -33.739984, lng: 115.445133 },
    bounds: { minLat: -33.758, maxLat: -33.722, minLng: 115.428, maxLng: 115.462 } },
  { name: 'Ruabon', center: { lat: -33.640372, lng: 115.456770 },
    bounds: { minLat: -33.658, maxLat: -33.622, minLng: 115.438, maxLng: 115.476 } },
  { name: 'Capel', center: { lat: -33.517044, lng: 115.558857 },
    bounds: { minLat: -33.538, maxLat: -33.496, minLng: 115.538, maxLng: 115.578 } },
];
const CACHE_ZOOM_LEVELS = [15, 16, 17, 18];
const TILE_CACHE_NAME = 'orchard-esri-tiles-v2';

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isNearAnyOrchard(lat, lng) {
  return ORCHARDS.some(o => distanceKm(lat, lng, o.center.lat, o.center.lng) <= GEOFENCE_RADIUS_KM);
}

function getTilesForBounds(bounds, zoom) {
  const lat2tile = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
  const lng2tile = (lng, z) => Math.floor((lng + 180) / 360 * Math.pow(2, z));
  const minX = lng2tile(bounds.minLng, zoom), maxX = lng2tile(bounds.maxLng, zoom);
  const minY = lat2tile(bounds.maxLat, zoom), maxY = lat2tile(bounds.minLat, zoom);
  const tiles = [];
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      tiles.push({ x, y, z: zoom });
  return tiles;
}

function getAllOrchardTiles() {
  const all = [];
  for (const orchard of ORCHARDS)
    for (const z of CACHE_ZOOM_LEVELS)
      all.push(...getTilesForBounds(orchard.bounds, z));
  return all;
}

async function precacheTiles(onProgress) {
  if (!('caches' in window)) return { cached: 0, total: 0, skipped: true };
  const tiles = getAllOrchardTiles();
  let cache;
  try { cache = await caches.open(TILE_CACHE_NAME); }
  catch { return { cached: 0, total: 0, skipped: true }; }
  let cached = 0;
  for (const { x, y, z } of tiles) {
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    try {
      const existing = await cache.match(url);
      if (!existing) {
        const resp = await fetch(url);
        if (resp.ok) await cache.put(url, resp);
      }
    } catch {}
    cached++;
    onProgress(cached, tiles.length);
  }
  return { cached, total: tiles.length };
}

// ── Local storage helpers (replaces Claude's window.storage for Stackblitz) ───
const storage = {
  get: async (key) => {
    try {
      const v = localStorage.getItem(key);
      return v ? { value: v } : null;
    } catch { return null; }
  },
  set: async (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  },
};

// ── Leaflet loader (loads CSS + JS from CDN once) ─────────────────────────────
let leafletPromise = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => setTimeout(() => resolve(window.L), 100);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// ── Canvas map ────────────────────────────────────────────────────────────────
function centerLat(jobs, myLoc) {
  const lats = [...jobs.map(j => j.lat), myLoc ? myLoc.lat : null].filter(v => v !== null);
  return lats.length ? lats.reduce((a, b) => a + b) / lats.length : -33.64;
}
function centerLng(jobs, myLoc) {
  const lngs = [...jobs.map(j => j.lng), myLoc ? myLoc.lng : null].filter(v => v !== null);
  return lngs.length ? lngs.reduce((a, b) => a + b) / lngs.length : 115.45;
}

function CanvasMap({ jobs, myLocation, currentUser, onJobSelect, height = 400 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = jobs.length ? [jobs[0].lat, jobs[0].lng]
        : myLocation ? [myLocation.lat, myLocation.lng]
        : [ORCHARDS[0].center.lat, ORCHARDS[0].center.lng];
      const map = L.map(containerRef.current, { center, zoom: 16, zoomControl: true });
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }
      ).addTo(map);
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.6 }
      ).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    }).catch(e => console.error('Leaflet load failed', e));
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Update job markers
  useEffect(() => {
    if (!ready || !window.L || !mapRef.current) return;
    const L = window.L;
    const map = mapRef.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    jobs.forEach(job => {
      const isOpen = job.status === 'open';
      const isMine = job.claimedBy === currentUser?.id;
      const color = isOpen ? '#dc2626' : isMine ? '#2563eb' : '#6b7280';
      const icon = L.divIcon({
        className: 'orchard-pin',
        html: `<div style="position:relative;transform:translate(-50%,-100%)">
          <svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
            <path d="M18 0 C8 0 0 8 0 18 C0 30 18 48 18 48 C18 48 36 30 36 18 C36 8 28 0 18 0 Z" fill="${color}" stroke="white" stroke-width="2"/>
            <circle cx="18" cy="18" r="7" fill="white"/>
          </svg>
          <div style="position:absolute;top:9px;left:50%;transform:translateX(-50%);font-size:14px">${job.taskIcon}</div>
        </div>`,
        iconSize: [36, 48], iconAnchor: [18, 48],
      });
      const m = L.marker([job.lat, job.lng], { icon }).addTo(map);
      m.on('click', () => onJobSelect && onJobSelect(job));
      markersRef.current.push(m);
    });
    if (jobs.length) {
      const bounds = L.latLngBounds(jobs.map(j => [j.lat, j.lng]));
      if (myLocation) bounds.extend([myLocation.lat, myLocation.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    }
  }, [jobs, ready, currentUser, myLocation]);

  // Update user location marker
  useEffect(() => {
    if (!ready || !window.L || !mapRef.current || !myLocation) return;
    const L = window.L;
    const map = mapRef.current;
    if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({
      className: 'user-pin',
      html: `<div style="position:relative;transform:translate(-50%,-50%)">
        <div style="width:30px;height:30px;background:rgba(59,130,246,.3);border-radius:50%;position:absolute;top:-6px;left:-6px"></div>
        <div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);position:relative"></div>
      </div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    userMarkerRef.current = L.marker([myLocation.lat, myLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
  }, [myLocation, ready]);

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-green-400 shadow-md" style={{ height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', zIndex: 0 }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-50 text-green-800 text-sm">
          Loading satellite map…
        </div>
      )}
    </div>
  );
}

// ── Pin adjuster ──────────────────────────────────────────────────────────────
function PinAdjuster({ initialLat, initialLng, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [initialLat, initialLng], zoom: 18, zoomControl: true,
      });
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }
      ).addTo(map);

      const icon = L.divIcon({
        className: 'pin-adj',
        html: `<svg width="32" height="42" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
          <path d="M18 0 C8 0 0 8 0 18 C0 30 18 48 18 48 C18 48 36 30 36 18 C36 8 28 0 18 0 Z" fill="#dc2626" stroke="white" stroke-width="2"/>
          <circle cx="18" cy="18" r="7" fill="white"/>
        </svg>`,
        iconSize: [32, 42], iconAnchor: [16, 42],
      });
      const marker = L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChange(p.lat, p.lng);
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      markerRef.current = marker;
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    }).catch(e => console.error('Leaflet load failed', e));

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden border-2 border-green-400" style={{ height: 220 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', zIndex: 0 }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-50 text-green-800 text-xs">
          Loading satellite…
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function OrchardApp() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [showNewJob, setShowNewJob] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [notification, setNotification] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [cacheProgress, setCacheProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('orchard-auth');
      if (stored === 'ok') setAuthed(true);
    } catch {}
    setAuthChecking(false);
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const runCache = async () => {
      try {
        const stored = await storage.get('tile-cache-done');
        if (stored?.value === TILE_CACHE_NAME) return;
      } catch {}
      setCacheStatus('downloading');
      const result = await precacheTiles((done, total) => setCacheProgress({ done, total }));
      if (result.skipped) setCacheStatus('skipped');
      else {
        setCacheStatus('done');
        try { await storage.set('tile-cache-done', TILE_CACHE_NAME); } catch {}
        setTimeout(() => setCacheStatus(null), 4000);
      }
    };
    runCache();
  }, [authed]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setMyLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setMyLocation({ lat: -33.64, lng: 115.45 }),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setMyLocation({ lat: -33.64, lng: 115.45 });
    }
  }, []);

  const loadJobs = async () => {
    try {
      const r = await storage.get('orchard-jobs');
      setJobs(r?.value ? JSON.parse(r.value) : []);
    } catch { setJobs([]); }
    setLoading(false);
  };

  const saveJobs = async (updated) => {
    await storage.set('orchard-jobs', JSON.stringify(updated));
    setJobs(updated);
  };

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCreateJob = async (job) => {
    const newJob = { id: `job_${Date.now()}`, ...job, requesterId: currentUser.id, requesterName: currentUser.name, status: 'open', createdAt: Date.now(), claimedBy: null, claimedByName: null, completedAt: null };
    await saveJobs([newJob, ...jobs]);
    setShowNewJob(false);
    showNotif('Task submitted!');
  };

  const handleClaim = async (jobId) => {
    await saveJobs(jobs.map(j => j.id === jobId ? { ...j, status: 'claimed', claimedBy: currentUser.id, claimedByName: currentUser.name, claimedAt: Date.now() } : j));
    showNotif('Task claimed');
  };

  const handleComplete = async (jobId) => {
    await saveJobs(jobs.map(j => j.id === jobId ? { ...j, status: 'completed', completedAt: Date.now() } : j));
    showNotif('Task completed ✓');
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('Delete this task?')) return;
    await saveJobs(jobs.filter(j => j.id !== jobId));
  };

  if (authChecking || loading) return <div className="flex items-center justify-center h-screen bg-green-50"><div className="text-green-800">Loading…</div></div>;
  if (!authed) return <GateScreen onSuccess={() => { try { sessionStorage.setItem('orchard-auth', 'ok'); } catch {} setAuthed(true); }} />;
  if (!currentUser) return <LoginScreen users={DEFAULT_USERS} onSelect={setCurrentUser} />;

  const activeJobs = jobs.filter(j => j.status !== 'completed');
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const openJobs = activeJobs.filter(j => j.status === 'open');

  return (
    <div className="min-h-screen bg-green-50 pb-24">
      <div className="bg-green-800 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl">🥑</div>
            <div>
              <div className="font-bold">Orchard Tasks</div>
              <div className="text-xs text-green-200">{currentUser.name} · {currentUser.role === 'requester' ? 'Requester' : 'Fulfiller'}</div>
            </div>
          </div>
          <button onClick={() => setCurrentUser(null)} className="p-2 hover:bg-green-700 rounded-full"><LogOut size={20} /></button>
        </div>
      </div>

      {cacheStatus === 'downloading' && (
        <div className="bg-blue-600 text-white px-4 py-2 text-sm flex items-center gap-3">
          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full flex-shrink-0" />
          <div className="flex-1">
            <div>Downloading satellite map for offline use…</div>
            <div className="mt-1 bg-blue-500 rounded-full h-1.5 w-full">
              <div className="bg-white h-1.5 rounded-full transition-all duration-300"
                style={{ width: cacheProgress.total ? `${(cacheProgress.done / cacheProgress.total) * 100}%` : '0%' }} />
            </div>
            <div className="text-blue-200 text-xs mt-0.5">
              {cacheProgress.done} / {cacheProgress.total} tiles — Jasper · Ruabon · Capel
            </div>
          </div>
          <button onClick={() => setCacheStatus(null)} className="text-white underline text-xs">Skip</button>
        </div>
      )}
      {cacheStatus === 'done' && (
        <div className="bg-green-600 text-white px-4 py-2 text-sm flex items-center gap-2">
          <span>✅</span> Satellite map ready offline — all 3 orchards cached
        </div>
      )}
      {cacheStatus === 'skipped' && (
        <div className="bg-gray-500 text-white px-4 py-2 text-xs flex items-center gap-2">
          <span>ℹ️</span> Offline map cache not available in this environment
        </div>
      )}

      {notification && (
        <div className={`fixed top-20 left-4 right-4 z-50 p-3 rounded-lg shadow-lg text-white text-center ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {notification.msg}
        </div>
      )}

      <div className="p-4">
        {currentUser.role === 'requester' ? (
          <RequesterView jobs={jobs.filter(j => j.requesterId === currentUser.id)} onNewJob={() => setShowNewJob(true)} onDelete={handleDelete} />
        ) : (
          <FulfillerView
            activeJobs={activeJobs} completedJobs={completedJobs} openJobs={openJobs}
            view={view} setView={setView}
            onClaim={handleClaim} onComplete={handleComplete}
            showHistory={showHistory} setShowHistory={setShowHistory}
            currentUser={currentUser} myLocation={myLocation}
          />
        )}
      </div>

      {showNewJob && (
        <NewJobModal
          equipment={DEFAULT_EQUIPMENT} taskTypes={DEFAULT_TASKS}
          onSubmit={handleCreateJob} onCancel={() => setShowNewJob(false)}
          myLocation={myLocation}
        />
      )}
    </div>
  );
}

function GateScreen({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState('checking');
  const [showAdminOverride, setShowAdminOverride] = useState(false);
  const [overrideCode, setOverrideCode] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) { setLocationStatus('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocationStatus(isNearAnyOrchard(pos.coords.latitude, pos.coords.longitude) ? 'ok' : 'offsite'),
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const tryLogin = () => {
    if (password !== APP_PASSWORD) { setError('Wrong password'); return; }
    if (locationStatus === 'ok') { onSuccess(); return; }
    if (overrideCode === ADMIN_OVERRIDE_CODE) { onSuccess(); return; }
    setShowAdminOverride(true);
    setError('You appear to be off-site. Enter the admin override code below to continue.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 p-6 flex flex-col items-center justify-center">
      <div className="text-center text-white mb-8">
        <div className="text-6xl mb-3">🥑</div>
        <h1 className="text-3xl font-bold">Orchard Tasks</h1>
        <p className="text-green-200 mt-2 text-sm">Restricted access</p>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
        <div className={`rounded-lg p-3 mb-4 text-sm flex items-start gap-2 ${
          locationStatus === 'ok' ? 'bg-green-50 text-green-800' :
          locationStatus === 'checking' ? 'bg-blue-50 text-blue-800' :
          'bg-yellow-50 text-yellow-800'
        }`}>
          {locationStatus === 'checking' && <><div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full mt-0.5" /><span>Checking location…</span></>}
          {locationStatus === 'ok' && <><span>📍</span><span>On-site — access granted after password</span></>}
          {locationStatus === 'offsite' && <><span>⚠️</span><span>Off-site — admin override required</span></>}
          {locationStatus === 'denied' && <><span>⚠️</span><span>Location unavailable — admin override required</span></>}
        </div>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
        <input type="password" value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
          className="w-full border border-gray-300 rounded-lg p-3 mb-3 focus:outline-none focus:border-green-600"
          placeholder="Enter password" autoFocus />

        {showAdminOverride && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Admin override code</label>
            <input type="password" value={overrideCode}
              onChange={(e) => { setOverrideCode(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
              className="w-full border border-gray-300 rounded-lg p-3 mb-3 focus:outline-none focus:border-green-600"
              placeholder="Admin code" />
          </div>
        )}

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        <button onClick={tryLogin} disabled={locationStatus === 'checking'}
          className="w-full bg-green-700 hover:bg-green-800 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg">
          Unlock
        </button>
        <div className="text-xs text-gray-400 mt-4 text-center">Authorised workers only</div>
      </div>
    </div>
  );
}

function LoginScreen({ users, onSelect }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 p-6 flex flex-col">
      <div className="text-center text-white mb-8 mt-8">
        <div className="text-6xl mb-3">🥑</div>
        <h1 className="text-3xl font-bold">Orchard Tasks</h1>
        <p className="text-green-200 mt-2">Select your name to continue</p>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-xl flex-1 overflow-y-auto">
        {['requester', 'fulfiller'].map(role => (
          <div key={role} className="mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{role}s</h2>
            {users.filter(u => u.role === role).map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className="w-full flex items-center gap-3 p-3 hover:bg-green-50 rounded-lg border border-transparent hover:border-green-200 transition mb-1">
                <div className={`w-10 h-10 ${role === 'requester' ? 'bg-blue-100' : 'bg-orange-100'} rounded-full flex items-center justify-center`}>
                  {role === 'requester' ? <User size={20} className="text-blue-700" /> : <Wrench size={20} className="text-orange-700" />}
                </div>
                <span className="font-medium text-gray-800">{u.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RequesterView({ jobs, onNewJob, onDelete }) {
  return (
    <div>
      <button onClick={onNewJob} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mb-6">
        <Plus size={24} /> New Task Request
      </button>
      <JobSection title="Waiting" jobs={jobs.filter(j => j.status === 'open')} onDelete={onDelete} showDelete />
      <JobSection title="In Progress" jobs={jobs.filter(j => j.status === 'claimed')} />
      <JobSection title="Completed" jobs={jobs.filter(j => j.status === 'completed').slice(0, 5)} />
    </div>
  );
}

function JobSection({ title, jobs, onDelete, showDelete }) {
  if (!jobs.length) return null;
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">{title} ({jobs.length})</h3>
      <div className="space-y-2">
        {jobs.map(job => (
          <div key={job.id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{job.taskIcon}</span>
                  <span className="font-semibold">{job.taskName}</span>
                </div>
                <div className="text-sm text-gray-600">{job.equipmentName}</div>
                {job.note && <div className="text-sm text-gray-500 italic mt-1">"{job.note}"</div>}
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Clock size={12} /> {formatTime(job.createdAt)}
                  {job.claimedByName && <span className="ml-1">· {job.claimedByName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={job.status} />
                {showDelete && onDelete && (
                  <button onClick={() => onDelete(job.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FulfillerView({ activeJobs, completedJobs, openJobs, view, setView, onClaim, onComplete, showHistory, setShowHistory, currentUser, myLocation }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const myClaimedJobs = activeJobs.filter(j => j.status === 'claimed' && j.claimedBy === currentUser.id);
  const othersClaimedJobs = activeJobs.filter(j => j.status === 'claimed' && j.claimedBy !== currentUser.id);

  return (
    <div>
      <div className="flex gap-2 mb-4 bg-white rounded-lg p-1 shadow-sm">
        <button onClick={() => setView('list')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 font-medium ${view === 'list' ? 'bg-green-700 text-white' : 'text-gray-600'}`}>
          <List size={18} />List
        </button>
        <button onClick={() => setView('map')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 font-medium ${view === 'map' ? 'bg-green-700 text-white' : 'text-gray-600'}`}>
          <MapIcon size={18} />Map
        </button>
      </div>

      {openJobs.length > 0 && (
        <div className="bg-orange-100 border-l-4 border-orange-500 p-3 mb-4 rounded-r-lg flex items-center gap-2">
          <AlertCircle size={20} className="text-orange-600" />
          <span className="font-semibold text-orange-900">{openJobs.length} open {openJobs.length === 1 ? 'task' : 'tasks'} waiting</span>
        </div>
      )}

      {view === 'list' ? (
        <div className="space-y-4">
          <ActionableSection title="🆕 Open tasks" jobs={openJobs} actionLabel="Claim Task" onAction={onClaim} color="bg-green-600 hover:bg-green-700" />
          <ActionableSection title="👷 My claimed tasks" jobs={myClaimedJobs} actionLabel="Mark Complete" onAction={onComplete} color="bg-blue-600 hover:bg-blue-700" />
          <JobSection title="Claimed by others" jobs={othersClaimedJobs} />
          <button onClick={() => setShowHistory(!showHistory)} className="w-full text-center text-sm text-gray-600 underline py-2">
            {showHistory ? 'Hide' : 'Show'} completed history ({completedJobs.length})
          </button>
          {showHistory && <JobSection title="Completed" jobs={completedJobs} />}
        </div>
      ) : (
        <div>
          <CanvasMap jobs={activeJobs} myLocation={myLocation} currentUser={currentUser} onJobSelect={setSelectedJob} height={480} />
          <div className="flex gap-4 justify-center text-xs mt-2 text-gray-600">
            <span>🔴 Open</span><span>🔵 Mine</span><span>⚫ Others</span><span>🔵● You</span>
          </div>
          {activeJobs.length === 0 && <div className="text-center text-sm text-gray-500 mt-2">No active tasks on map</div>}
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">{selectedJob.taskIcon}</span>
              <div>
                <div className="font-bold text-lg">{selectedJob.taskName}</div>
                <div className="text-gray-700">{selectedJob.equipmentName}</div>
                <div className="text-sm text-gray-500">by {selectedJob.requesterName}</div>
                {selectedJob.claimedByName && <div className="text-sm text-blue-600">Claimed by {selectedJob.claimedByName}</div>}
              </div>
            </div>
            {selectedJob.note && <div className="text-sm italic text-gray-600 mb-3">"{selectedJob.note}"</div>}
            <div className="bg-gray-50 rounded p-2 text-xs mb-3 flex items-center gap-2">
              <MapPin size={12} className="text-red-600" />{selectedJob.lat.toFixed(5)}, {selectedJob.lng.toFixed(5)}
            </div>
            <div className="flex gap-2">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedJob.lat},${selectedJob.lng}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg text-center flex items-center justify-center gap-1">
                <Navigation size={16} /> Navigate
              </a>
              {selectedJob.status === 'open' && (
                <button onClick={() => { onClaim(selectedJob.id); setSelectedJob(null); }} className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg">Claim</button>
              )}
              {selectedJob.status === 'claimed' && selectedJob.claimedBy === currentUser.id && (
                <button onClick={() => { onComplete(selectedJob.id); setSelectedJob(null); }} className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg">Complete</button>
              )}
            </div>
            <button onClick={() => setSelectedJob(null)} className="w-full text-gray-500 text-sm mt-2 py-1">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionableSection({ title, jobs, actionLabel, onAction, color }) {
  if (!jobs.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-2">
        {jobs.map(job => (
          <div key={job.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-600">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-2xl">{job.taskIcon}</span>
              <div className="flex-1">
                <div className="font-bold">{job.taskName}</div>
                <div className="text-sm text-gray-700">{job.equipmentName}</div>
                <div className="text-xs text-gray-500">Requested by {job.requesterName}</div>
                {job.note && <div className="text-sm italic text-gray-600 mt-1">"{job.note}"</div>}
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock size={12} />{formatTime(job.createdAt)}</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded p-2 text-xs mb-2 flex items-center gap-2">
              <MapPin size={12} className="text-red-600" />{job.lat.toFixed(5)}, {job.lng.toFixed(5)}
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-blue-600 font-medium flex items-center gap-1"><Navigation size={12} />Navigate</a>
            </div>
            <button onClick={() => onAction(job.id)} className={`w-full text-white font-semibold py-2 rounded-lg ${color}`}>{actionLabel}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewJobModal({ equipment, taskTypes, onSubmit, onCancel, myLocation }) {
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState({ equipment: null, task: null });
  const [location, setLocation] = useState(myLocation || { lat: -33.64, lng: 115.45 });
  const [adjLocation, setAdjLocation] = useState(null);
  const [note, setNote] = useState('');
  const [gpsStatus, setGpsStatus] = useState(myLocation ? 'success' : 'fallback');

  const recapture = () => {
    setGpsStatus('loading');
    navigator.geolocation?.getCurrentPosition(
      p => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setAdjLocation(null); setGpsStatus('success'); },
      () => setGpsStatus('fallback'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const finalLoc = adjLocation || location;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">New Task · Step {step} of 4</h2>
          <button onClick={onCancel} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-4">
          {step === 1 && (
            <div>
              <h3 className="font-semibold mb-3">Which equipment?</h3>
              <div className="grid grid-cols-2 gap-2">
                {equipment.map(e => (
                  <button key={e.id} onClick={() => { setSel(s => ({ ...s, equipment: e })); setStep(2); }}
                    className="p-4 border-2 border-gray-200 hover:border-green-600 hover:bg-green-50 rounded-lg text-left">
                    <Truck size={20} className="text-green-700 mb-1" />{e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="bg-green-50 rounded p-2 text-sm mb-3"><strong>{sel.equipment?.name}</strong></div>
              <h3 className="font-semibold mb-3">What's needed?</h3>
              <div className="grid grid-cols-2 gap-2">
                {taskTypes.map(t => (
                  <button key={t.id} onClick={() => { setSel(s => ({ ...s, task: t })); setStep(3); }}
                    className="p-4 border-2 border-gray-200 hover:border-green-600 hover:bg-green-50 rounded-lg text-left">
                    <div className="text-2xl mb-1">{t.icon}</div>{t.name}
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="text-sm text-gray-500 mt-3">← Back</button>
            </div>
          )}
          {step === 3 && (
            <div>
              <div className="bg-green-50 rounded p-2 text-sm mb-3"><strong>{sel.equipment?.name}</strong> · {sel.task?.name}</div>
              <h3 className="font-semibold mb-2">Location</h3>
              {gpsStatus === 'fallback' && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 mb-2">GPS unavailable — using demo location. Adjust pin on map.</div>
              )}
              {gpsStatus === 'loading' && <div className="p-2 bg-blue-50 rounded text-sm mb-2">📡 Getting GPS…</div>}
              <div className="bg-gray-50 rounded p-2 text-xs mb-3 flex items-center gap-2">
                <MapPin size={12} className="text-red-600" />{finalLoc.lat.toFixed(6)}, {finalLoc.lng.toFixed(6)}
              </div>
              <PinAdjuster initialLat={location.lat} initialLng={location.lng} onChange={(lat, lng) => setAdjLocation({ lat, lng })} />
              <button onClick={recapture} className="w-full text-sm text-blue-600 py-2 mt-1">🔄 Re-capture GPS</button>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setStep(2)} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700">Back</button>
                <button onClick={() => setStep(4)} className="flex-1 py-2 bg-green-700 text-white rounded-lg font-semibold">Next</button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div>
              <h3 className="font-semibold mb-3">Add a note (optional)</h3>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Near the eastern fence, won't start…"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm h-24 focus:outline-none focus:border-green-600" />
              <div className="bg-gray-50 rounded p-3 mt-3 text-sm space-y-1">
                <div>📦 <strong>{sel.equipment?.name}</strong></div>
                <div>{sel.task?.icon} <strong>{sel.task?.name}</strong></div>
                <div>📍 {finalLoc.lat.toFixed(5)}, {finalLoc.lng.toFixed(5)}</div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(3)} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700">Back</button>
                <button onClick={() => onSubmit({ equipmentId: sel.equipment.id, equipmentName: sel.equipment.name, taskId: sel.task.id, taskName: sel.task.name, taskIcon: sel.task.icon, lat: finalLoc.lat, lng: finalLoc.lng, note })}
                  className="flex-1 py-3 bg-green-700 text-white rounded-lg font-bold">Submit Task</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const c = { open: 'bg-orange-100 text-orange-800', claimed: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800' }[status];
  const l = { open: 'Open', claimed: 'Claimed', completed: 'Done' }[status];
  return <span className={`${c} text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap`}>{l}</span>;
}

function formatTime(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : new Date(ts).toLocaleDateString();
}