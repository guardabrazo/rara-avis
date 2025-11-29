export class Wanderer {
    constructor(mapManager) {
        this.mapManager = mapManager;

        // State
        this.isWandering = true; // Default ON
        this.mode = 'random'; // 'random' | 'locked'

        // Movement
        this.speed = 0.00005; // Base speed (matches slider value 1)
        this.bearing = 90; // Current flight direction (degrees)
        this.targetBearing = 90; // Where we want to head (for smooth turning)

        // Random Walk Params
        this.noiseOffset = Math.random() * 1000;
    }

    start() {
        this.isWandering = true;
    }

    stop() {
        this.isWandering = false;
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`Wanderer Mode: ${mode}`);
    }

    setBearing(degrees) {
        this.targetBearing = degrees;
        // If we switch to locked, snap or smooth? Smooth is better.
        // Normalize to shortest turn
        let diff = (degrees - this.bearing + 180) % 360 - 180;
        if (diff < -180) diff += 360;
        // Actually, let's just set target and let update handle it
    }

    setSpeed(val) {
        // Map 0-10 slider to useful speed range
        // 0 -> 0
        // 1 -> 0.00005 (Old slow default)
        // 10 -> 0.0005 (Old max)
        this.speed = val * 0.00005;
    }

    update(terrainType = 'mix') {
        if (!this.isWandering || !this.mapManager.map) return;

        // Pause flight if user is interacting (rotating, pitching, dragging)
        if (this.mapManager.isInteracting) return;

        // 1. Update Bearing
        if (this.mode === 'random') {
            // Smoothly drift the target bearing
            // Simple random walk: +/- 1 degree per frame
            // Land Seeking: If over water, home in on the nearest landmark
            if (terrainType === 'water') {
                const landmark = this.mapManager.getNearestLandmark();
                if (landmark) {
                    const center = this.mapManager.getCenter();
                    // Calculate bearing to landmark
                    // Formula: atan2(sin(dLon) * cos(lat2), cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon))
                    // Simplified for flat-ish projection near equator, but let's use a proper bearing calc for robustness
                    const startLat = center.lat * Math.PI / 180;
                    const startLon = center.lng * Math.PI / 180;
                    const destLat = landmark.coords[1] * Math.PI / 180;
                    const destLon = landmark.coords[0] * Math.PI / 180;

                    const y = Math.sin(destLon - startLon) * Math.cos(destLat);
                    const x = Math.cos(startLat) * Math.sin(destLat) -
                        Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLon - startLon);

                    const bearing = Math.atan2(y, x) * 180 / Math.PI;
                    const normalizedBearing = (bearing + 360) % 360;

                    this.targetBearing = normalizedBearing;
                    // console.log(`🌊 Over water - Homing to ${landmark.name} (${Math.round(normalizedBearing)}°)`);
                } else {
                    // Fallback if no landmark found (shouldn't happen)
                    this.targetBearing += 1.5;
                }
            } else {
                // Normal random drift
                const drift = (Math.random() - 0.5) * 2.0;
                this.targetBearing += drift;
            }
        }

        // Smooth turn towards target bearing
        // We need to handle the 0/360 wrap-around for smooth turning
        let diff = this.targetBearing - this.bearing;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        // Turn speed (degrees per frame)
        const turnSpeed = 0.5;
        if (Math.abs(diff) < turnSpeed) {
            this.bearing = this.targetBearing;
        } else {
            this.bearing += Math.sign(diff) * turnSpeed;
        }

        // Normalize bearing
        this.bearing = (this.bearing + 360) % 360;

        // 2. Move Map
        const center = this.mapManager.getCenter();
        const rad = this.bearing * (Math.PI / 180);

        // Calculate delta
        // Note: Longitude shrinks as we go north, but for simple wandering this is fine.
        // Proper geodesic would be better but overkill here.
        const dx = Math.sin(rad) * this.speed;
        const dy = Math.cos(rad) * this.speed;

        this.mapManager.map.easeTo({
            center: [center.lng + dx, center.lat + dy],
            duration: 0,
            easing: t => t
        });

        // Optional: Rotate camera to face direction?
        // this.mapManager.map.setBearing(this.bearing);
    }
}
