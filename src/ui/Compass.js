import * as turf from '@turf/turf';

export class Compass {
    constructor() {
        this.parentContainer = document.getElementById('compass-container');
        this.container = document.getElementById('compass-markers'); // We'll clear this and put a canvas in it

        // Colors
        this.colors = {
            active: '#ffffff',
            inactive: '#ffffff', // Will be modified by opacity/theme
            inactiveBase: '#cccccc' // Default light gray
        };

        // Canvas Size Multipliers (Configurable)
        this.canvasSizeMultipliers = {
            constellation: 'auto',
            crosshair: 'auto',
            sonar: 'auto',
            default: 'auto'
        };

        // Canvas Setup
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        // Make canvas larger than container to avoid cropping markers
        // Make canvas larger than container to avoid cropping markers
        // 400% size to cover more screen area
        this.canvas.style.top = '-150%';
        this.canvas.style.left = '-150%';
        this.canvas.style.width = '400%';
        this.canvas.style.height = '400%';
        this.canvas.style.pointerEvents = 'none';

        // Clear existing DOM markers if any
        if (this.container) {
            this.container.innerHTML = '';
            this.container.appendChild(this.canvas);
        }

        this.ctx = this.canvas.getContext('2d');

        // State Tracking for Animations
        // State Tracking for Animations
        this.markerStates = new Map(); // id -> { currentRotation, currentHeight, currentOpacity, dying, deathTime }
        this.currentFlightRotation = 0;
        this.currentFlightRotation = 0;
        this.userScale = 1.2; // Default Size 1.2x
        this.mode = 'crosshair'; // Explicitly set default mode
    }

    // ...

    update(map, samples, amplitudes, playingIds = [], flightBearing = 0, pitch = 0, info = null) {
        // ...

        // 2. Flight Direction Arrow (DOM)
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

        // Smoother movement: 0.02 factor (was 0.05)
        this.currentFlightRotation = currentFlight + (diffFlight * 0.02);
        flightArrow.style.transform = `rotate(${this.currentFlightRotation}deg) translateY(-65px)`;

        // ...
    }

    renderConstellation(cx, cy, radius, map, amplitudes, playingIds = [], bearing) {
        // ... (setup)

        // 1. Draw Inactive (Background)
        this.markerStates.forEach(state => {
            // ... (checks)

            // ... (bearing calc)

            const maxDistKm = 50;

            // Randomize Max Extension
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const randomFactor = 0.8 + ((hash % 100) / 100) * 0.4; // 0.8 to 1.2

            const visualMaxR = radius * 4 * randomFactor; // Randomized limit

            let r = (distanceKm / maxDistKm) * visualMaxR * 1.5;
            r = Math.max(radius + 10, Math.min(r, visualMaxR * 1.5));

            // ... (rest of drawing)
        });

        // 2. Draw Active (Foreground)
        this.markerStates.forEach(state => {
            // ... (checks)

            // ... (bearing calc)

            const maxDistKm = 50;

            // Randomize Max Extension (Same hash logic for consistency)
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const randomFactor = 0.8 + ((hash % 100) / 100) * 0.4; // 0.8 to 1.2

            const visualMaxR = radius * 4 * randomFactor; // Randomized limit

            let r = (distanceKm / maxDistKm) * visualMaxR * 1.5;
            r = Math.max(radius + 10, Math.min(r, visualMaxR * 1.5));

            // ... (rest of drawing)
        });
    }

