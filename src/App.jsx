import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Truck, Wrench, Clock, User, LogOut, Plus, List, Map as MapIcon, AlertCircle, Navigation, Trash2, Settings, Edit2, Download, Upload, X, Check } from 'lucide-react';
import { db } from './firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

// ══════════════════════════════════════════════════════════════════════════════
// ⚠️ CHANGE THESE BEFORE DEPLOYING ⚠️
// ══════════════════════════════════════════════════════════════════════════════
const APP_PASSWORD = 'avocado123';
const ADMIN_OVERRIDE_CODE = 'admin-bypass-2026';
// ══════════════════════════════════════════════════════════════════════════════

const GEOFENCE_RADIUS_KM = 5;

const DEFAULT_USERS = [
  { id: 'u1', name: 'Alice Johnson', role: 'requester', color: '#3b82f6' },
  { id: 'u2', name: 'Bob Smith', role: 'requester', color: '#10b981' },
  { id: 'u3', name: 'Charlie Brown', role: 'requester', color: '#f59e0b' },
  { id: 'u4', name: 'Dana White', role: 'fulfiller', color: '#ef4444', specialities: ['General'] },
  { id: 'u5', name: 'Evan Lee', role: 'fulfiller', color: '#8b5cf6', specialities: ['Repair', 'Towing'] },
  { id: 'u6', name: 'Fiona Green', role: 'fulfiller', color: '#ec4899', specialities: ['Fuel Ute'] },
];

const FULFILLER_SPECIALITIES = ['General', 'Fuel Ute', 'Repair', 'Towing'];

const DEFAULT_EQUIPMENT = [
  { id: 'e1', name: 'Tractor 1', icon: '🚜' },
  { id: 'e2', name: 'Tractor 2', icon: '🚜' },
  { id: 'e3', name: 'Fuel Ute', icon: '⛽' },
  { id: 'e4', name: 'EWP (Cherry Picker)', icon: '🪜' },
  { id: 'e5', name: 'Harvest Trailer 1', icon: '🚛' },
  { id: 'e6', name: 'Harvest Trailer 2', icon: '🚛' },
  { id: 'e7', name: 'Avocado Bin', icon: '🥑' },
  { id: 'e8', name: 'RTV 1', icon: '🛺' },
  { id: 'e9', name: 'RTV 2', icon: '🛺' },
  { id: 'e10', name: 'Sprayer A', icon: '💨' },
  { id: 'e11', name: 'Quad Bike 1', icon: '🏍️' },
  { id: 'e12', name: 'Harvester', icon: '🌾' },
];
const DEFAULT_TASKS = [
  { id: 't1', name: 'Refuelling', icon: '⛽' },
  { id: 't2', name: 'Needs Towing', icon: '🪝' },
  { id: 't3', name: 'Breakdown', icon: '🔧' },
  { id: 't4', name: 'Needs Servicing', icon: '🛠️' },
  { id: 't5', name: 'Flat Tyre', icon: '🛞' },
  { id: 't6', name: 'Battery Flat', icon: '🔋' },
];

const USER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#14b8a6', '#6366f1', '#d946ef'];
const EQUIPMENT_ICONS = [
  '🚜', '🌾', '🧑‍🌾', '👨‍🌾', '👩‍🌾',
  '🛻', '🚛', '🚚', '🚐', '🚗', '🚙',
  '🛺', '🏍️', '🛵', '🚲',
  '🏗️', '🪜', '🛗', '⬆️', '🧗',
  '⛽', '💧', '💦', '💨', '🛢️',
  '🥑', '📦', '🪣', '🧺', '🗑️', '🛒',
  '🔧', '🛠️', '🪚', '🪓', '⛏️', '🔨', '🪛', '🧰',
  '🔋', '⚡', '🧯', '⚙️', '🔩', '🛞',
  '🚁', '🛩️', '🚤'
];
const TASK_ICONS = [
  '⛽', '🪝', '🔧', '🛠️', '🛞', '🔋',
  '⚠️', '🚨', '🆘', '❌', '🛑', '🔔',
  '🔥', '💧', '💦', '❄️', '💨', '⚡',
  '🔩', '⚙️', '🧰', '🪛', '🔨', '🪚',
  '📞', '📸', '📋', '✅', '✏️', '📝',
  '⏰', '🕐', '⏳',
  '💡', '🧹', '♻️', '🗑️'
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

// ── Notification helpers ──────────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.value = 1100;
      g2.gain.setValueAtTime(0.3, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      o2.start();
      o2.stop(ctx.currentTime + 0.3);
    }, 180);
  } catch {}
}
function vibrate() {
  try { navigator.vibrate?.([100, 50, 100]); } catch {}
}
function showBrowserNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg', tag: 'orchard-task' });
    }
  } catch {}
}

// ── Confirmation dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
        <div className="text-gray-900 font-semibold mb-4 text-center">{message}</div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg font-medium">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
