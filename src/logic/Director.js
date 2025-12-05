import * as Tone from 'tone';
import { Wanderer } from './Wanderer';
import { XenoCantoService } from '../services/XenoCantoService';
import { FreesoundService } from '../services/FreesoundService';
import { SamplePlayer } from '../audio/SamplePlayer';
import { Compass } from '../ui/Compass';
import * as turf from '@turf/turf';

export class Director {
    constructor(mapManager, uiManager) {
        this.mapManager = mapManager;
        this.uiManager = uiManager;
        // this.visLayer = visLayer; // Removed
        this.compass = new Compass();
        this.wanderer = new Wanderer(mapManager);
        this.xcService = new XenoCantoService();
        this.fsService = new FreesoundService();
        this.player = new SamplePlayer();

        this.isPlaying = false;
        this.audioInitialized = false;

        this.samplePool = []; // Birds
        this.fieldPool = [];  // Field Recordings
        this.maxPoolSize = 60; // Reduced from 300 to force rotation

        this.birdsVolume = 0.7;
        this.fieldVolume = 0.5;
        this.showCompass = true; // Default ON

        // Bind methods
        this.update = this.update.bind(this);

        this.nextPlayTime = 0;
        this.nextFieldPlayTime = 0;

        this.lastFetchLocation = null;
        this.lastFetchTime = 0;
        this.fetchInterval = 10000; // 10 seconds (More frequent)
        this.fetchDistance = 0.01; // ~1km degrees (More sensitive)
        this.searchRadius = 30; // km

        // Wire UI events
        if (this.uiManager) {
            this.uiManager.on('setCompass', (enabled) => {
                this.showCompass = enabled;
                if (!enabled) this.compass.hide();
            });

            this.uiManager.on('setFlight', (enabled) => {
                if (enabled) this.wanderer.start();
                else this.wanderer.stop();
            });

            this.uiManager.on('setVisMode', (mode) => {
                this.compass.setMode(mode);
            });

            this.uiManager.on('setCompassSize', (val) => {
                this.compass.setSize(val);
            });

            this.uiManager.on('setAutopilot', (enabled) => {
                this.wanderer.setMode(enabled ? 'random' : 'locked');
            });

            this.uiManager.on('setWanderDirection', (val) => this.wanderer.setBearing(val));
            this.uiManager.on('setFlySpeed', (val) => this.wanderer.setSpeed(val));



            this.uiManager.on('setSearchScope', (val) => {
                this.searchRadius = val;
            });

            this.uiManager.on('setBirdsVolume', (val) => {
                this.birdsVolume = val / 100;
                this.player.setVolume('xeno-canto', this.birdsVolume);
            });

            this.uiManager.on('setFieldVolume', (val) => {
                this.fieldVolume = val / 100;
                this.player.setVolume('freesound', this.fieldVolume);
            });

            this.uiManager.on('forceRefresh', () => {
                this.forceRefresh();
            });

            this.uiManager.on('setMapStyle', (style) => {
                this.compass.setTheme(style);
            });
        }
    }

    async initAudio() {
        try {
            await this.player.init();
            this.audioInitialized = true;
            console.log('Audio System Ready (Geo-Sample)');
            return true;
        } catch (e) {
            console.error('Failed to load audio:', e);
            throw e;
        }
    }

    start() {
        if (!this.audioInitialized) return;
        this.isPlaying = true;

        // Initial fetch
        this.checkAndFetchSamples();
    }

    stop() {
        this.isPlaying = false;
        this.player.stopAll();
    }

