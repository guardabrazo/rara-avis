export class DebugPanel {
    constructor() {
        this.container = null;
        this.isVisible = false;
        this.callbacks = {};
    }

    init() {
        this.createDOM();
        this.setupListeners();
    }

    createDOM() {
        this.container = document.createElement('div');
        this.container.id = 'debug-panel';
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #444;
            padding: 15px;
            color: #fff;
            font-family: monospace;
            z-index: 9999;
            display: none;
            border-radius: 8px;
        `;

        this.container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;">
                <span style="font-weight: bold; color: #00ff88;">DEBUG PANEL</span>
                <button id="debug-close" style="background: none; border: none; color: #888; cursor: pointer;">X</button>
            </div>

            <!-- Status -->
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.8em; color: #aaa; margin-bottom: 2px;">STATUS</div>
                <div style="display: flex; justify-content: space-between; font-family: monospace; font-size: 0.9em;">
                    <span>Progression:</span>
                    <span id="debug-progression-val" style="color: #00ff88;">0</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-family: monospace; font-size: 0.9em;">
                    <span>Chord:</span>
                    <span id="debug-current-chord" style="color: #00ff88;">-</span>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
    }

    setupListeners() {
        this.container.querySelector('#debug-close').addEventListener('click', () => {
            this.toggle();
        });

        // Keyboard Shortcut (Shift + D)
        document.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'D') {
                this.toggle();
            }
        });
    }

    toggle(force) {
        this.isVisible = force !== undefined ? force : !this.isVisible;
        this.container.style.display = this.isVisible ? 'block' : 'none';
    }

    updateState(state) {
        if (!this.isVisible) return;

        const get = (id) => this.container.querySelector(`#${id}`);
        if (get('debug-progression-val')) get('debug-progression-val').textContent = Math.floor(state.progressionIndex);
        if (get('debug-current-chord')) get('debug-current-chord').textContent = state.currentChord;
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    emit(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }
}