async function firestoreSaveJob(job) {
  await setDoc(doc(db, 'jobs', job.id), job);
}
async function firestoreDeleteJob(id) {
  await deleteDoc(doc(db, 'jobs', id));
}
async function firestoreSaveItem(collName, item) {
  await setDoc(doc(db, collName, item.id), item);
}
async function firestoreDeleteItem(collName, id) {
  await deleteDoc(doc(db, collName, id));
}
async function firestoreSaveList(collName, items) {
  for (const item of items) await setDoc(doc(db, collName, item.id), item);
}
function subscribeCollection(name, callback) {
  return onSnapshot(collection(db, name), (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

// ── Leaflet loader ────────────────────────────────────────────────────────────
let leafletPromise = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    // Add tiny CSS fix for divIcon defaults
    const style = document.createElement('style');
    style.innerHTML = `
      .orchard-pin, .user-pin, .pin-adj {
        background: transparent !important;
        border: 0 !important;
      }
    `;
    document.head.appendChild(style);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => setTimeout(() => resolve(window.L), 100);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// ── Leaflet Map with task pins ────────────────────────────────────────────────
function CanvasMap({ jobs, myLocation, currentUser, onClaim, onComplete, height = 400 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    window.__orchardClaim = (id) => onClaim && onClaim(id);
    window.__orchardComplete = (id) => onComplete && onComplete(id);
    return () => {
      delete window.__orchardClaim;
      delete window.__orchardComplete;
    };
  }, [onClaim, onComplete]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = jobs.length ? [jobs[0].lat, jobs[0].lng]
        : myLocation ? [myLocation.lat, myLocation.lng]
        : [ORCHARDS[0].center.lat, ORCHARDS[0].center.lng];
      const map = L.map(containerRef.current, {
        center, zoom: 16, zoomControl: true,
        scrollWheelZoom: false,  // disable plain scroll-zoom on desktop (was blocking page scroll)
      });
      // Enable Ctrl/Cmd+scroll to zoom on desktop (still allows pinch-zoom on mobile)
      containerRef.current.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          map.scrollWheelZoom.enable();
          setTimeout(() => map.scrollWheelZoom.disable(), 200);
        }
      }, { passive: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.6 }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    }).catch(e => console.error('Leaflet load failed', e));
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

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
        html: `<div style="position:relative;width:36px;height:48px">
          <svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));display:block">
            <path d="M18 0 C8 0 0 8 0 18 C0 30 18 48 18 48 C18 48 36 30 36 18 C36 8 28 0 18 0 Z" fill="${color}" stroke="white" stroke-width="2"/>
            <circle cx="18" cy="18" r="7" fill="white"/>
          </svg>
          <div style="position:absolute;top:9px;left:0;width:36px;text-align:center;font-size:14px;line-height:1">${job.taskIcon}</div>
        </div>`,
        iconSize: [36, 48], iconAnchor: [18, 48], popupAnchor: [0, -48],
      });
      const m = L.marker([job.lat, job.lng], { icon }).addTo(map);

      const statusText = job.status === 'open' ? '🆕 Open'
        : job.status === 'claimed' ? `👷 Claimed by ${job.claimedByName || 'someone'}`
        : '✅ Completed';
      const mins = Math.floor((Date.now() - job.createdAt) / 60000);
      const timeAgo = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ago`;
      const noteHtml = job.note ? `<div style="font-style:italic;color:#6b7280;margin-top:6px;font-size:12px">"${String(job.note).replace(/"/g, '&quot;')}"</div>` : '';
      const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
      const popupHtml = `
        <div style="min-width:200px;padding:4px">
          <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px">
            <span style="font-size:24px">${job.taskIcon}</span>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14px;color:#111">${job.taskName}</div>
              <div style="font-size:12px;color:#4b5563">${job.equipmentIcon || ''} ${job.equipmentName}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">by ${job.requesterName} · ${timeAgo}</div>
            </div>
          </div>
          <div style="font-size:11px;color:#374151;margin-bottom:6px">${statusText}</div>
          ${noteHtml}
          <div style="display:flex;gap:6px;margin-top:10px">
            <a href="${navUrl}" target="_blank" rel="noopener" style="flex:1;background:#e5e7eb;color:#111;text-decoration:none;padding:8px;border-radius:6px;text-align:center;font-size:12px;font-weight:600">🧭 Navigate</a>
            ${job.status === 'open' ? `<button onclick="window.__orchardClaim && window.__orchardClaim('${job.id}')" style="flex:1;background:#16a34a;color:white;border:0;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Claim</button>` : ''}
            ${job.status === 'claimed' && isMine ? `<button onclick="window.__orchardComplete && window.__orchardComplete('${job.id}')" style="flex:1;background:#2563eb;color:white;border:0;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Complete</button>` : ''}
          </div>
        </div>
      `;
      m.bindPopup(popupHtml, { maxWidth: 280, className: 'orchard-popup' });
      markersRef.current.push(m);
    });
    if (jobs.length) {
      const bounds = L.latLngBounds(jobs.map(j => [j.lat, j.lng]));
      if (myLocation) bounds.extend([myLocation.lat, myLocation.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    }
  }, [jobs, ready, currentUser, myLocation]);

  useEffect(() => {
    if (!ready || !window.L || !mapRef.current || !myLocation) return;
    const L = window.L;
    const map = mapRef.current;
    if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({
      className: 'user-pin',
      html: `<div style="position:relative;width:18px;height:18px">
        <div style="width:30px;height:30px;background:rgba(59,130,246,.3);border-radius:50%;position:absolute;top:-6px;left:-6px"></div>
        <div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);position:absolute;top:0;left:0;box-sizing:border-box"></div>
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

