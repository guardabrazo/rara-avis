import * as Tone from 'tone';
import { Wanderer } from './Wanderer';
import { XenoCantoService } from '../services/XenoCantoService';
import { FreesoundService } from '../services/FreesoundService';
import { SamplePlayer } from '../audio/SamplePlayer';
import { Compass } from '../ui/Compass';

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
        this.maxPoolSize = 300;

        this.birdsVolume = 0.7;
        this.fieldVolume = 0.5;
        this.showCompass = true; // Default ON

        // Bind methods
        this.update = this.update.bind(this);

        this.nextPlayTime = 0;
        this.nextFieldPlayTime = 0;

        this.lastFetchLocation = null;
        this.lastFetchTime = 0;
        this.fetchInterval = 30000; // 30 seconds
        this.fetchDistance = 0.02; // ~2km degrees
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

            this.uiManager.on('setAutopilot', (enabled) => {
                this.wanderer.setMode(enabled ? 'random' : 'locked');
            });

            this.uiManager.on('setWanderDirection', (val) => this.wanderer.setBearing(val));
            this.uiManager.on('setFlySpeed', (val) => this.wanderer.setSpeed(val));



            this.uiManager.on('setSearchScope', (val) => {
                this.searchRadius = val;
                console.log(`Search Scope set to ${val}km`);
            });

            this.uiManager.on('setBirdsVolume', (val) => {
                this.birdsVolume = val / 100;
                this.player.setVolume('xeno-canto', this.birdsVolume);
            });

            this.uiManager.on('setFieldVolume', (val) => {
                this.fieldVolume = val / 100;
                this.player.setVolume('freesound', this.fieldVolume);
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
        this.wanderer.update(mapData.type);

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
            const elevation = this.mapManager.map.queryTerrainElevation(center) || 0;
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

        // Check Distance (Optional optimization)
        // if (this.lastFetchLocation) {
        //     const dx = center.lng - this.lastFetchLocation.lng;
        //     const dy = center.lat - this.lastFetchLocation.lat;
        //     const dist = Math.sqrt(dx*dx + dy*dy);
        //     if (dist < this.fetchDistance) return;
        // }

        // FETCH
        this.lastFetchTime = now;
        this.lastFetchLocation = center;

        // CULL DISTANT SAMPLES
        this.cullDistantSamples(center);

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

            // Update Bird Pool
            if (birdSamples.length > 0) {
                const newSamples = birdSamples.filter(s => !this.samplePool.some(existing => existing.id === s.id));
                if (newSamples.length > 0) {
                    // Combine new and existing
                    let combined = [...newSamples, ...this.samplePool];

                    // Get currently playing IDs
                    const playingIds = this.player ? this.player.players.map(p => p.metadata && p.metadata.id).filter(Boolean) : [];

                    // Separate playing vs others
                    const playing = combined.filter(s => playingIds.includes(s.id));
                    const others = combined.filter(s => !playingIds.includes(s.id));

                    // Trim 'others' to fit maxPoolSize (minus playing count)
                    const spaceLeft = Math.max(0, this.maxPoolSize - playing.length);
                    const keptOthers = others.slice(0, spaceLeft);

                    this.samplePool = [...playing, ...keptOthers];
                }
            }

            // Update Field Pool
            if (fieldSamples.length > 0) {
                const newField = fieldSamples.filter(s => !this.fieldPool.some(existing => existing.id === s.id));
                if (newField.length > 0) {
                    this.fieldPool = [...newField, ...this.fieldPool];
                    // Keep field pool smaller/fresher
                    if (this.fieldPool.length > 10) {
                        this.fieldPool = this.fieldPool.slice(0, 10);
                    }
                }
            }
        } catch (e) {
            console.error('Error in checkAndFetchSamples:', e);
        }
    }

    updateSoundscape() {
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

                const topN = Math.min(3, candidates.length);
                const sample = candidates[Math.floor(Math.random() * topN)];
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

    cullDistantSamples(center) {
        const cullRadius = this.searchRadius * 3; // Keep samples within 3x search radius
        const cullRadiusDeg = cullRadius / 111; // Approx degrees

        // Get currently playing IDs to prevent culling them
        const playingIds = this.player ? this.player.players.map(p => p.metadata && p.metadata.id).filter(Boolean) : [];

        const filterPool = (pool, name) => {
            const initialCount = pool.length;
            const kept = pool.filter(sample => {
                // ALWAYS KEEP PLAYING SAMPLES
                if (playingIds.includes(sample.id)) return true;

                // Handle samples without coords (e.g. some freesound results might be vague, but we try to get coords)
                if (!sample.lat || !sample.lng) return true;

                const dx = sample.lng - center.lng;
                const dy = sample.lat - center.lat;
                const distDeg = Math.sqrt(dx * dx + dy * dy);

                // Simple Euclidean check on degrees is sufficient for this scale
                return distDeg < cullRadiusDeg;
            });

            const removedCount = initialCount - kept.length;
            if (removedCount > 0) {
                // console.log(`Culled ${removedCount} distant samples from ${name} pool.`);
            }
            return kept;
        };

        this.samplePool = filterPool(this.samplePool, 'Birds');
        this.fieldPool = filterPool(this.fieldPool, 'Field');
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