    setTheme(theme) {
        if (theme && theme.includes('outdoors')) {
            // Outdoors: Black + White Theme
            this.colors.primary = '#000000';
            this.colors.active = '#000000'; // Black Active
            this.colors.inactiveBase = '#000000'; // Black Inactive
            this.parentContainer.classList.add('theme-outdoors');
            this.currentTheme = 'outdoors';
        } else if (theme && theme.includes('satellite')) {
            // Satellite: High Contrast
            this.colors.primary = '#ffffff';
            this.colors.active = '#ffffff';
            this.colors.inactiveBase = '#cccccc';
            this.parentContainer.classList.remove('theme-outdoors');
            this.currentTheme = 'satellite';
        } else {
            // Default (Dark/Satellite): Light Theme for Dark Map
            this.colors.primary = '#ffffff';
            this.colors.active = '#ffffff';
            this.colors.inactiveBase = '#cccccc';
            this.parentContainer.classList.remove('theme-outdoors');
            this.currentTheme = 'default';
        }
    }

    resizeCanvas() {
        if (!this.container || !this.canvas) return;

        // Use offsetWidth/Height to get the layout size (untransformed)
        // getBoundingClientRect() gives the transformed size, which causes double-squashing
        const width = this.container.offsetWidth;
        const height = this.container.offsetHeight;
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const scale = this.userScale || 1.0;

        // Determine Canvas Size Multiplier
        // Constellation needs to cover the whole screen (approx), relative to the small compass container.
        // Compass container is ~100px. Screen is ~1920px. So 20x should be safe.
        let multiplier = this.canvasSizeMultipliers[this.mode] || this.canvasSizeMultipliers.default;

        if (multiplier === 'auto') {
            // Calculate multiplier to cover the whole screen
            // We use the larger dimension to ensure coverage
            const maxDim = Math.max(window.innerWidth, window.innerHeight);
            // Add some buffer (1.5x) to handle rotation and aspect ratio differences
            const requiredScale = (maxDim / width) * 1.5;
            multiplier = requiredScale;
        }

        const logicalWidth = width * multiplier;
        const logicalHeight = height * multiplier;

        // Center the canvas
        // If multiplier is 2, top/left is -50%.
        // If multiplier is 20, top/left is -950% (half of 1900% extra).
        // Formula: -((multiplier * 100) / 2 - 50) + '%' ?
        // Simpler: -((multiplier - 1) / 2) * 100 + '%'
        // e.g. 2 -> -(0.5) * 100 = -50%
        // e.g. 20 -> -(9.5) * 100 = -950%
        const offset = -((multiplier - 1) / 2) * 100;

        this.canvas.style.top = `${offset}%`;
        this.canvas.style.left = `${offset}%`;
        this.canvas.style.width = `${multiplier * 100}%`;
        this.canvas.style.height = `${multiplier * 100}%`;

        // Scale buffer by userScale to maintain sharpness
        const targetWidth = logicalWidth * scale;
        const targetHeight = logicalHeight * scale;

        // Only resize if dimensions changed
        if (this.canvas.width !== targetWidth * dpr || this.canvas.height !== targetHeight * dpr) {
            this.canvas.width = targetWidth * dpr;
            this.canvas.height = targetHeight * dpr;
            // Scale context so drawing operations match the logical size
            this.ctx.scale(dpr * scale, dpr * scale);
        }

        return { width: logicalWidth, height: logicalHeight };
    }

    setMode(mode) {
        this.mode = mode || 'crosshair'; // Default to crosshair
        // Reset or init specific state if needed
        if (mode === 'sonar') {
            this.sweepAngle = 0;
        }
    }

    setSize(scale) {
        this.userScale = scale;
    }

    hide() {
        if (this.parentContainer) {
            this.parentContainer.classList.add('hidden');
        }
    }

    show() {
        if (this.parentContainer) {
            this.parentContainer.classList.remove('hidden');
        }
    }

