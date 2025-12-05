export class Wanderer {
    constructor(mapManager) {
        this.mapManager = mapManager;

        // State
        this.isWandering = true; // Default ON
        this.mode = 'random'; // 'random' | 'locked'
        this.escapeTarget = null; // Target for island escape

        // Movement
        this.speed = 0.000025; // Base speed (matches slider value 0.5)
        this.bearing = 90; // Current flight direction (degrees)
        this.targetBearing = 90; // Where we want to head (for smooth turning)

        // Random Walk Params
        this.noiseOffset = Math.random() * 1000;
        this.waterEntryTime = null; // Track how long we've been over water
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
        // Map 0-2 slider to useful speed range
        // 0.5 -> 0.000025 (Default)
        // 1.0 -> 0.00005
        // 2.0 -> 0.0001
        this.speed = val * 0.00005;
    }

    update(terrainType = 'mix', elevation = 10) {
        if (!this.isWandering || !this.mapManager.map) return;

        // Pause flight if user is interacting (rotating, pitching, dragging)
        if (this.mapManager.isInteracting) return;

        // 1. Update Bearing
        if (this.mode === 'random') {
            // STARTUP CHECK: If elevation is 0 (or very low) AND we are at (0,0) or similar, don't run logic
            // This prevents false triggers on load before map data is ready
            // We can check if center is (0,0) or if elevation is exactly 0 and we are not sure.
            // But elevation 0 is valid for sea.
            // Let's rely on mapManager.map being loaded, which we check at start of update.
            // But maybe we need a "warmup" period?
            // Let's just check if we have a valid center.
            const currentCenter = this.mapManager.getCenter();
            if (!currentCenter || (currentCenter.lng === 0 && currentCenter.lat === 0)) return;

            // ESCAPE MODE: If we have an escape target, fly towards it until we hit land
            if (this.escapeTarget) {
                // Check if we hit land (Elevation > 2m OR Terrain != Water and Elevation > 0.5m)
                // Note: We use a slightly higher elevation threshold to be sure
                if (elevation > 2 || (terrainType !== 'water' && elevation > 0.5)) {
                    // console.log(`🏝️ Landfall! Escaped to new continent. Resuming exploration.`);
                    this.escapeTarget = null;
                    // Resume normal wandering behavior immediately
                } else {
                    // Keep flying to escape target
                    this.steerTowards(this.escapeTarget);
                    // console.log(`✈️ Migrating... (Ele: ${elevation.toFixed(1)}m)`);
                }
            }

            // NORMAL MODE
            if (!this.escapeTarget) {
                // WATER AVOIDANCE LOGIC
                // Only treat as "ocean" if terrain is 'water' AND elevation is <= 0 (Sea Level)
                // This allows flying over rivers and mountain lakes (elevation > 0)
                const isOcean = terrainType === 'water' && elevation <= 0.5; // Use 0.5m buffer for tides/noise

                if (isOcean) {
                    // Start timer if not already started
                    if (!this.waterEntryTime) {
                        this.waterEntryTime = Date.now();
                    }

                    // Only trigger avoidance if we've been over water for > 3 seconds
                    if (Date.now() - this.waterEntryTime > 5000) {
                        const landmark = this.mapManager.getNearestLandmark();
                        if (landmark) {
                            const center = this.mapManager.getCenter();
                            const distKm = this.getDistanceKm(center, landmark.coords);

                            // STUCK DETECTION: If we are close to a landmark (< 10km - Reduced from 20km) and hitting water,
                            // it means we are likely trapped on a small island.
                            if (distKm < 10) {
                                // console.log(`🆘 Stuck on island (Dist: ${distKm.toFixed(1)}km). Initiating Escape!`);
                                this.startEscape(landmark);
                            } else {
                                // Normal Avoidance: Home in on the nearest landmark
                                this.steerTowards(landmark);
                                // console.log(`🌊 Over water (Ele: ${elevation.toFixed(1)}m) - Homing to ${landmark.name} (${distKm.toFixed(1)}km)`);
                            }
                        } else {
                            // Fallback if no landmark found (shouldn't happen)
                            this.targetBearing += 1.5;
                            // console.log(`🌊 Over water (Ele: ${elevation.toFixed(1)}m) - No landmark found, drifting...`);
                        }
                    } else {
                        // Still in buffer period, drift normally
                        const drift = (Math.random() - 0.5) * 2.0;
                        this.targetBearing += drift;
                    }
                } else {
                    // Reset timer immediately if we are back over land (or river/lake)
                    this.waterEntryTime = null;

                    // Normal random drift over land (or rivers/lakes)
                    const drift = (Math.random() - 0.5) * 2.0;
                    this.targetBearing += drift;
                }
            }
        }

        // Smooth turn towards target bearing
        // We need to handle the 0/360 wrap-around for smooth turning
        let diff = this.targetBearing - this.bearing;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        // Turn speed (degrees per frame)
        // Increase turn speed if over water to escape faster
        let turnSpeed = 0.5;
        if (terrainType === 'water' || this.escapeTarget) {
            turnSpeed = 1.0; // Faster turns when avoiding water or escaping
        }

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

    startEscape(currentLandmark) {
        // Pick a random landmark that is NOT the current one and is far away (> 500km)
        // Access static property via constructor
        const locations = this.mapManager.constructor.INTERESTING_LOCATIONS || [];

        const candidates = locations.filter(loc => {
            if (loc.name === currentLandmark.name) return false;
            // Simple distance check (Euclidean on lat/lng is rough but fine for "far away")
            const dx = loc.coords[0] - currentLandmark.coords[0];
            const dy = loc.coords[1] - currentLandmark.coords[1];
            return (dx * dx + dy * dy) > 25; // Approx > 5 degrees distance
        });

        if (candidates.length > 0) {
            this.escapeTarget = candidates[Math.floor(Math.random() * candidates.length)];
            // console.log(`✈️ Escape Target Selected: ${this.escapeTarget.name}`);
        } else {
            // Fallback: Just pick any other
            const others = locations.filter(l => l.name !== currentLandmark.name);
            if (others.length > 0) {
                this.escapeTarget = others[Math.floor(Math.random() * others.length)];
            }
        }
    }

    steerTowards(target) {
        const center = this.mapManager.getCenter();
        const startLat = center.lat * Math.PI / 180;
        const startLon = center.lng * Math.PI / 180;
        const destLat = target.coords[1] * Math.PI / 180;
        const destLon = target.coords[0] * Math.PI / 180;

        const y = Math.sin(destLon - startLon) * Math.cos(destLat);
        const x = Math.cos(startLat) * Math.sin(destLat) -
            Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLon - startLon);

        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        this.targetBearing = (bearing + 360) % 360;
    }

    getDistanceKm(p1, p2Coords) {
        // Haversine formula for approx km distance
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(p2Coords[1] - p1.lat);
        const dLon = this.deg2rad(p2Coords[0] - p1.lng);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(p1.lat)) * Math.cos(this.deg2rad(p2Coords[1])) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
}
