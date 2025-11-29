import * as Tone from 'tone';
import irUrl from '../../assets/berlin_tunnel_ir.wav';

export class Effects {
    constructor() {
        this.compressor = new Tone.Compressor({
            threshold: -20,
            ratio: 3,
        });

        this.convolver = new Tone.Convolver();

        this.limiter = new Tone.Limiter(-1); // Limit at -1dB

        // Chain: Input -> Compressor -> Convolver -> Limiter -> Destination
        // We expose compressor as the input point
        this.compressor.connect(this.convolver);
        this.convolver.connect(this.limiter);
        this.limiter.toDestination();
    }

    async load() {
        await this.convolver.load(irUrl);
        console.log('Convolver loaded');
    }

    getInput() {
        return this.compressor;
    }

    setReverbWet(amount) {
        // Tone.Convolver doesn't have a direct "wet" property in the same way as some effects, 
        // but it extends Tone.Effect which has wet.
        this.convolver.wet.value = amount;
    }
}
