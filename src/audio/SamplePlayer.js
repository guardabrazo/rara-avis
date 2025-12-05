import * as Tone from 'tone';

export class SamplePlayer {
    constructor() {
        this.output = new Tone.Reverb({ decay: 4, wet: 0.3 }).toDestination();
        this.players = []; // Keep track of active players
    }

    async init() {
        await this.output.generate();
    }

    play(url, meta, options = {}) {
        const { volume = 1.0, pan = 0, onEnded } = options;
        // console.log(`Playing: ${meta.en} (${meta.gen} ${meta.sp}) [Vol: ${volume.toFixed(2)}, Pan: ${pan.toFixed(2)}]`);

        // Rewrite URL to use local proxy to avoid CORS
        let proxyUrl = url;
        if (import.meta.env.PROD) {
            // Production: Use CORS Proxy
            proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        } else {
            // Development: Use local proxy
            proxyUrl = url.replace('https://xeno-canto.org', '/proxy-audio');
        }

        // Create nodes
        const panner = new Tone.Panner(pan).connect(this.output);
        const gain = new Tone.Gain(volume).connect(panner);
        const meter = new Tone.Meter({ smoothing: 0.8 }); // Smooth out the values
        const player = new Tone.Player().connect(meter);
        meter.connect(gain); // Pass through meter to gain

        // Store metadata for volume control
        player.metadata = {
            id: meta.id || Math.random().toString(36).substr(2, 9),
            gainNode: gain,
            meter: meter,
            sourceType: meta.source || 'unknown'
        };

        // Cleanup function
        const cleanup = () => {
            player.dispose();
            gain.dispose();
            panner.dispose();
            meter.dispose();
            const idx = this.players.indexOf(player);
            if (idx > -1) this.players.splice(idx, 1);
            if (onEnded) onEnded();
            // console.log(`Player cleaned up. Active players: ${this.players.length}`);
        };

        player.onstop = cleanup;
        player.loop = false;
        player.fadeIn = 2;
        player.fadeOut = 2;

        // Explicit Load & Play
        player.load(proxyUrl)
            .then(() => {
                if (player.loaded) {
                    player.start();
                    this.players.push(player);
                    // console.log(`Player started. Active players: ${this.players.length}`);
                } else {
                    console.warn("Player loaded but buffer empty?", meta.id);
                    cleanup();
                }
            })
            .catch(e => {
                console.warn(`Failed to load audio for ${meta.id}:`, e);
                cleanup();
            });

        return player.metadata.id;
    }

    setVolume(sourceType, volume) {
        this.players.forEach(p => {
            if (p.metadata && p.metadata.sourceType === sourceType) {
                // Smooth ramp to new volume
                p.metadata.gainNode.gain.rampTo(volume, 0.1);
            }
        });
    }

    stopAll() {
        [...this.players].forEach(p => p.stop());
        this.players = [];
    }

    getAmplitudes() {
        const amps = {};
        this.players.forEach(p => {
            if (p.metadata && p.metadata.meter) {
                // Tone.Meter.getValue() returns decibels. We want linear 0-1.
                // However, for visualization, raw dB might be tricky.
                // Tone.Meter can return normal range if we use getValues? No.
                // Let's convert dB to linear: 10^(dB/20)
                const db = p.metadata.meter.getValue();
                // Clamp and normalize roughly
                // -60dB is silence, 0dB is max
                let linear = 0;
                if (db > -60) {
                    linear = Math.pow(10, db / 20);
                }
                amps[p.metadata.id] = linear;
            }
        });
        return amps;
    }
}