    update(mapData) {
        // 1. Move Map
        this.wanderer.update(mapData.type, mapData.elevation);

        // Update Visualization Amplitudes
        if (this.player) {
            const amps = this.player.getAmplitudes();
            // this.visLayer.updateAmplitudes(amps); // Removed

            // Update Compass
            // Pass ALL samples to the compass, not just active ones
            const allSamples = [...this.samplePool, ...this.fieldPool];
            const playingIds = this.player ? this.player.players.map(p => p.metadata && p.metadata.id).filter(Boolean) : [];
            const flightBearing = this.wanderer.bearing; // Current flight direction
            const pitch = this.mapManager.map.getPitch();

            // Info for Compass
            const center = this.mapManager.getCenter();
            const elevation = mapData.elevation || this.mapManager.map.queryTerrainElevation(center) || 0;
            const info = {
                lat: center.lat,
                lng: center.lng,
                elevation: elevation
            };

            if (this.showCompass) {
                this.compass.update(this.mapManager.map, allSamples, amps, playingIds, flightBearing, pitch, info);
            } else {
                this.compass.hide();
            }
        }

        // 2. Fetch new samples periodically (Always fetch to keep pool fresh)
        this.checkAndFetchSamples();

        // 2.5 Process Pending Samples (Add 1 per frame)
        if (this.pendingSamples && this.pendingSamples.length > 0) {
            const nextSample = this.pendingSamples.shift();
            // Only add if not already in pool
            if (!this.samplePool.some(s => s.id === nextSample.id)) {
                this.samplePool.push(nextSample);
                // Respect max pool size by removing oldest non-playing if needed
                // But we rely on culling mostly. If we strictly enforce size here, we might churn.
                // Let's just add for now, culling will handle distance.
            }
        }

        // 3. Schedule Playback from Pool (Only if playing)
        if (this.isPlaying) {
            this.updateSoundscape();
        }
    }

    async checkAndFetchSamples() {
        const now = Date.now();
        const center = this.mapManager.getCenter();
        if (!center) return;

        // Check Time
        if (now - this.lastFetchTime < this.fetchInterval) return;

        // Check Distance (Optimization)
        let movedEnough = false;
        if (this.lastFetchLocation) {
            const dx = center.lng - this.lastFetchLocation.lng;
            const dy = center.lat - this.lastFetchLocation.lat;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.fetchDistance) {
                movedEnough = true;
            }
        } else {
            movedEnough = true; // First fetch
        }

        if (!movedEnough) return;
        this.lastFetchTime = now;
        this.lastFetchLocation = center;

        // CULL DISTANT SAMPLES (One by one per frame is handled in update, but we can trigger a check here too or just rely on update loop)
        // Actually, let's move culling to update loop for "one by one" behavior?
        // The user said "Don't cull samples in batches, do it one by one".
        // So we should call a granular culling method in update().
        // For now, let's just do the fetch here.

        // We'll call granular culling in update() instead of here.
        this.cullOneDistantSample(center);