    update(map, samples, amplitudes, playingIds = [], flightBearing = 0, pitch = 0, info = null) {
        if (!map || !this.container || !this.parentContainer) return;

        // this.parentContainer.classList.remove('hidden'); // REMOVED: Let Director/UI control visibility

        const center = map.getCenter();
        const bearing = map.getBearing();

        // 0. 3D Rotation (Container Transform)
        const clampedPitch = Math.min(pitch, 70);
        const userScale = this.userScale || 1.0;
        const scale = (1 + (clampedPitch / 60) * 0.30) * userScale;

        this.parentContainer.style.transform = `translate(-50%, -50%) rotateX(${clampedPitch}deg) scale(${scale})`;
        this.parentContainer.style.transformStyle = 'preserve-3d';
        this.container.style.transformStyle = 'preserve-3d';

        // 1. Rotate Compass Ring (DOM)
        const ring = document.getElementById('compass-ring');
        if (ring) ring.style.transform = `rotate(${-bearing}deg)`;

        // Inner Ring Removed

        // 1.5 Info Text (DOM)
        let infoEl = document.getElementById('compass-info');
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = 'compass-info';
            this.parentContainer.appendChild(infoEl);
        }

        // Hide DOM info in crosshair mode (we draw it on canvas)
        if (this.mode === 'crosshair') {
            infoEl.style.display = 'none';
        } else {
            infoEl.style.display = 'flex';
            if (info) {
                infoEl.innerHTML = `
                    <div>${info.lat.toFixed(2)}º</div>
                    <div>${info.lng.toFixed(2)}º</div>
                    <div>▵ ${Math.round(info.elevation)}m</div>
                `;
                infoEl.style.transform = '';
            }
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
        this.currentFlightRotation = currentFlight + (diffFlight * 0.02);
        flightArrow.style.transform = `rotate(${this.currentFlightRotation}deg) translateY(-65px)`;


        // 3. CANVAS RENDERING
        const { width, height } = this.resizeCanvas();
        const cx = width / 2;
        const cy = height / 2;
        const radius = 50; // Fixed radius matching CSS translateY(-50px)

        this.ctx.clearRect(0, 0, width, height);

        // SHARED STATE UPDATE (Fading)
        this.updateMarkerStates(samples, playingIds);

        if (this.mode === 'sonar') {
            this.renderSonar(cx, cy, radius, map, amplitudes, playingIds, bearing);
        } else if (this.mode === 'constellation') {
            this.renderConstellation(cx, cy, radius, map, amplitudes, playingIds, bearing);
        } else if (this.mode === 'crosshair') {
            this.renderCrosshair(cx, cy, radius, map, amplitudes, playingIds, bearing, info);
        } else {
            this.renderCompass(cx, cy, radius, map, amplitudes, playingIds, bearing);
        }
    }

