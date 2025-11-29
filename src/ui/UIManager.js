import * as Tone from 'tone';
export class UIManager {
    constructor() {
        this.callbacks = {};
        this.elements = {};

        // Bird Watcher State
        this.playingSamples = {}; // id -> speciesName
        this.speciesCounts = {};  // speciesName -> count
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
    }

    cacheElements() {
        this.elements = {
            initOverlay: document.getElementById('init-overlay'), // This might be unused now, but keeping for safety
            playBtn: document.getElementById('play-btn'),
            stopBtn: document.getElementById('stop-btn'),
            flySpeedInput: document.getElementById('fly-speed'),
            flySpeedVal: document.getElementById('fly-speed-val'),
            mapStyleInput: document.getElementById('map-style'),

            masterVolumeInput: document.getElementById('master-volume'),
            masterVolumeVal: document.getElementById('master-volume-val'),

            birdsVolumeInput: document.getElementById('birds-volume'),
            birdsVolumeVal: document.getElementById('birds-volume-val'),

            fieldVolumeInput: document.getElementById('field-volume'),
            fieldVolumeVal: document.getElementById('field-volume-val'),

            statusKey: document.getElementById('status-key'),
            statusMode: document.getElementById('status-mode'),
            densityBar: document.getElementById('status-density-bar'),

            // Wanderer Controls
            flightToggle: document.getElementById('flight-toggle'),
            autopilotToggle: document.getElementById('autopilot-toggle'),
            headingSlider: document.getElementById('heading-slider'),
            headingVal: document.getElementById('heading-val'),

            // View Controls
            compassToggle: document.getElementById('compass-toggle'),
        };
    }

    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    setupEventListeners() {
        const {
            initOverlay, playBtn, stopBtn, flySpeedInput,
            mapStyleInput, volumeInput, manualModeToggle, raindropBtn
        } = this.elements;

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                // Auto-init audio if not ready
                // App.js handles the logic, we just emit
                playBtn.classList.remove('highlight-pulse');
                this.emit('play');
                playBtn.style.borderColor = 'var(--accent)';
                if (stopBtn) stopBtn.style.borderColor = '';
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.emit('stop');
                if (playBtn) playBtn.style.borderColor = '';
                stopBtn.style.borderColor = 'var(--accent)';
            });
        }



        if (flySpeedInput) {
            flySpeedInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                console.log('Speed Input:', val, 'Label Element:', this.elements.flySpeedVal);
                this.emit('setFlySpeed', val);
                if (this.elements.flySpeedVal) this.elements.flySpeedVal.textContent = val.toFixed(1);
            });
        }

        if (mapStyleInput) {
            mapStyleInput.addEventListener('change', (e) => {
                const style = e.target.value;
                this.emit('setMapStyle', style);

                // Update Compass Theme
                const compassContainer = document.getElementById('compass-container');
                if (compassContainer) {
                    compassContainer.classList.remove('theme-outdoors', 'theme-satellite');
                    if (style.includes('outdoors')) {
                        compassContainer.classList.add('theme-outdoors');
                    } else if (style.includes('satellite')) {
                        compassContainer.classList.add('theme-satellite');
                    }
                }
            });
        }

        if (this.elements.compassToggle) {
            this.elements.compassToggle.addEventListener('change', (e) => {
                this.emit('setCompass', e.target.checked);
            });
        }

        if (this.elements.birdsVolumeInput) {
            this.elements.birdsVolumeInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.emit('setBirdsVolume', val);
                if (this.elements.birdsVolumeVal) this.elements.birdsVolumeVal.textContent = `${val}%`;
            });
        }

        if (this.elements.fieldVolumeInput) {
            this.elements.fieldVolumeInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.emit('setFieldVolume', val);
                if (this.elements.fieldVolumeVal) this.elements.fieldVolumeVal.textContent = `${val}%`;
            });
        }

        if (manualModeToggle) {
            manualModeToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                this.emit('toggleManualMode', enabled);
                this.toggleManualControls(enabled);
            });
        }



        if (this.elements.flightToggle) {
            this.elements.flightToggle.addEventListener('change', (e) => {
                this.emit('setFlight', e.target.checked);
            });
        }

        if (this.elements.autopilotToggle) {
            // Set initial state
            if (this.elements.headingSlider) this.elements.headingSlider.disabled = this.elements.autopilotToggle.checked;

            this.elements.autopilotToggle.addEventListener('change', (e) => {
                const isAutopilot = e.target.checked;
                this.emit('setAutopilot', isAutopilot);
                if (this.elements.headingSlider) this.elements.headingSlider.disabled = isAutopilot;
            });
        }

        if (this.elements.headingSlider) {
            this.elements.headingSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.emit('setWanderDirection', val);
                if (this.elements.headingVal) this.elements.headingVal.textContent = `${val}°`;
            });
        }

        const zenBtn = document.getElementById('zen-mode-btn');
        if (zenBtn) {
            zenBtn.addEventListener('click', () => this.toggleZenMode());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
                this.toggleZenMode();
            }
        });
    }

    updateStatus(type, harmonyMode, density) {
        if (this.elements.statusKey) this.elements.statusKey.textContent = type.toUpperCase();
        if (this.elements.statusMode) this.elements.statusMode.textContent = harmonyMode.toUpperCase();
        if (this.elements.densityBar) this.elements.densityBar.style.width = `${density * 100}%`;
    }

    setLoadingText(text) {
        if (this.elements.initOverlay) this.elements.initOverlay.textContent = text;
    }

    hideOverlay() {
        if (this.elements.initOverlay) this.elements.initOverlay.classList.add('hidden');
    }

    addPlayingSample(sample) {
        const list = document.getElementById('now-playing-list');
        if (!list) return;

        const speciesName = `${sample.gen} ${sample.sp}`;

        // Track this sample instance
        this.playingSamples[sample.id] = speciesName;

        // Check if species is already playing
        if (!this.speciesCounts[speciesName]) {
            this.speciesCounts[speciesName] = 0;

            // Create new card
            const card = document.createElement('div');
            card.className = 'bird-card';
            // Use species name as ID for the card (sanitized)
            const cardId = `species-${speciesName.replace(/\s+/g, '-')}`;
            card.id = cardId;
            card.textContent = speciesName;

            list.appendChild(card);
        }

        // Increment count
        this.speciesCounts[speciesName]++;
    }

    removePlayingSample(id) {
        // Look up species name
        const speciesName = this.playingSamples[id];
        if (!speciesName) return;

        // Decrement count
        this.speciesCounts[speciesName]--;

        // Clean up sample tracking
        delete this.playingSamples[id];

        // If no more instances of this species, remove card
        if (this.speciesCounts[speciesName] <= 0) {
            const cardId = `species-${speciesName.replace(/\s+/g, '-')}`;
            const card = document.getElementById(cardId);

            if (card) {
                card.classList.add('removing');
                card.addEventListener('transitionend', () => {
                    card.remove();
                });
            }

            delete this.speciesCounts[speciesName];
        }
    }

    toggleZenMode() {
        document.body.classList.toggle('zen-mode');
        const isZen = document.body.classList.contains('zen-mode');

        if (isZen) {
            const overlay = document.getElementById('zen-overlay');
            if (overlay) {
                // Ensure it's in the DOM (remove display: none)
                overlay.style.display = '';

                // Force Reflow to enable transition from opacity: 0
                void overlay.offsetWidth;

                overlay.classList.remove('hidden');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                }, 2000);
            }
        }

        this.emit('toggleZenMode', isZen);
    }
}
