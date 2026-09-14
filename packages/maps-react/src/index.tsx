'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: string;
  badgeColor?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'grey';
  color?: string;
  headingDeg?: number;
  metrics?: Array<{ label: string; value: string | number }>;
  details?: Record<string, any>;
  onClick?: () => void;
}

export interface MapPolygon {
  id: string;
  name: string;
  coordinates: GeoPoint[];
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  label?: string;
  metricLabel?: string;
  metricValue?: string | number;
  details?: Record<string, any>;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number; // 0 to 1
  radius?: number;
}

export interface FlowArc {
  id: string;
  origin: GeoPoint;
  destination: GeoPoint;
  originLabel?: string;
  destLabel?: string;
  volume?: string | number;
  latency?: string;
  color?: string;
  status?: 'NOMINAL' | 'DELAYED' | 'EXPEDITED';
}

export interface IsochroneCircle {
  id: string;
  center: GeoPoint;
  radiusKm: number;
  label: string;
  color: string;
  fillOpacity?: number;
}

export interface OpenStreetMapViewerProps {
  initialCenter?: GeoPoint;
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  height?: number | string;
  className?: string;
  markers?: MapMarker[];
  polygons?: MapPolygon[];
  heatmapPoints?: HeatmapPoint[];
  flowArcs?: FlowArc[];
  isochrones?: IsochroneCircle[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (marker: MapMarker) => void;
  onPolygonClick?: (polygon: MapPolygon) => void;
  onCenterChange?: (center: GeoPoint, zoom: number) => void;
  showTileGrid?: boolean;
  showCoordinates?: boolean;
  showScaleBar?: boolean;
  showZoomControls?: boolean;
  tileProviderUrl?: string; // default OpenStreetMap
  enableAirgapFallback?: boolean;
}

// ============================================================================
// WEB MERCATOR PROJECTION MATH
// ============================================================================

const TILE_SIZE = 256;

function latLngToWorld(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = scale * ((lng + 180) / 360);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clippedSin = Math.min(Math.max(sinLat, -0.9999), 0.9999);
  const y = scale * (0.5 - Math.log((1 + clippedSin) / (1 - clippedSin)) / (4 * Math.PI));
  return { x, y };
}

function worldToLatLng(x: number, y: number, zoom: number): GeoPoint {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

// ============================================================================
// COMPONENT: OPENSTREETMAP VIEWER
// ============================================================================

export const OpenStreetMapViewer: React.FC<OpenStreetMapViewerProps> = ({
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 11,
  minZoom = 3,
  maxZoom = 18,
  height = 560,
  className = '',
  markers = [],
  polygons = [],
  heatmapPoints = [],
  flowArcs = [],
  isochrones = [],
  selectedMarkerId = null,
  onMarkerClick,
  onPolygonClick,
  onCenterChange,
  showCoordinates = true,
  showScaleBar = true,
  showZoomControls = true,
  tileProviderUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  enableAirgapFallback = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState<GeoPoint>(initialCenter);
  const [zoom, setZoom] = useState<number>(initialZoom);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 560 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCenterStart, setDragCenterStart] = useState<GeoPoint | null>(null);
  const [activePopup, setActivePopup] = useState<MapMarker | null>(null);
  const [hoveredPolygon, setHoveredPolygon] = useState<MapPolygon | null>(null);
  const [tileErrorCount, setTileErrorCount] = useState(0);

  // Sync initial center if prop changes
  useEffect(() => {
    setCenter(initialCenter);
  }, [initialCenter.lat, initialCenter.lng]);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Convert LatLng to Viewport Screen Pixel (px, py)
  const projectToScreen = useCallback(
    (lat: number, lng: number): { x: number; y: number } => {
      const pointWorld = latLngToWorld(lat, lng, zoom);
      const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
      const x = dimensions.width / 2 + (pointWorld.x - centerWorld.x);
      const y = dimensions.height / 2 + (pointWorld.y - centerWorld.y);
      return { x, y };
    },
    [center, zoom, dimensions]
  );

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCenterStart({ ...center });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart || !dragCenterStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const centerWorld = latLngToWorld(dragCenterStart.lat, dragCenterStart.lng, zoom);
    const newCenterWorldX = centerWorld.x - dx;
    const newCenterWorldY = centerWorld.y - dy;
    const newCenter = worldToLatLng(newCenterWorldX, newCenterWorldY, zoom);

    setCenter(newCenter);
    onCenterChange?.(newCenter, zoom);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
    setDragCenterStart(null);
  };

  // Zoom handlers
  const zoomIn = () => {
    setZoom((prev) => {
      const next = Math.min(prev + 1, maxZoom);
      onCenterChange?.(center, next);
      return next;
    });
  };

  const zoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - 1, minZoom);
      onCenterChange?.(center, next);
      return next;
    });
  };

  const resetView = () => {
    setCenter(initialCenter);
    setZoom(initialZoom);
    setActivePopup(null);
    onCenterChange?.(initialCenter, initialZoom);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn();
    } else if (e.deltaY > 0) {
      zoomOut();
    }
  };

  // Calculate visible tiles
  const visibleTiles = useMemo(() => {
    const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
    const minX = centerWorld.x - dimensions.width / 2;
    const maxX = centerWorld.x + dimensions.width / 2;
    const minY = centerWorld.y - dimensions.height / 2;
    const maxY = centerWorld.y + dimensions.height / 2;

    const startTileX = Math.floor(minX / TILE_SIZE);
    const endTileX = Math.floor(maxX / TILE_SIZE);
    const startTileY = Math.floor(minY / TILE_SIZE);
    const endTileY = Math.floor(maxY / TILE_SIZE);

    const tiles: Array<{ x: number; y: number; z: number; left: number; top: number }> = [];
    const maxTile = Math.pow(2, zoom) - 1;

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        if (ty >= 0 && ty <= maxTile) {
          const normTx = ((tx % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
          const tileWorldX = tx * TILE_SIZE;
          const tileWorldY = ty * TILE_SIZE;
          const left = dimensions.width / 2 + (tileWorldX - centerWorld.x);
          const top = dimensions.height / 2 + (tileWorldY - centerWorld.y);
          tiles.push({ x: normTx, y: ty, z: zoom, left, top });
        }
      }
    }
    return tiles;
  }, [center, zoom, dimensions]);

  // Airgap vector fallback status
  const isUsingVectorFallback = enableAirgapFallback && tileErrorCount > 4;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ height }}
      className={`relative w-full rounded-2xl overflow-hidden select-none border border-slate-700 bg-[#0f172a] shadow-inner font-sans ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${className}`}
    >
      {/* ── 1. TILE LAYER (OpenStreetMap) ────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {visibleTiles.map((t) => {
          const tileUrl = tileProviderUrl
            .replace('{z}', String(t.z))
            .replace('{x}', String(t.x))
            .replace('{y}', String(t.y));

          return (
            <img
              key={`${t.z}-${t.x}-${t.y}`}
              src={tileUrl}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setTileErrorCount((c) => c + 1)}
              style={{
                position: 'absolute',
                left: t.left,
                top: t.top,
                width: TILE_SIZE,
                height: TILE_SIZE,
                filter: 'brightness(0.92) contrast(1.08)',
              }}
              className="transition-opacity duration-300"
            />
          );
        })}
      </div>

      {/* ── 1B. AIRGAP / OFFLINE VECTOR GRID FALLBACK ────── */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[linear-gradient(to_right,#33415525_1px,transparent_1px),linear-gradient(to_bottom,#33415525_1px,transparent_1px)] bg-[size:48px_48px]" />

      {/* ── 2. SVG VECTOR LAYERS (Polygons, Arcs, Heatmap) ── */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 pointer-events-none overflow-visible"
      >
        <defs>
          {/* Gradients for Flow Arcs */}
          <linearGradient id="flowGradientBlue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="1" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="flowGradientGreen" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#059669" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="flowGradientAmber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="1" />
          </linearGradient>

          {/* Radial Gradients for Heatmap Blooms */}
          <radialGradient id="heatBloom">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.75" />
            <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="75%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 2A. ISOCHRONE CATCHMENT CIRCLES ─────────────── */}
        {isochrones.map((iso) => {
          const pt = projectToScreen(iso.center.lat, iso.center.lng);
          // Scale km to screen pixels at current zoom
          const scale = (TILE_SIZE * Math.pow(2, zoom)) / (40075 / 360);
          const radiusPixels = (iso.radiusKm / 111.32) * scale * Math.cos((iso.center.lat * Math.PI) / 180);

          return (
            <g key={iso.id}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={Math.max(radiusPixels, 8)}
                fill={iso.color}
                fillOpacity={iso.fillOpacity ?? 0.12}
                stroke={iso.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={pt.x}
                y={pt.y - Math.max(radiusPixels, 8) - 4}
                textAnchor="middle"
                className="text-[10px] font-mono font-bold fill-white"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
              >
                {iso.label}
              </text>
            </g>
          );
        })}

        {/* ── 2B. POLYGONS & CHOROPLETH REGIONS ───────────── */}
        {polygons.map((poly) => {
          if (poly.coordinates.length < 3) return null;
          const pointsStr = poly.coordinates
            .map((c) => {
              const pt = projectToScreen(c.lat, c.lng);
              return `${pt.x},${pt.y}`;
            })
            .join(' ');

          const isHovered = hoveredPolygon?.id === poly.id;
          const centerPt = projectToScreen(
            poly.coordinates.reduce((sum, c) => sum + c.lat, 0) / poly.coordinates.length,
            poly.coordinates.reduce((sum, c) => sum + c.lng, 0) / poly.coordinates.length
          );

          return (
            <g key={poly.id} className="pointer-events-auto cursor-pointer">
              <polygon
                points={pointsStr}
                fill={poly.fillColor || '#3b82f6'}
                fillOpacity={isHovered ? 0.45 : poly.fillOpacity ?? 0.25}
                stroke={poly.strokeColor || '#2563eb'}
                strokeWidth={isHovered ? 2.5 : poly.strokeWidth ?? 1.5}
                onMouseEnter={() => setHoveredPolygon(poly)}
                onMouseLeave={() => setHoveredPolygon(null)}
                onClick={() => onPolygonClick?.(poly)}
                className="transition-all duration-150"
              />
              {poly.metricValue && (
                <text
                  x={centerPt.x}
                  y={centerPt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[11px] font-mono font-extrabold fill-white pointer-events-none"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                >
                  {poly.metricValue}
                </text>
              )}
            </g>
          );
        })}

        {/* ── 2C. RETAIL FOOTFALL HEATMAP BLOOMS ──────────── */}
        {heatmapPoints.map((hp, idx) => {
          const pt = projectToScreen(hp.lat, hp.lng);
          const r = hp.radius || Math.max(35 * hp.weight, 18);

          return (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={r}
              fill="url(#heatBloom)"
              style={{ mixBlendMode: 'screen' }}
            />
          );
        })}

        {/* ── 2D. SUPPLY CHAIN FLOW ARCS ──────────────────── */}
        {flowArcs.map((arc) => {
          const p1 = projectToScreen(arc.origin.lat, arc.origin.lng);
          const p2 = projectToScreen(arc.destination.lat, arc.destination.lng);

          // Quadratic control point for curved arc
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const curvature = Math.min(dist * 0.25, 80);
          const midX = (p1.x + p2.x) / 2 - (dy / (dist || 1)) * curvature;
          const midY = (p1.y + p2.y) / 2 + (dx / (dist || 1)) * curvature;

          const pathD = `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`;
          const color = arc.color || (arc.status === 'DELAYED' ? '#ef4444' : arc.status === 'EXPEDITED' ? '#10b981' : '#3b82f6');

          return (
            <g key={arc.id}>
              {/* Glow Shadow */}
              <path d={pathD} fill="none" stroke={color} strokeWidth={4} strokeOpacity={0.2} />
              {/* Core Arc Line */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 3"
                strokeOpacity={0.85}
              />
              {/* Flow Midpoint Badge */}
              {arc.volume && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect x="-35" y="-10" width="70" height="20" rx="10" fill="#0f172a" stroke={color} strokeWidth="1" />
                  <text x="0" y="3" textAnchor="middle" className="text-[10px] font-mono font-bold fill-white">
                    {arc.volume}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── 3. INTERACTIVE MARKER PINS LAYER ─────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {markers.map((m) => {
          const pt = projectToScreen(m.lat, m.lng);
          // Only render if within viewport bounds
          if (pt.x < -60 || pt.x > dimensions.width + 60 || pt.y < -60 || pt.y > dimensions.height + 60) {
            return null;
          }

          const isSelected = selectedMarkerId === m.id || activePopup?.id === m.id;
          const pinColor = m.color || '#3b82f6';

          return (
            <div
              key={m.id}
              onClick={(e) => {
                e.stopPropagation();
                setActivePopup(m);
                onMarkerClick?.(m);
              }}
              style={{
                position: 'absolute',
                left: pt.x,
                top: pt.y,
                transform: 'translate(-50%, -100%)',
              }}
              className="pointer-events-auto cursor-pointer group z-20"
            >
              {/* Marker Pin Head */}
              <div
                className={`relative flex items-center justify-center rounded-xl p-1.5 shadow-lg border-2 transition-transform duration-200 group-hover:scale-115 ${
                  isSelected
                    ? 'ring-4 ring-white/50 scale-110 border-white'
                    : 'border-slate-800'
                }`}
                style={{ backgroundColor: pinColor }}
              >
                <span className="text-sm select-none">{m.icon || '📍'}</span>

                {/* Pulse Ring for Real-time Telemetry */}
                <span
                  className="animate-ping absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full opacity-75"
                  style={{ backgroundColor: pinColor }}
                />
              </div>

              {/* Pin Pointer Stem */}
              <div
                className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] mx-auto -mt-0.5"
                style={{ borderTopColor: pinColor }}
              />

              {/* Compact Label */}
              <div className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur-xs border border-slate-700 text-[10px] font-bold text-white whitespace-nowrap text-center shadow-md">
                {m.title}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 4. POPUP DETAIL CARD (On Marker Click) ─────────── */}
      {activePopup && (() => {
        const pt = projectToScreen(activePopup.lat, activePopup.lng);
        return (
          <div
            style={{
              position: 'absolute',
              left: Math.min(Math.max(pt.x, 140), dimensions.width - 140),
              top: Math.max(pt.y - 120, 20),
              transform: 'translate(-50%, -100%)',
            }}
            className="pointer-events-auto z-40 w-72 p-4 bg-slate-900/95 backdrop-blur-md border border-slate-700 text-white rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activePopup.icon || '📍'}</span>
                <div>
                  <div className="font-bold text-xs text-white line-clamp-1">{activePopup.title}</div>
                  {activePopup.subtitle && (
                    <div className="text-[10px] text-slate-400">{activePopup.subtitle}</div>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePopup(null);
                }}
                className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Itemized Metrics */}
            {activePopup.metrics && activePopup.metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 my-2">
                {activePopup.metrics.map((met, mIdx) => (
                  <div key={mIdx} className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">{met.label}</div>
                    <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">{met.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
              <span>{activePopup.lat.toFixed(4)}° N, {activePopup.lng.toFixed(4)}° W</span>
              {activePopup.badge && (
                <span className="text-purple-400 font-semibold uppercase">{activePopup.badge}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 5. FLOATING HUD CONTROLS ───────────────────────── */}
      {/* Zoom & View Controls (Top-Right) */}
      {showZoomControls && (
        <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-30 pointer-events-auto">
          <button
            onClick={zoomIn}
            title="Zoom In (+)"
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white font-bold flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            title="Zoom Out (-)"
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white font-bold flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          >
            −
          </button>
          <button
            onClick={resetView}
            title="Reset View"
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-mono text-xs flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          >
            ⟲
          </button>
        </div>
      )}

      {/* Coordinate Crosshair & Scale Bar (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-3 text-[11px] font-mono text-slate-300 pointer-events-none">
        {showCoordinates && (
          <div className="px-2.5 py-1 rounded-lg bg-slate-950/85 backdrop-blur-xs border border-slate-700 shadow-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {center.lat.toFixed(4)}° {center.lat >= 0 ? 'N' : 'S'}, {Math.abs(center.lng).toFixed(4)}° {center.lng >= 0 ? 'E' : 'W'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-purple-400 font-bold">Zoom {zoom}</span>
          </div>
        )}

        {showScaleBar && (
          <div className="px-2.5 py-1 rounded-lg bg-slate-950/85 backdrop-blur-xs border border-slate-700 shadow-md">
            <div className="w-16 border-b-2 border-white pb-0.5 text-center text-[9px] font-bold">
              {zoom >= 13 ? '2 km' : zoom >= 9 ? '25 km' : '200 km'}
            </div>
          </div>
        )}
      </div>

      {/* Attribution & Airgap Fallback Notice (Bottom-Right) */}
      <div className="absolute bottom-2 right-4 z-30 text-[10px] font-mono text-slate-400/80 pointer-events-none flex items-center gap-2">
        {isUsingVectorFallback && (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Air-Gapped Vector Fallback Active
          </span>
        )}
        <span>© OpenStreetMap contributors</span>
      </div>
    </div>
  );
};