    renderCrosshair(cx, cy, radius, map, amplitudes, playingIds = [], bearing, info) {
        const activeIds = new Set(playingIds);
        const center = map.getCenter();
        const maxDistKm = 50; // Max distance to display (edge of canvas)

        // 1. Draw Crosshair (Static)
        const chSize = 100; // 200x200 total size (radius 100)

        this.ctx.beginPath();
        // Horizontal
        this.ctx.moveTo(cx - chSize, cy);
        this.ctx.lineTo(cx + chSize, cy);
        // Vertical
        this.ctx.moveTo(cx, cy - chSize);
        this.ctx.lineTo(cx, cy + chSize);

        this.ctx.strokeStyle = this.colors.primary || '#ffffff'; // White
        this.ctx.lineWidth = 1;
        // Increase opacity for satellite AND outdoors mode
        const isHighContrast = (this.currentTheme === 'satellite' || this.currentTheme === 'outdoors');
        this.ctx.globalAlpha = isHighContrast ? 0.6 : 0.3;
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;

        // 2. Draw Labels (Lat, Lon, Elevation)
        if (info) {
            this.ctx.font = '10px monospace'; // Small monospace font
            this.ctx.fillStyle = this.colors.primary || '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Boost text opacity in satellite/outdoors mode
            this.ctx.globalAlpha = isHighContrast ? 1.0 : 0.6;

            // Lat: Bottom of Vertical Line
            const latDir = info.lat >= 0 ? 'N' : 'S';
            const latText = `${Math.abs(info.lat).toFixed(2)}°${latDir}`;
            this.ctx.fillText(latText, cx, cy + chSize + 15);

            // Lon: Right of Horizontal Line
            this.ctx.textAlign = 'left';
            const lonDir = info.lng >= 0 ? 'E' : 'W';
            const lonText = `${Math.abs(info.lng).toFixed(2)}°${lonDir}`;
            this.ctx.fillText(lonText, cx + chSize + 10, cy);

            // Elevation: Left of Horizontal Line
            this.ctx.textAlign = 'right';
            const elevText = `${Math.round(info.elevation)}m`;

            // Measure text to position triangle
            this.ctx.font = '10px monospace';
            const textWidth = this.ctx.measureText(elevText).width;

            // Draw Value
            this.ctx.fillText(elevText, cx - chSize - 10, cy);

            // Draw Triangle (Bigger and Closer)
            this.ctx.font = '16px monospace'; // Bigger
            // Position: Right edge of text - textWidth - padding
            // We use right alignment, so the x coordinate is the right edge of the triangle character
            this.ctx.fillText('▵', cx - chSize - 10 - textWidth - 3, cy - 1);

            this.ctx.globalAlpha = 1.0;
        }

        // 3. Calculate Positions & Cluster
        const clusters = new Map(); // "lat,lng" -> [states]
        const isDesktop = window.innerWidth > 768; // Simple desktop check
        const spreadFactor = isDesktop ? 1.5 : 1.0; // Spread more on desktop

        this.markerStates.forEach(state => {
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            const key = `${state.lat.toFixed(4)},${state.lng.toFixed(4)}`;
            if (!clusters.has(key)) clusters.set(key, []);
            clusters.get(key).push(state);
        });

        // 4. Render Clusters (Markers on TOP)
        // First, calculate all active marker positions to resolve collisions
        const activeNodes = [];
        const inactiveNodes = [];

        clusters.forEach((states, key) => {
            // Use the first state for position calculation
            const representative = states[0];

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([representative.lng, representative.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            // Calculate Position relative to center
            // Apply spread factor
            let r = (distanceKm / maxDistKm) * chSize * 2 * spreadFactor;

            let relativeBearing = targetBearing - bearing;
            while (relativeBearing < 0) relativeBearing += 360;
            while (relativeBearing >= 360) relativeBearing -= 360;

            const angleRad = (relativeBearing * Math.PI) / 180;
            const x = cx + Math.sin(angleRad) * r;
            const y = cy - Math.cos(angleRad) * r;

            // Determine if active (any in cluster)
            let maxActiveWeight = 0;
            let maxAmp = 0;

            states.forEach(s => {
                if (s.activeWeight > maxActiveWeight) maxActiveWeight = s.activeWeight;
                const amp = amplitudes[s.id] || 0;
                if (amp > maxAmp) maxAmp = amp;
            });

            const node = {
                x, y,
                originalX: x, originalY: y,
                states,
                representative,
                distanceKm,
                maxActiveWeight,
                maxAmp,
                opacity: representative.currentOpacity
            };

            if (maxActiveWeight > 0.01) {
                activeNodes.push(node);
            } else {
                inactiveNodes.push(node);
            }
        });

        // Resolve Collisions for Active Nodes
        this.resolveCollisions(activeNodes, 20); // 20px min distance

        // Render Inactive Nodes First
        inactiveNodes.forEach(node => {
            this.renderMarkerNode(node, cx, cy, chSize, maxDistKm);
        });

        // Render Active Nodes (Resolved Positions)
        activeNodes.forEach(node => {
            this.renderMarkerNode(node, cx, cy, chSize, maxDistKm);
        });
    }

    resolveCollisions(nodes, minDistance) {
        const iterations = 5;
        for (let i = 0; i < iterations; i++) {
            for (let a = 0; a < nodes.length; a++) {
                for (let b = a + 1; b < nodes.length; b++) {
                    const nodeA = nodes[a];
                    const nodeB = nodes[b];

                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const distSq = dx * dx + dy * dy;
                    const minDistSq = minDistance * minDistance;

                    if (distSq < minDistSq && distSq > 0.001) {
                        const dist = Math.sqrt(distSq);
                        const overlap = minDistance - dist;
                        const nx = dx / dist;
                        const ny = dy / dist;

                        // Move apart
                        const moveX = nx * overlap * 0.5;
                        const moveY = ny * overlap * 0.5;

                        nodeA.x += moveX;
                        nodeA.y += moveY;
                        nodeB.x -= moveX;
                        nodeB.y -= moveY;
                    }
                }
            }
        }
    }

    renderMarkerNode(node, cx, cy, chSize, maxDistKm) {
        const { x, y, representative, distanceKm, maxActiveWeight, maxAmp, opacity } = node;

        // 1. Inactive State (Background)
        const distFactor = Math.max(0.0, 1 - (distanceKm / maxDistKm)); // Allow fade to 0 at edge

        // Boost opacity in satellite/outdoors mode
        const isHighContrast = (this.currentTheme === 'satellite' || this.currentTheme === 'outdoors');
        const inactiveOpacityBoost = isHighContrast ? 5.0 : 1.0;

        // Inactive Dot
        this.ctx.beginPath();
        this.ctx.arc(x, y, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = this.colors.inactiveBase;
        this.ctx.globalAlpha = Math.min(1.0, opacity * 0.6 * distFactor * (1 - maxActiveWeight) * inactiveOpacityBoost);
        this.ctx.fill();

        // Inactive Ring
        this.ctx.beginPath();
        this.ctx.arc(x, y, 5, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.colors.inactiveBase;
        this.ctx.lineWidth = 0.5;
        this.ctx.globalAlpha = Math.min(1.0, opacity * 0.3 * distFactor * (1 - maxActiveWeight) * inactiveOpacityBoost);
        this.ctx.stroke();

        // 2. Active State (Foreground)
        if (maxActiveWeight > 0.01) {
            const baseSize = 4;
            const pulse = maxAmp * 10;
            const size = baseSize + pulse;

            // Active Dot
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = this.colors.active;

            // Full opacity in satellite/outdoors mode, but keep fade animation
            this.ctx.globalAlpha = isHighContrast ? (1.0 * maxActiveWeight) : (opacity * maxActiveWeight);
            this.ctx.fill();

            // Outer glow ring
            this.ctx.beginPath();
            this.ctx.arc(x, y, size + 4, 0, Math.PI * 2);
            this.ctx.strokeStyle = this.colors.active;
            this.ctx.lineWidth = 1;
            this.ctx.globalAlpha = isHighContrast ? (1.0 * maxActiveWeight) : (opacity * maxActiveWeight * 0.5 * (1 - maxAmp));
            this.ctx.stroke();
        }

        // DEBUG: Draw Name (Active Only)
        if (maxActiveWeight > 0.01) {
            // Full opacity in satellite/outdoors mode, but keep fade animation
            this.ctx.globalAlpha = isHighContrast ? (1.0 * maxActiveWeight) : (opacity * maxActiveWeight);
            this.ctx.font = '8px monospace';
            this.ctx.fillStyle = this.colors.primary || '#ffffff';
            this.ctx.textAlign = 'left';
            // Draw scientific name
            const name = representative.sciName || representative.name || representative.id;
            this.ctx.fillText(name.toUpperCase(), x + 12, y - 5);
        }

        this.ctx.globalAlpha = 1.0;
    }

    updateMarkerStates(samples, playingIds = []) {
        const sampleIds = new Set(samples.map(s => s.id));
        const activeSet = new Set(playingIds);

        // 1. Update/Create existing samples
        samples.forEach(sample => {
            let state = this.markerStates.get(sample.id);
            // Construct Scientific Name
            const sciName = (sample.gen && sample.sp) ? `${sample.gen} ${sample.sp}` : sample.name;

            if (!state) {
                state = {
                    id: sample.id,
                    name: sample.name || sample.id,
                    sciName: sciName, // Store scientific name
                    lat: sample.lat,
                    lng: sample.lng,
                    currentRotation: 0,
                    currentHeight: 0,
                    currentOpacity: 0, // Start invisible
                    activeWeight: 0,   // Start inactive
                    dying: false,
                    deathTime: 0
                };
                this.markerStates.set(sample.id, state);
            }

            // Update data
            state.lat = sample.lat;
            state.lng = sample.lng;
            state.name = sample.name || sample.id;
            state.sciName = sciName; // Update scientific name
            state.dying = false;

            // Fade In (Lifecycle)
            state.currentOpacity += (1.0 - state.currentOpacity) * 0.002; // Even slower fade in (was 0.01)

            // Active State Smoothing - Linear Fade over 0.5s (approx 30 frames at 60fps)
            const targetActive = activeSet.has(sample.id) ? 1.0 : 0.0;
            const step = 0.033; // 1.0 / 30 frames
            if (state.activeWeight < targetActive) {
                state.activeWeight = Math.min(targetActive, state.activeWeight + step);
            } else if (state.activeWeight > targetActive) {
                state.activeWeight = Math.max(targetActive, state.activeWeight - step);
            }
        });

        // 2. Handle dying markers
        this.markerStates.forEach((state, id) => {
            if (!sampleIds.has(id)) {
                state.dying = true;
                // Fade Out (Lifecycle) - Slower
                state.currentOpacity += (0.0 - state.currentOpacity) * 0.01;

                // Remove if invisible
                if (state.currentOpacity < 0.01) {
                    this.markerStates.delete(id);
                }
            }
        });
    }

    renderConstellation(cx, cy, radius, map, amplitudes, playingIds = [], bearing) {
        const activeIds = new Set(playingIds);
        const center = map.getCenter();

        // Center Hub Removed

        // 1. Draw Inactive (Background)
        this.markerStates.forEach(state => {
            if (activeIds.has(state.id)) return;
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            let relativeBearing = targetBearing - bearing;
            while (relativeBearing < 0) relativeBearing += 360;
            while (relativeBearing >= 360) relativeBearing -= 360;

            // Randomize Max Extension
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const randomFactor = 0.8 + ((hash % 100) / 100) * 0.4; // 0.8 to 1.2

            const maxDistKm = 50;
            const visualMaxR = radius * 4 * randomFactor; // Randomized limit

            let r = (distanceKm / maxDistKm) * visualMaxR * 1.5;
            r = Math.max(radius + 10, Math.min(r, visualMaxR * 1.5));

            const angleRad = (relativeBearing * Math.PI) / 180;
            const x = cx + Math.sin(angleRad) * r;
            const y = cy - Math.cos(angleRad) * r;

            const startX = cx + Math.sin(angleRad) * radius;
            const startY = cy - Math.cos(angleRad) * radius;

            // Draw Tether
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(x, y);
            this.ctx.strokeStyle = this.colors.inactiveBase;
            this.ctx.globalAlpha = state.currentOpacity * 0.3;
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1.0;

            // Draw Node
            this.ctx.beginPath();
            this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            this.ctx.fillStyle = this.colors.inactiveBase;
            this.ctx.globalAlpha = state.currentOpacity;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        });

        // 2. Draw Active (Foreground)
        this.markerStates.forEach(state => {
            if (!activeIds.has(state.id)) return;
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            let relativeBearing = targetBearing - bearing;
            while (relativeBearing < 0) relativeBearing += 360;
            while (relativeBearing >= 360) relativeBearing -= 360;

            // Randomize Max Extension
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const randomFactor = 0.8 + ((hash % 100) / 100) * 0.4; // 0.8 to 1.2

            const maxDistKm = 50;
            const visualMaxR = radius * 4 * randomFactor; // Randomized limit

            let r = (distanceKm / maxDistKm) * visualMaxR * 1.5;
            r = Math.max(radius + 10, Math.min(r, visualMaxR * 1.5));

            const angleRad = (relativeBearing * Math.PI) / 180;
            const x = cx + Math.sin(angleRad) * r;
            const y = cy - Math.cos(angleRad) * r;

            const startX = cx + Math.sin(angleRad) * radius;
            const startY = cy - Math.cos(angleRad) * radius;

            const amp = amplitudes[state.id] || 0;

            // Draw Tether
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);

            const midX = (startX + x) / 2;
            const midY = (startY + y) / 2;
            const dx = x - startX;
            const dy = y - startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            const perpX = -dy / len;
            const perpY = dx / len;
            const vibration = (Math.random() - 0.5) * 120 * amp;
            const cpX = midX + perpX * vibration;
            const cpY = midY + perpY * vibration;

            this.ctx.quadraticCurveTo(cpX, cpY, x, y);
            this.ctx.strokeStyle = this.colors.active;
            this.ctx.lineWidth = 0.5;
            this.ctx.globalAlpha = state.currentOpacity;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1.0;

            // Draw Node
            const size = 3 + amp * 4;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = this.colors.active;
            this.ctx.globalAlpha = state.currentOpacity;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        });
    }

    renderCompass(cx, cy, radius, map, amplitudes, playingIds = [], bearing) {
        const activeIds = new Set(playingIds);
        const center = map.getCenter();

        // Process all samples
        // 1. Draw Inactive Markers (Background)
        this.markerStates.forEach(state => {
            if (activeIds.has(state.id)) return; // Skip active
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            // ... (Calculation logic same as before)
            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            let relativeBearing = targetBearing - bearing;
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const offset = (hash % 20 - 10) * 0.8;
            relativeBearing += offset;

            let diff = relativeBearing - state.currentRotation;
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            state.currentRotation += diff;

            const randomHeightFactor = 0.5 + ((hash % 100) / 100) * 2.0;
            const maxDist = 50;
            const distFactor = Math.max(0.0, 1 - (distanceKm / maxDist));

            const targetHeight = (2 + (15 * distFactor)) * randomHeightFactor;
            const targetWidth = 1;
            const targetColor = this.colors.inactiveBase;
            const distanceOpacity = 0.3 + (0.7 * distFactor);

            state.currentHeight += (targetHeight - state.currentHeight) * 0.1;
            const finalOpacity = state.currentOpacity * distanceOpacity;

            this.drawMarker(cx, cy, radius, state.currentRotation, state.currentHeight, finalOpacity, targetWidth, targetColor);
        });

        // 2. Draw Active Markers (Foreground)
        this.markerStates.forEach(state => {
            if (!activeIds.has(state.id)) return; // Skip inactive
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            // ... (Calculation logic)
            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);

            let relativeBearing = targetBearing - bearing;
            const hash = state.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const offset = (hash % 20 - 10) * 0.8;
            relativeBearing += offset;

            let diff = relativeBearing - state.currentRotation;
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            state.currentRotation += diff;

            const amp = amplitudes[state.id] || 0;
            const randomHeightFactor = 0.5 + ((hash % 100) / 100) * 2.0;

            const targetHeight = (12 + (amp * 200)) * randomHeightFactor;
            const targetWidth = 1.5;
            const targetColor = this.colors.active;
            const distanceOpacity = 1.0;

            state.currentHeight += (targetHeight - state.currentHeight) * 0.1;
            const finalOpacity = state.currentOpacity * distanceOpacity;

            this.drawMarker(cx, cy, radius, state.currentRotation, state.currentHeight, finalOpacity, targetWidth, targetColor);
        });
    }

    renderSonar(cx, cy, radius, map, amplitudes, playingIds = [], bearing) {
        const activeIds = new Set(playingIds);
        const center = map.getCenter();

        // Update Sweep Angle
        this.sweepAngle = (this.sweepAngle || 0) + 2; // Speed of rotation
        if (this.sweepAngle >= 360) this.sweepAngle -= 360;

        // Draw Sweep Line - REMOVED
        // this.ctx.save();
        // this.ctx.translate(cx, cy);
        // this.ctx.rotate((this.sweepAngle * Math.PI) / 180);

        // // Gradient for sweep tail
        // const gradient = this.ctx.createLinearGradient(0, 0, 0, -radius);
        // gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        // gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');

        // this.ctx.beginPath();
        // this.ctx.moveTo(0, 0);
        // this.ctx.lineTo(0, -radius);
        // this.ctx.strokeStyle = gradient;
        // this.ctx.lineWidth = 2;
        // this.ctx.stroke();

        // Draw Sector (Radar sweep effect)
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 - 0.5, true); // 0.5 radians tail
        this.ctx.closePath();
        const sectorGradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        sectorGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sectorGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
        this.ctx.fillStyle = sectorGradient;
        this.ctx.fill();

        this.ctx.restore();

        // Draw Blips
        this.markerStates.forEach(state => {
            if (state.currentOpacity < 0.01) return;
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            const distanceKm = turf.distance(start, end);

            // Opacity based on distance (0.2 to 0.8)
            const maxDist = 50;
            const distFactor = Math.max(0.0, 1 - (distanceKm / maxDist));
            state.distanceOpacity = 0.2 + (0.6 * distFactor);
        });

        // 1. Draw Inactive (Scanning) Circles - Inner Ring
        this.markerStates.forEach(state => {
            if (state.currentOpacity < 0.01) return;
            if (activeIds.has(state.id)) return; // Skip active
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            const finalOpacity = state.distanceOpacity * state.currentOpacity;
            if (finalOpacity <= 0.01) return;

            // Calculate position
            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            let relativeBearing = targetBearing - bearing;
            while (relativeBearing < 0) relativeBearing += 360;
            while (relativeBearing >= 360) relativeBearing -= 360;

            const angleRad = (relativeBearing * Math.PI) / 180;

            // Position: On Outer Ring (Same as Active)
            const r = radius;
            const x = cx + Math.sin(angleRad) * r;
            const y = cy - Math.cos(angleRad) * r;

            this.ctx.beginPath();
            // Bigger and Fainter
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = this.colors.inactiveBase; // Dynamic Color
            this.ctx.globalAlpha = finalOpacity;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        });

        // 2. Draw Active Circles - Outer Ring (Top Layer)
        this.markerStates.forEach(state => {
            if (!activeIds.has(state.id)) return; // Skip inactive
            if (typeof state.lat !== 'number' || typeof state.lng !== 'number') return;

            // Calculate position
            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([state.lng, state.lat]);
            const targetBearing = turf.bearing(start, end);
            let relativeBearing = targetBearing - bearing;
            while (relativeBearing < 0) relativeBearing += 360;
            while (relativeBearing >= 360) relativeBearing -= 360;

            const angleRad = (relativeBearing * Math.PI) / 180;

            // Position: Exact Center on Outer Ring
            const r = radius;
            const x = cx + Math.sin(angleRad) * r;
            const y = cy - Math.cos(angleRad) * r;

            const amp = amplitudes[state.id] || 0;
            const size = 6 + (amp * 50);

            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.strokeStyle = this.colors.active; // Dynamic Color
            this.ctx.lineWidth = 1;
            this.ctx.globalAlpha = state.currentOpacity;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1.0;
        });
    }

    drawMarker(cx, cy, radius, rotationDeg, height, opacity, width, color) {
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
