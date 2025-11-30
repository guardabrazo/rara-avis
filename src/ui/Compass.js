import * as turf from '@turf/turf';

export class Compass {
    constructor() {
        this.container = document.getElementById('compass-markers');
        this.parentContainer = document.getElementById('compass-container');
        this.markers = new Map(); // id -> { element, currentRotation }
    }

    update(map, samples, amplitudes, playingIds = [], flightBearing = 0, pitch = 0, info = null) {
        if (!map || !this.container || !this.parentContainer) return;

        this.parentContainer.style.display = 'flex'; // Ensure visible

        const center = map.getCenter();
        const bearing = map.getBearing(); // Camera bearing (0 = North, 90 = East)

        // 0. 3D Rotation
        // User wants EVERYTHING to rotate/tilt with the map.
        // And scale up significantly to maintain visibility/effect.
        // CLAMPED to 75 degrees to prevent it from becoming too flat/invisible.
        const clampedPitch = Math.min(pitch, 70);
        const scale = 1 + (clampedPitch / 60) * 0.30;

        this.parentContainer.style.transform = `translate(-50%, -50%) rotateX(${clampedPitch}deg) scale(${scale})`;
        this.parentContainer.style.transformStyle = 'preserve-3d';

        // Inner Container follows parent
        this.container.style.transform = '';
        this.container.style.transformStyle = 'preserve-3d';


        // 1. Rotate Compass Ring (North Arrow) - OUTER (2D)
        // The ring itself should rotate opposite to the camera bearing so "North" stays North.
        const ring = document.getElementById('compass-ring');
        if (ring) {
            ring.style.transform = `rotate(${-bearing}deg)`;
        }

        // 1.5 Inner Ring (3D)
        // This one is inside this.container, so it tilts. We just need to rotate it to match bearing.
        let innerRing = document.getElementById('compass-ring-inner');
        if (!innerRing) {
            innerRing = document.createElement('div');
            innerRing.id = 'compass-ring-inner';
            this.container.appendChild(innerRing);
        }
        innerRing.style.transform = `rotate(${-bearing}deg)`;

        // 1.5 Info Text
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
                <div>↑ ${Math.round(info.elevation)}m</div>
            `;
            // Counter-rotate text so it stays upright? 
            // User said "The text should rotate with the compass"
            // So we REMOVE the counter-rotation.
            // infoEl.style.transform = `rotateX(${-pitch}deg)`;
            infoEl.style.transform = ''; // Reset
        }


        // 2. Flight Direction Arrow
        let flightArrow = document.getElementById('compass-flight-arrow');
        if (!flightArrow) {
            flightArrow = document.createElement('div');
            flightArrow.id = 'compass-flight-arrow';
            this.container.appendChild(flightArrow);
            this.currentFlightRotation = 0; // State for smoothing
        }

        // Calculate target rotation relative to camera
        const targetFlightRotation = flightBearing - bearing;

        // Shortest path smoothing
        let currentFlight = this.currentFlightRotation || 0;
        let diffFlight = targetFlightRotation - currentFlight;
        while (diffFlight < -180) diffFlight += 360;
        while (diffFlight > 180) diffFlight -= 360;

        // Apply Lerp for smoother movement
        // Factor 0.05 for very smooth, 0.1 for responsive
        const lerpFactor = 0.05;
        this.currentFlightRotation = currentFlight + (diffFlight * lerpFactor);

        // Offset -65px to be outside the ring (markers are at -50px)
        flightArrow.style.transform = `rotate(${this.currentFlightRotation}deg) translateY(-60px)`;


        // 3. Sync Markers
        samples.forEach(sample => {
            let markerData = this.markers.get(sample.id);

            // Create if new
            if (!markerData) {
                const element = document.createElement('div');
                element.className = 'compass-marker';
                this.container.appendChild(element);
                markerData = { element, currentRotation: 0 };
                this.markers.set(sample.id, markerData);
            }

            const marker = markerData.element;

            // Validate Coordinates
            if (typeof sample.lat !== 'number' || typeof sample.lng !== 'number') {
                // Hide if no coords
                marker.style.display = 'none';
                return;
            }
            marker.style.display = 'block';

            // Calculate Relative Bearing
            // 1. Absolute Bearing from Center to Target
            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([sample.lng, sample.lat]);
            const targetBearing = turf.bearing(start, end);

            // 2. Relative to Camera
            // If camera is facing North (0), target at East (90) -> Relative 90
            // If camera is facing East (90), target at East (90) -> Relative 0
            let relativeBearing = targetBearing - bearing;

            // 3. Continuous Rotation Logic (Shortest Path)
            // Normalize relativeBearing to -180 to 180
            // But we want to find the closest rotation to currentRotation

            // First, get the target rotation in 0-360 space or -180-180 space?
            // Let's just work with the difference.

            let currentRotation = markerData.currentRotation;

            // Calculate the difference between target and current
            let diff = relativeBearing - currentRotation;

            // Normalize diff to -180 to 180 to find shortest path
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;

            // Apply the shortest difference
            let newRotation = currentRotation + diff;

            markerData.currentRotation = newRotation;

            // Update Transform
            // Rotate around center, then push out to radius (50px)
            // Since transform-origin is bottom center, and we translate Y negative (up),
            // it pushes the marker out from the center to the ring.
            marker.style.transform = `rotate(${newRotation}deg) translateY(-50px)`;

            // Update Visuals (Active vs Inactive)
            // Use playingIds for truth
            const isActive = playingIds.includes(sample.id);
            const amp = amplitudes[sample.id] || 0;

            if (isActive) {
                marker.style.opacity = 1;
                // Ensure min height for visibility even if quiet
                marker.style.height = `${12 + (amp * 200)}px`;
                marker.style.background = 'var(--accent)';
                marker.style.zIndex = '10';
                marker.style.width = '1px'; // Back to 1px
                marker.style.borderRadius = '0'; // Ensure straight ends
            } else {
                // Non-playing markers: White, half size
                marker.style.opacity = 0.5;
                marker.style.height = '6px'; // Half of base active size (12px)
                marker.style.background = 'var(--accent)'; // White
                marker.style.zIndex = '1';
                marker.style.width = '1px';
            }
        });

        // Cleanup removed samples
        this.markers.forEach((markerData, id) => {
            const stillExists = samples.some(s => s.id === id);
            if (!stillExists) {
                markerData.element.remove();
                this.markers.delete(id);
            }
        });
    }

    hide() {
        if (this.parentContainer) {
            this.parentContainer.style.display = 'none';
        }
    }
}
