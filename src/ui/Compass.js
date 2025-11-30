import * as turf from '@turf/turf';

export class Compass {
    constructor() {
        this.parentContainer = document.getElementById('compass-container');
        this.container = document.getElementById('compass-markers'); // We'll clear this and put a canvas in it

        // Canvas Setup
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        // Make canvas larger than container to avoid cropping markers
        this.canvas.style.top = '-50%';
        this.canvas.style.left = '-50%';
        this.canvas.style.width = '200%';
        this.canvas.style.height = '200%';
        this.canvas.style.pointerEvents = 'none';

        // Clear existing DOM markers if any
        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.canvas);
        }

        this.ctx = this.canvas.getContext('2d');

        // State Tracking for Animations
        this.markerStates = new Map(); // id -> { currentRotation, currentHeight, currentOpacity, dying, deathTime }
        this.currentFlightRotation = 0;
    }

    resizeCanvas() {
        if (!this.container || !this.canvas) return;

        // Use offsetWidth/Height to get the layout size (untransformed)
        // getBoundingClientRect() gives the transformed size, which causes double-squashing
        const width = this.container.offsetWidth;
        const height = this.container.offsetHeight;
        const dpr = window.devicePixelRatio || 1;

        // Canvas is 200% of container
        const targetWidth = width * 2;
        const targetHeight = height * 2;

        // Only resize if dimensions changed
        if (this.canvas.width !== targetWidth * dpr || this.canvas.height !== targetHeight * dpr) {
            this.canvas.width = targetWidth * dpr;
            this.canvas.height = targetHeight * dpr;
            this.ctx.scale(dpr, dpr);
        }

        return { width: targetWidth, height: targetHeight };
    }

    update(map, samples, amplitudes, playingIds = [], flightBearing = 0, pitch = 0, info = null) {
        if (!map || !this.container || !this.parentContainer) return;

        this.parentContainer.style.display = 'flex';

        const center = map.getCenter();
        const bearing = map.getBearing();

        // 0. 3D Rotation (Container Transform)
        const clampedPitch = Math.min(pitch, 70);
        const scale = 1 + (clampedPitch / 60) * 0.30;
        this.parentContainer.style.transform = `translate(-50%, -50%) rotateX(${clampedPitch}deg) scale(${scale})`;
        this.parentContainer.style.transformStyle = 'preserve-3d';
        this.container.style.transformStyle = 'preserve-3d';

        // 1. Rotate Compass Ring (DOM)
        const ring = document.getElementById('compass-ring');
        if (ring) ring.style.transform = `rotate(${-bearing}deg)`;

        // 1.5 Inner Ring (DOM)
        let innerRing = document.getElementById('compass-ring-inner');
        if (!innerRing) {
            innerRing = document.createElement('div');
            innerRing.id = 'compass-ring-inner';
            this.container.appendChild(innerRing);
        }
        innerRing.style.transform = `rotate(${-bearing}deg)`;

        // 1.5 Info Text (DOM)
        let infoEl = document.getElementById('compass-info');
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = 'compass-info';
            this.parentContainer.appendChild(infoEl);
        }
        if (info) {
            infoEl.innerHTML = `
                <div>${info.lat.toFixed(2)}º</div>
                <div>${info.lng.toFixed(2)}º</div>
                <div>▵ ${Math.round(info.elevation)}m</div>
            `;
            infoEl.style.transform = '';
        }

        // 2. Flight Direction Arrow (DOM - kept for simplicity as it's just one element)
        let flightArrow = document.getElementById('compass-flight-arrow');
        if (!flightArrow) {
            flightArrow = document.createElement('div');
            flightArrow.id = 'compass-flight-arrow';
            this.container.appendChild(flightArrow);
        }

        const targetFlightRotation = flightBearing - bearing;
        let currentFlight = this.currentFlightRotation || 0;
        let diffFlight = targetFlightRotation - currentFlight;
        while (diffFlight < -180) diffFlight += 360;
        while (diffFlight > 180) diffFlight -= 360;
        this.currentFlightRotation = currentFlight + (diffFlight * 0.05);
        flightArrow.style.transform = `rotate(${this.currentFlightRotation}deg) translateY(-65px)`;


        // 3. CANVAS RENDERING FOR MARKERS
        const { width, height } = this.resizeCanvas();
        const cx = width / 2;
        const cy = height / 2;
        const radius = 50; // Fixed radius matching CSS translateY(-50px)

        this.ctx.clearRect(0, 0, width, height);

        // Update & Draw Markers
        const now = Date.now();
        const activeIds = new Set(playingIds);
        const sampleIds = new Set(samples.map(s => s.id));

        // Process all samples
        samples.forEach(sample => {
            let state = this.markerStates.get(sample.id);
            if (!state) {
                state = {
                    currentRotation: 0,
                    currentHeight: 0,
                    currentOpacity: 0,
                    dying: false,
                    deathTime: 0
                };
                this.markerStates.set(sample.id, state);
            }

            // Revive if needed
            if (state.dying) {
                state.dying = false;
            }

            // Calculate Target Rotation
            if (typeof sample.lat !== 'number' || typeof sample.lng !== 'number') return;

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([sample.lng, sample.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            let relativeBearing = targetBearing - bearing;

            // Jitter
            const hash = sample.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const offset = (hash % 10 - 5) * 0.5;
            relativeBearing += offset;

            // Smooth Rotation - REMOVED SMOOTHING to fix alignment lag
            let diff = relativeBearing - state.currentRotation;
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            state.currentRotation += diff; // Instant update

            // Calculate Target Visuals
            const isActive = activeIds.has(sample.id);
            const amp = amplitudes[sample.id] || 0;

            let targetHeight, targetOpacity, targetWidth, targetColor;

            if (isActive) {
                targetHeight = 12 + (amp * 200);
                targetOpacity = 1;
                targetWidth = 1.5; // Slightly thicker for active
                targetColor = '#ffffff'; // var(--accent)
            } else {
                const maxDist = 50;
                const distFactor = Math.max(0.0, 1 - (distanceKm / maxDist));
                targetHeight = 1 + (15 * (distFactor * distFactor));
                targetOpacity = 0.2 + (0.6 * distFactor);
                targetWidth = 1;
                targetColor = '#ffffff';
            }

            // Smooth Visuals
            state.currentHeight += (targetHeight - state.currentHeight) * 0.1;
            state.currentOpacity += (targetOpacity - state.currentOpacity) * 0.1;

            // Draw
            this.drawMarker(cx, cy, radius, state.currentRotation, state.currentHeight, state.currentOpacity, targetWidth, targetColor);
        });

        // Process Dying Markers
        this.markerStates.forEach((state, id) => {
            if (!sampleIds.has(id)) {
                if (!state.dying) {
                    state.dying = true;
                    state.deathTime = now;
                }

                // Fade out
                const timeSinceDeath = now - state.deathTime;
                if (timeSinceDeath > 500) {
                    this.markerStates.delete(id);
                } else {
                    // Fade opacity
                    const fadeProgress = timeSinceDeath / 500;
                    const fadeOpacity = state.currentOpacity * (1 - fadeProgress);

                    // Keep rotating with last known rotation (or just stop? let's stop updating rotation)
                    this.drawMarker(cx, cy, radius, state.currentRotation, state.currentHeight, fadeOpacity, 1, '#ffffff');
                }
            }
        });
    }

    drawMarker(cx, cy, radius, rotationDeg, height, opacity, width, color) {
        if (opacity <= 0.01) return;

        this.ctx.save();

        // Translate to center
        this.ctx.translate(cx, cy);

        // Rotate
        this.ctx.rotate((rotationDeg * Math.PI) / 180);

        // Translate to radius (negative Y to go up)
        this.ctx.translate(0, -radius);

        // Draw Line (centered on 0,0 relative to the translation)
        // Since we want it to grow OUTWARDS from the ring, and we are at -radius (the ring edge),
        // we should draw from 0 to -height (upwards/outwards).

        this.ctx.globalAlpha = opacity;
        this.ctx.fillStyle = color;

        // Draw Rect for better sharpness than line
        this.ctx.fillRect(-width / 2, -height, width, height);

        this.ctx.restore();
    }

    hide() {
        if (this.parentContainer) {
            this.parentContainer.style.display = 'none';
        }
    }
}