// ── Pin adjuster for new task ─────────────────────────────────────────────────
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
        scrollWheelZoom: false,
      });
      containerRef.current.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          map.scrollWheelZoom.enable();
          setTimeout(() => map.scrollWheelZoom.disable(), 200);
        }
      }, { passive: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }).addTo(map);
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

  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([initialLat, initialLng]);
    mapRef.current.setView([initialLat, initialLng], mapRef.current.getZoom(), { animate: true });
  }, [initialLat, initialLng, ready]);

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
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [equipment, setEquipment] = useState(DEFAULT_EQUIPMENT);
  const [taskTypes, setTaskTypes] = useState(DEFAULT_TASKS);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [showNewJob, setShowNewJob] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
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

  // Subscribe to dimension tables (real-time from Firestore)
  useEffect(() => {
    const unsubUsers = subscribeCollection('users', (items) => {
      if (items.length === 0) firestoreSaveList('users', DEFAULT_USERS);
      else setUsers(items);
    });
    const unsubEquip = subscribeCollection('equipment', (items) => {
      if (items.length === 0) firestoreSaveList('equipment', DEFAULT_EQUIPMENT);
      else setEquipment(items);
    });
    const unsubTasks = subscribeCollection('tasks', (items) => {
      if (items.length === 0) firestoreSaveList('tasks', DEFAULT_TASKS);
      else setTaskTypes(items);
    });
    return () => { unsubUsers(); unsubEquip(); unsubTasks(); };
  }, []);

  // Subscribe to jobs (real-time) and trigger notifications on changes
  const prevJobsRef = useRef([]);
  const currentUserRef = useRef(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  useEffect(() => {
    const unsub = subscribeCollection('jobs', (newJobs) => {
      const cu = currentUserRef.current;
      if (cu && prevJobsRef.current.length > 0) {
        const prevIds = new Set(prevJobsRef.current.map(j => j.id));
        const prevById = Object.fromEntries(prevJobsRef.current.map(j => [j.id, j]));

        if (cu.role === 'fulfiller') {
          const newOpen = newJobs.filter(j => j.status === 'open' && !prevIds.has(j.id));
          newOpen.forEach(j => {
            playNotificationSound();
            vibrate();
            showBrowserNotification('🆕 New task', `${j.taskIcon} ${j.taskName} · ${j.equipmentName}`);
            setNotification({ msg: `🆕 New task: ${j.taskName} (${j.equipmentName})`, type: 'info' });
            setTimeout(() => setNotification(null), 5000);
          });
        }

        if (cu.role === 'requester') {
          newJobs.forEach(j => {
            const prev = prevById[j.id];
            if (prev && prev.status !== 'completed' && j.status === 'completed' && j.requesterId === cu.id) {
              playNotificationSound();
              vibrate();
              showBrowserNotification('✅ Task completed', `${j.taskIcon} ${j.taskName} done by ${j.claimedByName || 'a fulfiller'}`);
              setNotification({ msg: `✅ Your task "${j.taskName}" has been completed!`, type: 'success' });
              setTimeout(() => setNotification(null), 5000);
            }
          });
        }
      }
      prevJobsRef.current = newJobs;
      setJobs(newJobs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Ask for notification permission
  useEffect(() => {
    if (authed) requestNotificationPermission();
  }, [authed]);

  // Tile pre-cache
  useEffect(() => {
    if (!authed) return;
    const runCache = async () => {
      try {
        const stored = localStorage.getItem('tile-cache-done');
        if (stored === TILE_CACHE_NAME) return;
      } catch {}
      setCacheStatus('downloading');
      const result = await precacheTiles((done, total) => setCacheProgress({ done, total }));
      if (result.skipped) setCacheStatus('skipped');
      else {
        setCacheStatus('done');
        try { localStorage.setItem('tile-cache-done', TILE_CACHE_NAME); } catch {}
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

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ── Firestore-based save functions ────────────────────────────────────────
  const saveJobs = async (updated) => {
    const currentIds = new Set(jobs.map(j => j.id));
    const updatedIds = new Set(updated.map(j => j.id));
    for (const j of updated) await firestoreSaveJob(j);
    for (const id of currentIds) if (!updatedIds.has(id)) await firestoreDeleteJob(id);
  };
  const saveUsers = async (updated) => {
    const currentIds = new Set(users.map(u => u.id));
    const updatedIds = new Set(updated.map(u => u.id));
    for (const u of updated) await firestoreSaveItem('users', u);
    for (const id of currentIds) if (!updatedIds.has(id)) await firestoreDeleteItem('users', id);
  };
  const saveEquipment = async (updated) => {
    const currentIds = new Set(equipment.map(e => e.id));
    const updatedIds = new Set(updated.map(e => e.id));
    for (const e of updated) await firestoreSaveItem('equipment', e);
    for (const id of currentIds) if (!updatedIds.has(id)) await firestoreDeleteItem('equipment', id);
  };
  const saveTaskTypes = async (updated) => {
    const currentIds = new Set(taskTypes.map(t => t.id));
    const updatedIds = new Set(updated.map(t => t.id));
    for (const t of updated) await firestoreSaveItem('tasks', t);
    for (const id of currentIds) if (!updatedIds.has(id)) await firestoreDeleteItem('tasks', id);
  };

  const handleCreateJob = async (job) => {
    const newJob = {
      id: `job_${Date.now()}`, ...job,
      requesterId: currentUser.id, requesterName: currentUser.name, requesterColor: currentUser.color,
      status: 'open', createdAt: Date.now(),
      claimedBy: null, claimedByName: null, completedAt: null,
      archived: false,
      editHistory: [],
    };
    await firestoreSaveJob(newJob);
    setShowNewJob(false);
    showNotif('Task submitted!');
  };

  const handleEditJob = async (jobId, updates) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const editEntry = {
      editedAt: Date.now(),
      editedBy: currentUser.id,
      editedByName: currentUser.name,
      changes: Object.keys(updates),
    };
    await firestoreSaveJob({
      ...job,
      ...updates,
      editHistory: [...(job.editHistory || []), editEntry],
    });
    showNotif('Task updated');
  };

  const handleClaim = async (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    await firestoreSaveJob({ ...job, status: 'claimed', claimedBy: currentUser.id, claimedByName: currentUser.name, claimedColor: currentUser.color, claimedAt: Date.now() });
    showNotif('Task claimed');
  };

  const handleComplete = async (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    await firestoreSaveJob({ ...job, status: 'completed', completedAt: Date.now() });
    showNotif('Task completed ✓');
  };

  const handleArchive = async (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    await firestoreSaveJob({
      ...job,
      archived: true,
      archivedAt: Date.now(),
      archivedBy: currentUser.id,
      archivedByName: currentUser.name,
    });
    showNotif('Task archived (kept in records)');
  };

  const [confirmDelJob, setConfirmDelJob] = useState(null);
  const [confirmArchiveJob, setConfirmArchiveJob] = useState(null);
  const handleDelete = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    setConfirmDelJob(job);
  };
  const handleArchiveRequest = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    setConfirmArchiveJob(job);
  };
  const doDeleteJob = async () => {
    if (confirmDelJob) await firestoreDeleteJob(confirmDelJob.id);
    setConfirmDelJob(null);
  };
  const doArchiveJob = async () => {
    if (confirmArchiveJob) await handleArchive(confirmArchiveJob.id);
    setConfirmArchiveJob(null);
  };

  if (authChecking || loading) return <div className="flex items-center justify-center h-screen bg-green-50"><div className="text-green-800">Loading…</div></div>;
  if (!authed) return <GateScreen onSuccess={() => { try { sessionStorage.setItem('orchard-auth', 'ok'); } catch {} setAuthed(true); }} />;
  if (showAdmin) return <AdminScreen users={users} equipment={equipment} taskTypes={taskTypes} saveUsers={saveUsers} saveEquipment={saveEquipment} saveTaskTypes={saveTaskTypes} onClose={() => setShowAdmin(false)} showNotif={showNotif} />;
  if (!currentUser) return <LoginScreen users={users} onSelect={setCurrentUser} onAdmin={() => setShowAdmin(true)} />;

  const visibleJobs = jobs.filter(j => !j.archived);
  const activeJobs = visibleJobs.filter(j => j.status !== 'completed');
  const completedJobs = visibleJobs.filter(j => j.status === 'completed');
  const openJobs = activeJobs.filter(j => j.status === 'open');

  return (
    <div className="min-h-screen bg-green-50 pb-24">
      <div className="bg-green-800 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl">🥑</div>
            <div>
              <div className="font-bold">HarvestPulse</div>
              <div className="text-xs text-green-200">{currentUser.name} · {currentUser.role === 'requester' ? 'Requester' : `Fulfiller${currentUser.specialities?.length ? ' · ' + currentUser.specialities.join(', ') : ''}`}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowAdmin(true)} className="p-2 hover:bg-green-700 rounded-full"><Settings size={20} /></button>
            <button onClick={() => setCurrentUser(null)} className="p-2 hover:bg-green-700 rounded-full"><LogOut size={20} /></button>
          </div>
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
              {cacheProgress.done} / {cacheProgress.total} tiles
            </div>
          </div>
          <button onClick={() => setCacheStatus(null)} className="text-white underline text-xs">Skip</button>
        </div>
      )}
      {cacheStatus === 'done' && (
        <div className="bg-green-600 text-white px-4 py-2 text-sm flex items-center gap-2">
          <span>✅</span> Satellite map ready offline
        </div>
      )}

      {notification && (
        <div className={`fixed top-20 left-4 right-4 z-50 p-3 rounded-lg shadow-lg text-white text-center font-medium ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' :
          notification.type === 'info' ? 'bg-blue-600' : 'bg-green-600'
        }`}>
          {notification.msg}
        </div>
      )}

      <div className="p-4">
        {currentUser.role === 'requester' ? (
          <RequesterView
            jobs={visibleJobs.filter(j => j.requesterId === currentUser.id)}
            onNewJob={() => setShowNewJob(true)}
            onDelete={handleDelete}
            onEdit={handleEditJob}
            equipment={equipment}
            taskTypes={taskTypes}
            myLocation={myLocation}
          />
        ) : (
          <FulfillerView
            activeJobs={activeJobs} completedJobs={completedJobs} openJobs={openJobs}
            view={view} setView={setView}
            onClaim={handleClaim} onComplete={handleComplete}
            onArchive={handleArchiveRequest}
            showHistory={showHistory} setShowHistory={setShowHistory}
            currentUser={currentUser} myLocation={myLocation}
            equipment={equipment} taskTypes={taskTypes}
          />
        )}
      </div>

      {showNewJob && (
        <NewJobModal
          equipment={equipment} taskTypes={taskTypes}
          onSubmit={handleCreateJob} onCancel={() => setShowNewJob(false)}
          myLocation={myLocation}
        />
      )}

      {confirmDelJob && (
        <ConfirmDialog
          message={`Delete task "${confirmDelJob.taskName}"?`}
          onConfirm={doDeleteJob}
          onCancel={() => setConfirmDelJob(null)}
        />
      )}
      {confirmArchiveJob && (
        <ConfirmDialog
          message={`Archive completed task "${confirmArchiveJob.taskName}"? It will stay in records for reporting.`}
          onConfirm={doArchiveJob}
          onCancel={() => setConfirmArchiveJob(null)}
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
        <h1 className="text-3xl font-bold">HarvestPulse</h1>
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

function LoginScreen({ users, onSelect, onAdmin }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 p-6 flex flex-col">
      <div className="text-center text-white mb-6 mt-4">
        <div className="text-6xl mb-3">🥑</div>
        <h1 className="text-3xl font-bold">HarvestPulse</h1>
        <p className="text-green-200 mt-2">Select your name and role</p>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-xl flex-1 overflow-y-auto">
        {['requester', 'fulfiller'].map(role => {
          const list = users.filter(u => u.role === role);
          if (!list.length) return null;
          return (
            <div key={role} className="mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{role}s</h2>
              {list.map(u => (
                <button key={u.id} onClick={() => onSelect(u)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-green-50 rounded-lg border border-transparent hover:border-green-200 transition mb-1">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: u.color || '#6b7280' }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-800">{u.name}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <button onClick={onAdmin} className="mt-4 flex items-center justify-center gap-2 text-green-200 hover:text-white text-sm py-2">
        <Settings size={16} /> Admin settings
      </button>
    </div>
  );
}

// ── Admin screen ──────────────────────────────────────────────────────────────
function AdminScreen({ users, equipment, taskTypes, saveUsers, saveEquipment, saveTaskTypes, onClose, showNotif }) {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('users');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 p-6 flex flex-col items-center justify-center">
        <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2"><Settings size={20} /> Admin access</h2>
            <button onClick={onClose} className="text-gray-400"><X size={20} /></button>
          </div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Admin code</label>
          <input type="password" value={pwd} autoFocus
            onChange={e => { setPwd(e.target.value); setErr(''); }}
            onKeyDown={e => e.key === 'Enter' && (pwd === ADMIN_OVERRIDE_CODE ? setAuthed(true) : setErr('Wrong code'))}
            className="w-full border border-gray-300 rounded-lg p-3 mb-3 focus:outline-none focus:border-green-600"
            placeholder="Enter admin code" />
          {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
          <button onClick={() => pwd === ADMIN_OVERRIDE_CODE ? setAuthed(true) : setErr('Wrong code')}
            className="w-full bg-green-700 text-white font-bold py-3 rounded-lg">Unlock admin</button>
        </div>
      </div>
    );
  }

  const toCSV = (rows, cols) => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...rows.map(r => cols.map(c => esc(Array.isArray(r[c]) ? r[c].join('|') : r[c])).join(','))].join('\n');
  };
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const parseLine = (line) => {
      const result = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
        } else if (c === ',' && !inQ) { result.push(cur); cur = ''; } else cur += c;
      }
      result.push(cur);
      return result;
    };
    const headers = parseLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] ?? '');
      return obj;
    });
  };

  const download = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAll = () => {
    download('harvestpulse-users.csv', toCSV(users, ['id', 'name', 'role', 'color', 'specialities']));
    setTimeout(() => download('harvestpulse-equipment.csv', toCSV(equipment, ['id', 'name', 'icon'])), 200);
    setTimeout(() => download('harvestpulse-tasks.csv', toCSV(taskTypes, ['id', 'name', 'icon'])), 400);
    showNotif('3 CSV files downloaded');
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { showNotif('Empty or invalid CSV', 'error'); return; }
    const first = rows[0];
    if ('role' in first) {
      await saveUsers(rows.map((r, i) => ({
        id: r.id || `u${Date.now()}_${i}`,
        name: r.name,
        role: r.role || 'requester',
        color: r.color || USER_COLORS[i % USER_COLORS.length],
        specialities: r.specialities ? r.specialities.split('|').filter(Boolean) : undefined
      })));
      showNotif(`Imported ${rows.length} users`);
    } else if ('icon' in first) {
      if (tab === 'equipment') {
        await saveEquipment(rows.map((r, i) => ({ id: r.id || `e${Date.now()}_${i}`, name: r.name, icon: r.icon || '🔧' })));
        showNotif(`Imported ${rows.length} equipment items`);
      } else {
        await saveTaskTypes(rows.map((r, i) => ({ id: r.id || `t${Date.now()}_${i}`, name: r.name, icon: r.icon || '🔧' })));
        showNotif(`Imported ${rows.length} task types`);
      }
    } else {
      showNotif('CSV missing required columns (role, or icon)', 'error');
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-800 text-white p-4 sticky top-0 z-10 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={20} />
          <div className="font-bold">Admin Settings</div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-green-700 rounded-full"><X size={20} /></button>
      </div>

      <div className="flex gap-1 bg-white shadow-sm p-1 border-b">
        {[['users', 'Users'], ['equipment', 'Equipment'], ['tasks', 'Tasks']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-md font-medium text-sm ${tab === k ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <button onClick={exportAll} className="flex-1 bg-white border border-gray-300 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1">
            <Download size={16} /> Export all CSVs
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex-1 bg-white border border-gray-300 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1">
            <Upload size={16} /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </div>

        {tab === 'users' && <UsersAdmin users={users} saveUsers={saveUsers} />}
        {tab === 'equipment' && <EquipmentAdmin equipment={equipment} saveEquipment={saveEquipment} />}
        {tab === 'tasks' && <TaskTypesAdmin taskTypes={taskTypes} saveTaskTypes={saveTaskTypes} />}
      </div>
    </div>
  );
}

function UsersAdmin({ users, saveUsers }) {
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const addUser = () => {
    const n = { id: `u${Date.now()}`, name: 'New user', role: 'requester', color: USER_COLORS[users.length % USER_COLORS.length] };
    setEditing(n);
  };

  const save = async (u) => {
    const exists = users.some(x => x.id === u.id);
    await saveUsers(exists ? users.map(x => x.id === u.id ? u : x) : [...users, u]);
    setEditing(null);
  };

  const remove = async () => {
    if (!confirmDel) return;
    await saveUsers(users.filter(u => u.id !== confirmDel.id));
    setConfirmDel(null);
  };

  return (
    <div>
      <button onClick={addUser} className="w-full bg-green-700 text-white py-3 rounded-lg font-semibold mb-3 flex items-center justify-center gap-2">
        <Plus size={18} /> Add user
      </button>
      {['requester', 'fulfiller'].map(role => (
        <div key={role} className="mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{role}s</h3>
          <div className="space-y-2">
            {users.filter(u => u.role === role).map(u => (
              <div key={u.id} className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: u.color }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-gray-500">{u.role}{u.specialities?.length ? ` · ${u.specialities.join(', ')}` : ''}</div>
                </div>
                <button onClick={() => setEditing(u)} className="p-2 text-gray-500 hover:text-blue-600"><Edit2 size={16} /></button>
                <button onClick={() => setConfirmDel(u)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {editing && <UserEditor user={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {confirmDel && <ConfirmDialog message={`Delete user "${confirmDel.name}"?`} onConfirm={remove} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}

function UserEditor({ user, onSave, onCancel }) {
  const [u, setU] = useState(user);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Edit user</h3>
          <button onClick={onCancel}><X size={20} /></button>
        </div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
        <input value={u.name} onChange={e => setU({ ...u, name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg p-3 mb-3" />
        <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
        <div className="flex gap-2 mb-3">
          {['requester', 'fulfiller'].map(r => (
            <button key={r} onClick={() => setU({
              ...u,
              role: r,
              specialities: r === 'fulfiller' ? (u.specialities?.length ? u.specialities : ['General']) : undefined,
            })}
              className={`flex-1 py-2 rounded-lg font-medium ${u.role === r ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {r}
            </button>
          ))}
        </div>
        {u.role === 'fulfiller' && (
          <>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Specialities <span className="text-gray-400 font-normal">(tap to toggle, pick one or more)</span></label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {FULFILLER_SPECIALITIES.map(s => {
                const selected = (u.specialities || []).includes(s);
                return (
                  <button key={s} onClick={() => {
                    const curr = u.specialities || [];
                    const next = selected ? curr.filter(x => x !== s) : [...curr, s];
                    setU({ ...u, specialities: next });
                  }}
                    className={`py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${selected ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
                    {selected && <Check size={14} />} {s}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 mb-3">ℹ️ All fulfillers see all tasks for now. Specialities will be used later for task routing.</div>
          </>
        )}
        <label className="block text-sm font-semibold text-gray-700 mb-2">Colour</label>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {USER_COLORS.map(c => (
            <button key={c} onClick={() => setU({ ...u, color: c })}
              className={`w-full aspect-square rounded-full border-4 flex items-center justify-center ${u.color === c ? 'border-gray-800' : 'border-transparent'}`}
              style={{ background: c }}>
              {u.color === c && <Check size={16} className="text-white" />}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={() => onSave(u)} disabled={!u.name.trim()}
            className="flex-1 py-2 bg-green-700 text-white rounded-lg font-semibold disabled:bg-gray-300">Save</button>
        </div>
      </div>
    </div>
  );
}

function EquipmentAdmin({ equipment, saveEquipment }) {
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const add = () => setEditing({ id: `e${Date.now()}`, name: 'New equipment', icon: '🔧' });
  const save = async (item) => {
    const exists = equipment.some(x => x.id === item.id);
    await saveEquipment(exists ? equipment.map(x => x.id === item.id ? item : x) : [...equipment, item]);
    setEditing(null);
  };
  const remove = async () => {
    if (!confirmDel) return;
    await saveEquipment(equipment.filter(e => e.id !== confirmDel.id));
    setConfirmDel(null);
  };

  return (
    <div>
      <button onClick={add} className="w-full bg-green-700 text-white py-3 rounded-lg font-semibold mb-3 flex items-center justify-center gap-2">
        <Plus size={18} /> Add equipment
      </button>
      <div className="space-y-2">
        {equipment.map(e => (
          <div key={e.id} className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3">
            <div className="text-2xl">{e.icon}</div>
            <div className="flex-1 font-medium">{e.name}</div>
            <button onClick={() => setEditing(e)} className="p-2 text-gray-500 hover:text-blue-600"><Edit2 size={16} /></button>
            <button onClick={() => setConfirmDel(e)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {editing && <ItemEditor item={editing} icons={EQUIPMENT_ICONS} title="equipment" onSave={save} onCancel={() => setEditing(null)} />}
      {confirmDel && <ConfirmDialog message={`Delete "${confirmDel.name}"?`} onConfirm={remove} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}

function TaskTypesAdmin({ taskTypes, saveTaskTypes }) {
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const add = () => setEditing({ id: `t${Date.now()}`, name: 'New task', icon: '🔧' });
  const save = async (item) => {
    const exists = taskTypes.some(x => x.id === item.id);
    await saveTaskTypes(exists ? taskTypes.map(x => x.id === item.id ? item : x) : [...taskTypes, item]);
    setEditing(null);
  };
  const remove = async () => {
    if (!confirmDel) return;
    await saveTaskTypes(taskTypes.filter(t => t.id !== confirmDel.id));
    setConfirmDel(null);
  };

  return (
    <div>
      <button onClick={add} className="w-full bg-green-700 text-white py-3 rounded-lg font-semibold mb-3 flex items-center justify-center gap-2">
        <Plus size={18} /> Add task type
      </button>
      <div className="space-y-2">
        {taskTypes.map(t => (
          <div key={t.id} className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3">
            <div className="text-2xl">{t.icon}</div>
            <div className="flex-1 font-medium">{t.name}</div>
            <button onClick={() => setEditing(t)} className="p-2 text-gray-500 hover:text-blue-600"><Edit2 size={16} /></button>
            <button onClick={() => setConfirmDel(t)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {editing && <ItemEditor item={editing} icons={TASK_ICONS} title="task type" onSave={save} onCancel={() => setEditing(null)} />}
      {confirmDel && <ConfirmDialog message={`Delete "${confirmDel.name}"?`} onConfirm={remove} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}

function ItemEditor({ item, icons, title, onSave, onCancel }) {
  const [i, setI] = useState(item);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Edit {title}</h3>
          <button onClick={onCancel}><X size={20} /></button>
        </div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
        <input value={i.name} onChange={e => setI({ ...i, name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg p-3 mb-3" />
        <label className="block text-sm font-semibold text-gray-700 mb-2">Icon</label>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {icons.map(ic => (
            <button key={ic} onClick={() => setI({ ...i, icon: ic })}
              className={`p-2 rounded-lg border-2 text-2xl ${i.icon === ic ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}>
              {ic}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={() => onSave(i)} disabled={!i.name.trim()}
            className="flex-1 py-2 bg-green-700 text-white rounded-lg font-semibold disabled:bg-gray-300">Save</button>
        </div>
      </div>
    </div>
  );
}

function RequesterView({ jobs, onNewJob, onDelete, onEdit, equipment, taskTypes, myLocation }) {
  const [editingJob, setEditingJob] = useState(null);

  return (
    <div>
      <button onClick={onNewJob} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mb-6">
        <Plus size={24} /> New Task Request
      </button>
      <JobSection title="Waiting" jobs={jobs.filter(j => j.status === 'open')} onDelete={onDelete} onEdit={(job) => setEditingJob(job)} showDelete showEdit />
      <JobSection title="In Progress" jobs={jobs.filter(j => j.status === 'claimed')} />
      <JobSection title="Completed" jobs={jobs.filter(j => j.status === 'completed').slice(0, 5)} />

      {editingJob && (
        <EditJobModal
          job={editingJob}
          equipment={equipment}
          taskTypes={taskTypes}
          myLocation={myLocation}
          onSave={async (updates) => {
            await onEdit(editingJob.id, updates);
            setEditingJob(null);
          }}
          onCancel={() => setEditingJob(null)}
        />
      )}
    </div>
  );
}

function EditJobModal({ job, equipment, taskTypes, myLocation, onSave, onCancel }) {
  const [equip, setEquip] = useState(equipment.find(e => e.id === job.equipmentId) || equipment[0]);
  const [task, setTask] = useState(taskTypes.find(t => t.id === job.taskId) || taskTypes[0]);
  const [location, setLocation] = useState({ lat: job.lat, lng: job.lng });
  const [adjLocation, setAdjLocation] = useState(null);
  const [note, setNote] = useState(job.note || '');

  const recapture = () => {
    navigator.geolocation?.getCurrentPosition(
      p => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setAdjLocation(null); },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const finalLoc = adjLocation || location;

  const handleSave = () => {
    onSave({
      equipmentId: equip.id,
      equipmentName: equip.name,
      equipmentIcon: equip.icon,
      taskId: task.id,
      taskName: task.name,
      taskIcon: task.icon,
      lat: finalLoc.lat,
      lng: finalLoc.lng,
      note,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">Edit Task</h2>
          <button onClick={onCancel} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Equipment</label>
            <select value={equip.id} onChange={e => setEquip(equipment.find(x => x.id === e.target.value))}
              className="w-full border border-gray-300 rounded-lg p-3 bg-white">
              {equipment.map(e => <option key={e.id} value={e.id}>{e.icon} {e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Task type</label>
            <select value={task.id} onChange={e => setTask(taskTypes.find(x => x.id === e.target.value))}
              className="w-full border border-gray-300 rounded-lg p-3 bg-white">
              {taskTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
            <div className="bg-gray-50 rounded p-2 text-xs mb-2 flex items-center gap-2">
              <MapPin size={12} className="text-red-600" />{finalLoc.lat.toFixed(6)}, {finalLoc.lng.toFixed(6)}
            </div>
            <PinAdjuster initialLat={location.lat} initialLng={location.lng} onChange={(lat, lng) => setAdjLocation({ lat, lng })} />
            <button onClick={recapture} className="w-full text-sm text-blue-600 py-2 mt-1">🔄 Re-capture GPS</button>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm h-20" />
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
            <button onClick={handleSave} className="flex-1 py-3 bg-green-700 text-white rounded-lg font-bold">Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobSection({ title, jobs, onDelete, onEdit, onArchive, showDelete, showEdit, showArchive }) {
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
                <div className="text-sm text-gray-600">{job.equipmentIcon} {job.equipmentName}</div>
                {job.note && <div className="text-sm text-gray-500 italic mt-1">"{job.note}"</div>}
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Clock size={12} /> {formatTime(job.createdAt)}
                  {job.claimedByName && <span className="ml-1">· {job.claimedByName}</span>}
                  {job.editHistory?.length > 0 && <span className="ml-1 italic">· edited</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <StatusBadge status={job.status} />
                {showEdit && onEdit && (
                  <button onClick={() => onEdit(job)} className="text-gray-400 hover:text-blue-600 p-1" title="Edit"><Edit2 size={16} /></button>
                )}
                {showDelete && onDelete && (
                  <button onClick={() => onDelete(job.id)} className="text-gray-400 hover:text-red-500 p-1" title="Delete"><Trash2 size={16} /></button>
                )}
                {showArchive && onArchive && (
                  <button onClick={() => onArchive(job.id)} className="text-gray-400 hover:text-red-500 p-1" title="Archive"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FulfillerView({ activeJobs, completedJobs, openJobs, view, setView, onClaim, onComplete, onArchive, showHistory, setShowHistory, currentUser, myLocation, equipment, taskTypes }) {
  const [equipFilter, setEquipFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');

  // Apply filters
  const filterFn = (j) =>
    (equipFilter === 'all' || j.equipmentId === equipFilter) &&
    (taskFilter === 'all' || j.taskId === taskFilter);

  const filteredActive = activeJobs.filter(filterFn);
  const filteredCompleted = completedJobs.filter(filterFn);
  const filteredOpen = filteredActive.filter(j => j.status === 'open');
  const myClaimedJobs = filteredActive.filter(j => j.status === 'claimed' && j.claimedBy === currentUser.id);
  const othersClaimedJobs = filteredActive.filter(j => j.status === 'claimed' && j.claimedBy !== currentUser.id);

  const hasFilter = equipFilter !== 'all' || taskFilter !== 'all';

  return (
    <div>
      <div className="flex gap-2 mb-3 bg-white rounded-lg p-1 shadow-sm">
        <button onClick={() => setView('list')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 font-medium ${view === 'list' ? 'bg-green-700 text-white' : 'text-gray-600'}`}>
          <List size={18} />List
        </button>
        <button onClick={() => setView('map')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 font-medium ${view === 'map' ? 'bg-green-700 text-white' : 'text-gray-600'}`}>
          <MapIcon size={18} />Map
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-3 shadow-sm mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center justify-between">
          <span>Filters</span>
          {hasFilter && (
            <button onClick={() => { setEquipFilter('all'); setTaskFilter('all'); }}
              className="text-blue-600 normal-case font-medium">Clear all</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={equipFilter} onChange={e => setEquipFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="all">All equipment</option>
            {equipment.map(e => (
              <option key={e.id} value={e.id}>{e.icon} {e.name}</option>
            ))}
          </select>
          <select value={taskFilter} onChange={e => setTaskFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="all">All task types</option>
            {taskTypes.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredOpen.length > 0 && (
        <div className="bg-orange-100 border-l-4 border-orange-500 p-3 mb-4 rounded-r-lg flex items-center gap-2">
          <AlertCircle size={20} className="text-orange-600" />
          <span className="font-semibold text-orange-900">{filteredOpen.length} open {filteredOpen.length === 1 ? 'task' : 'tasks'}{hasFilter ? ' (filtered)' : ' waiting'}</span>
        </div>
      )}

      {view === 'list' ? (
        <div className="space-y-4">
          <ActionableSection title="🆕 Open tasks" jobs={filteredOpen} actionLabel="Claim Task" onAction={onClaim} color="bg-green-600 hover:bg-green-700" />
          <ActionableSection title="👷 My claimed tasks" jobs={myClaimedJobs} actionLabel="Mark Complete" onAction={onComplete} color="bg-blue-600 hover:bg-blue-700" />
          <JobSection title="Claimed by others" jobs={othersClaimedJobs} />
          <button onClick={() => setShowHistory(!showHistory)} className="w-full text-center text-sm text-gray-600 underline py-2">
            {showHistory ? 'Hide' : 'Show'} completed history ({filteredCompleted.length})
          </button>
          {showHistory && <JobSection title="Completed" jobs={filteredCompleted} onArchive={onArchive} showArchive />}
        </div>
      ) : (
        <div>
          <CanvasMap jobs={filteredActive} myLocation={myLocation} currentUser={currentUser} onClaim={onClaim} onComplete={onComplete} height={480} />
          <div className="flex gap-4 justify-center text-xs mt-2 text-gray-600">
            <span>🔴 Open</span><span>🔵 Mine</span><span>⚫ Others</span><span>🔵● You</span>
          </div>
          {filteredActive.length === 0 && <div className="text-center text-sm text-gray-500 mt-2">No active tasks{hasFilter ? ' match your filters' : ''}</div>}
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
                <div className="text-sm text-gray-700">{job.equipmentIcon} {job.equipmentName}</div>
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
                    <div className="text-2xl mb-1">{e.icon || '🔧'}</div>{e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="bg-green-50 rounded p-2 text-sm mb-3">{sel.equipment?.icon} <strong>{sel.equipment?.name}</strong></div>
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
              <div className="bg-green-50 rounded p-2 text-sm mb-3">{sel.equipment?.icon} <strong>{sel.equipment?.name}</strong> · {sel.task?.icon} {sel.task?.name}</div>
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
                <div>{sel.equipment?.icon} <strong>{sel.equipment?.name}</strong></div>
                <div>{sel.task?.icon} <strong>{sel.task?.name}</strong></div>
                <div>📍 {finalLoc.lat.toFixed(5)}, {finalLoc.lng.toFixed(5)}</div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(3)} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700">Back</button>
                <button onClick={() => onSubmit({ equipmentId: sel.equipment.id, equipmentName: sel.equipment.name, equipmentIcon: sel.equipment.icon, taskId: sel.task.id, taskName: sel.task.name, taskIcon: sel.task.icon, lat: finalLoc.lat, lng: finalLoc.lng, note })}
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