        try {
            // Parallel Fetch
            const [birdSamples, fieldSamples] = await Promise.all([
                this.xcService.fetchSamples(center.lat, center.lng, this.searchRadius).catch(e => {
                    console.error('XenoCanto Fetch Failed:', e);
                    return [];
                }),
                this.fsService.fetchSamples(center.lat, center.lng, this.searchRadius * 2).catch(e => {
                    console.error('Freesound Fetch Failed:', e);
                    return [];
                })
            ]);

            // Update Bird Pool -> Pending Queue
            if (birdSamples.length > 0) {
                if (!this.pendingSamples) this.pendingSamples = [];
                // Filter duplicates against pool AND pending
                const newSamples = birdSamples.filter(s =>
                    !this.samplePool.some(existing => existing.id === s.id) &&
                    !this.pendingSamples.some(pending => pending.id === s.id)
                );

                // Shuffle new samples so we don't just add them in list order?
                // Or just add them.
                this.pendingSamples.push(...newSamples);
            }

            // Update Field Pool (Direct update for now as they are few, or add to same queue?)
            // Field pool is separate. Let's keep it simple for field pool as it's small.
            if (fieldSamples.length > 0) {
                const newField = fieldSamples.filter(s => !this.fieldPool.some(existing => existing.id === s.id));
                if (newField.length > 0) {
                    this.fieldPool = [...this.fieldPool, ...newField];
                }
            }
        } catch (e) {
            console.error('Error in checkAndFetchSamples:', e);
        }
    }

    cullOneDistantSample(center) {
        const playingIds = new Set(this.player ? this.player.players.map(p => p.metadata && p.metadata.id).filter(Boolean) : []);
        const cullDistKm = this.searchRadius * 1.5;

        // Find ONE sample that is too far and NOT playing
        let worstIdx = -1;
        let maxDist = -1;

        for (let i = 0; i < this.samplePool.length; i++) {
            const s = this.samplePool[i];
            if (playingIds.has(s.id)) continue;
            if (typeof s.lat !== 'number' || typeof s.lng !== 'number') {
                // Invalid coords, remove immediately
                worstIdx = i;
                break;
            }

            const start = turf.point([center.lng, center.lat]);
            const end = turf.point([s.lng, s.lat]);
            const dist = turf.distance(start, end);

            if (dist > cullDistKm) {
                // Found a candidate. Is it the furthest?
                if (dist > maxDist) {
                    maxDist = dist;
                    worstIdx = i;
                }
            }
        }

        if (worstIdx !== -1) {
            const removed = this.samplePool.splice(worstIdx, 1)[0];
            console.log(`Culled distant sample: ${removed.name} (${maxDist ? maxDist.toFixed(1) : '?'}km)`);
        }
    }

    forceRefresh() {
        console.log('Force Refreshing Soundscape...');

        // 1. Stop Audio
        if (this.player) {
            this.player.stopAll();
        }

        // 2. Clear Pools
        this.samplePool = [];
        this.fieldPool = [];

        // 3. Reset Fetch State
        this.lastFetchTime = 0;
        this.lastFetchLocation = null;

        // 4. Clear UI
        if (this.uiManager) {
            this.uiManager.clearNowPlaying();
        }

        // 5. Clear Compass Markers
        if (this.compass) {
            this.compass.markerStates.clear();
        }

        // 6. Fetch Immediately
        this.checkAndFetchSamples();
    }

    async updateSoundscape() {
        const now = Date.now();

        // 1. Play Birds
        if (now > this.nextPlayTime) {
            const interval = 2000 + Math.random() * 6000;
            this.nextPlayTime = now + interval;

            if (this.samplePool.length > 0) {
                // ... (existing bird selection logic)
                const candidates = this.samplePool.sort((a, b) => {
                    const countA = a.playCount || 0;
                    const countB = b.playCount || 0;
                    return (countA - countB) + (Math.random() * 2 - 1);
                });

                // Filter candidates by distance to currently playing samples
                const playingSamples = this.player.players.map(p => p.metadata).filter(Boolean);
                const minSeparation = 0.005; // approx 500m

                const validCandidates = candidates.filter(c => {
                    return !playingSamples.some(p => {
                        const dx = c.lng - p.lng;
                        const dy = c.lat - p.lat;
                        return (dx * dx + dy * dy) < (minSeparation * minSeparation);
                    });
                });

                if (validCandidates.length > 0) {
                    const topN = Math.min(3, validCandidates.length);
                    const sample = validCandidates[Math.floor(Math.random() * topN)];
                    sample.playCount = (sample.playCount || 0) + 1;

                    const pan = (Math.random() * 1.6) - 0.8;
                    const volume = (0.4 + (Math.random() * 0.4)) * this.birdsVolume; // Apply Master Bird Volume

                    if (this.uiManager) this.uiManager.addPlayingSample(sample);

                    // Ensure source type is set
                    sample.source = 'xeno-canto';

                    this.player.play(sample.file, sample, {
                        pan,
                        volume,
                        onEnded: () => {
                            if (this.uiManager) this.uiManager.removePlayingSample(sample.id);
                            // if (this.visLayer) this.visLayer.removeNode(sample.id); // Removed
                        }
                    });
                }

                // Add Visual Node
                // if (this.visLayer && sample.lat && sample.lng) {
                //     this.visLayer.addNode(sample.id, sample.lat, sample.lng, sample.name);
                // }
            }
        }

        // 2. Play Field Recordings (Less frequent, longer)
        if (now > this.nextFieldPlayTime) {
            // Interval: 15s - 45s
            const interval = 15000 + Math.random() * 30000;
            this.nextFieldPlayTime = now + interval;

            if (this.fieldPool.length > 0) {
                // Pick random field recording
                const sample = this.fieldPool[Math.floor(Math.random() * this.fieldPool.length)];

                // Field recordings are usually stereo/ambient, keep pan central-ish
                const pan = (Math.random() * 0.4) - 0.2;
                const volume = (0.5 + (Math.random() * 0.3)) * this.fieldVolume; // Apply Master Field Volume

                // console.log(`Playing Field: ${sample.name}`);

                // We can reuse the player, but maybe we want a different "voice" or just play it.
                // SamplePlayer handles it fine.
                // Note: Field recordings might not have 'gen'/'sp' for the UI card.
                // We should adapt the UI or just play it without a card (or a different card).
                // For now, let's play it without adding to the "Bird" list.

                this.player.play(sample.url, sample, {
                    pan,
                    volume
                });
            }
        }
    }

    getConductorState() {
        return { type: 'geo', density: 0, entropy: 0, harmonyMode: 'wandering' };
    }

    getEngineState() {
        return {
            progressionIndex: 0,
            currentChord: 'geo-wandering',
            noise: { timing: 0, flam: 0, velocity: 0, sustain: 0 }
        };
    }
}
