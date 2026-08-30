import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { MinimapRadarConfig, RadarMarker, RadarMarkerType } from './types';

export const DEFAULT_MINIMAP_CONFIG: MinimapRadarConfig = {
  enabled: true,
  radius: 100,
  zoom: 1.0,
  rotateWithPlayer: true,
  showCardinals: true,
  showBorder: true,
  radarColor: '#00f0ff',
};

export class MinimapRadarSystem {
  private config: MinimapRadarConfig;
  private readonly markers = new Map<string, RadarMarker>();

  constructor(private readonly engine: Engine, initialConfig: MinimapRadarConfig = DEFAULT_MINIMAP_CONFIG) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<MinimapRadarConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<MinimapRadarConfig> {
    return this.config;
  }

  registerMarker(marker: RadarMarker): void {
    this.markers.set(marker.id, { ...marker });
    this.engine.sceneManager?.events?.emit('radar_marker_registered', { id: marker.id, type: marker.type });
  }

  updateMarkerPosition(id: string, position: THREE.Vector3): void {
    const m = this.markers.get(id);
    if (m) {
      m.position.copy(position);
    }
  }

  unregisterMarker(id: string): boolean {
    const deleted = this.markers.delete(id);
    if (deleted) {
      this.engine.sceneManager?.events?.emit('radar_marker_unregistered', { id });
    }
    return deleted;
  }

  getMarkers(): readonly RadarMarker[] {
    return Array.from(this.markers.values());
  }

  getProjectedBlips(playerPos: THREE.Vector3, playerYaw = 0): Array<{
    id: string;
    type: RadarMarkerType;
    radarX: number;
    radarY: number;
    isClamped: boolean;
    color: string;
    label?: string;
  }> {
    const blips: Array<{
      id: string;
      type: RadarMarkerType;
      radarX: number;
      radarY: number;
      isClamped: boolean;
      color: string;
      label?: string;
    }> = [];

    const effectiveRadius = this.config.radius;
    const zoomScale = this.config.zoom;

    for (const marker of this.markers.values()) {
      if (!marker.visible) continue;

      let dx = (marker.position.x - playerPos.x) * zoomScale;
      let dz = (marker.position.z - playerPos.z) * zoomScale;

      if (this.config.rotateWithPlayer) {
        // Rotate around player yaw
        const cos = Math.cos(-playerYaw);
        const sin = Math.sin(-playerYaw);
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        dx = rx;
        dz = rz;
      }

      const dist = Math.sqrt(dx * dx + dz * dz);
      let isClamped = false;
      let rx = dx;
      let ry = dz;

      if (dist > effectiveRadius) {
        if (marker.clampToEdge !== false) {
          rx = (dx / dist) * effectiveRadius;
          ry = (dz / dist) * effectiveRadius;
          isClamped = true;
        } else {
          continue; // Offscreen and not clamped
        }
      }

      blips.push({
        id: marker.id,
        type: marker.type,
        radarX: rx,
        radarY: ry,
        isClamped,
        color: marker.color ?? this.getDefaultColor(marker.type),
        label: marker.label,
      });
    }

    return blips;
  }

  private getDefaultColor(type: RadarMarkerType): string {
    switch (type) {
      case 'player': return '#38bdf8';
      case 'police': return '#3b82f6';
      case 'enemy': return '#ef4444';
      case 'objective': return '#eab308';
      case 'contact': return '#a855f7';
      case 'destination': return '#22c55e';
      case 'vehicle': return '#f97316';
      case 'civilian': return '#94a3b8';
      default: return '#00f0ff';
    }
  }

  clear(): void {
    this.markers.clear();
  }

  dispose(): void {
    this.clear();
  }
}
