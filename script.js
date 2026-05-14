
/* ================================================================
   CONFIGURATION
   All tunable parameters for the game. Modify this object to
   customize behavior without touching core logic.
   ================================================================ */
const CONFIG = {
    board: { width: 10, height: 20, cellSize: 30 },
    levels: { maxLevel: 20, linesPerLevel: 10 },
    scoring: { single: 40, double: 100, triple: 300, tetris: 800, softDrop: 1 },
    speed: {
        baseDropInterval: 1000,   // ms per gravity tick at level 0
        dropIntervalDecay: 0.95,  // multiplier per level
        minDropInterval: 50       // fastest possible gravity tick
    },
    controls: {
        keys: {
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD'],
            down: ['ArrowDown', 'KeyS'],
            hardDrop: 'Space',
            rotateCW: ['ArrowUp', 'KeyW', 'KeyX'],
            rotateCCW: 'KeyZ',
            pause: ['Escape', 'KeyP']
        },
        das: 170,                      // Delayed Auto Shift (ms) - wait before auto-repeat starts
        arr: 50,                      // Auto Repeat Rate (ms) - how fast keys repeat after DAS
        lockDelay: 500,               // ms before piece locks when grounded
        lockDelayResetOnInput: false,  // Reset lock timer on input while grounded
        gameOverThreshold: 2          // Rows above board that trigger Game Over
    },
    visuals: {
        showGhostPiece: true,
        ghostPieceOpacity: 0.3,
        gridOpacity: 0.1,
        blockColors: {
            I: '#00c1d7',
            O: '#e3c737',
            T: '#6a007d',
            S: '#5bd097',
            Z: '#d23232',
            J: '#316cd0',
            L: '#cb7d18'
        }
    },  
    animations: {
        hardDropFlash: true,
        lineClearPause: 900           // Time to pause after line clear before removing rows (ms)
    },
    audio: {
        sfx: {
            harddrop: './sounds/harddrop.wav',
            softdrop: './sounds/softdrop.wav',
            rotate: './sounds/rotate.wav',
            clear: './sounds/clear.wav',
            tetris: './sounds/tetris.wav',
            gameover: './sounds/gameover.wav',
            pause: './sounds/pause.wav',
            levelup: './sounds/levelup.wav',
            move: './sounds/move.wav'
        },
        bgm: [
            { id: 'none', label: 'No Music', src: null },
            { id: 'a', label: 'GUILE', src: './music/GUILE.mp3' },
            { id: 'b', label: 'Song B', src: './music/track_b.mp3' }
        ],
        volume: { sfx: 0.8, bgm: 0.5 }
    },
    ui: {
        showLinesCleared: true,
        spawnOffset: { x: 4, y: -1 }  // Spawn position offset for new pieces
    },
    dev: {
        debugMode: false,
        persistentHighScore: false,
        targetFPS: 60,
        randomizer: '7bag'            // '7bag' (fair distribution) or 'pureRandom'
    }
};

/* ================================================================
   TETROMINO DEFINITIONS
   Each piece is a 2D matrix. 1 = filled cell.
   ================================================================ */
const PIECES = {
    I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: 'I' },
    O: { shape: [[1, 1], [1, 1]], color: 'O' },
    T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: 'T' },
    S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 'S' },
    Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 'Z' },
    J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: 'J' },
    L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: 'L' }
};

const PIECE_KEYS = Object.keys(PIECES);

/* ================================================================
   AUDIO MANAGER
   Handles SFX playback and BGM with pause/resume support.
   ================================================================ */
class AudioManager {
    constructor() {
        this.sfxSounds = {};       // Template Audio elements for each SFX key
        this.bgmAudio = null;      // Current BGM Audio element
        this.currentBgmId = 'none';
        this.sfxVolume = CONFIG.audio.volume.sfx;
        this.bgmVolume = CONFIG.audio.volume.bgm;
        this._loadSFX();
    }

    // -- SFX Management --

    /* Preload all SFX from CONFIG.audio.sfx */
    _loadSFX() {
        for (const [key, path] of Object.entries(CONFIG.audio.sfx)) {
            const audio = new Audio();
            audio.src = path;
            audio.preload = 'auto';
            audio.volume = this.sfxVolume;
            this.sfxSounds[key] = audio;
        }
    }

    /* Play an SFX by key. Clones the template so overlapping plays work
       (e.g. rapid drops). Falls back to replaying the original if clone fails. */
    play(key) {
        const template = this.sfxSounds[key];
        if (!template) return;
        try {
            const clone = template.cloneNode();
            clone.volume = this.sfxVolume;
            clone.play().catch(() => {}); // ignore autoplay-blocked errors
        } catch {
            // Fallback: restart the original template
            try {
                template.currentTime = 0;
                template.play().catch(() => {});
            } catch { /* silently fail */ }
        }
    }

    // -- BGM Management --

    /* Set BGM track by id from CONFIG.audio.bgm. Stops any currently playing track. */
    setBgm(id) {
        const track = CONFIG.audio.bgm.find(t => t.id === id);
        if (!track) return;
        this.currentBgmId = id;

        this.stopBgm();
        if (!track.src) return; // 'none' selected

        try {
            this.bgmAudio = new Audio(track.src);
            this.bgmAudio.loop = true;
            this.bgmAudio.volume = this.bgmVolume;
            this.bgmAudio.play().catch(() => {});
        } catch {
            this.bgmAudio = null;
        }
    }

    /* Resume BGM if paused, or re-create it if it was disposed. */
    playBgm() {
        if (!this.bgmAudio) {
            this.setBgm(this.currentBgmId);
            return;
        }
        if (this.bgmAudio.paused) {
            this.bgmAudio.play().catch(() => {});
        }
    }

    pauseBgm() {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            this.bgmAudio.pause();
        }
    }

    stopBgm() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
    }

    // -- Volume --

    setVolumes(sfxVol, bgmVol) {
        this.sfxVolume = sfxVol;
        this.bgmVolume = bgmVol;
        for (const s of Object.values(this.sfxSounds)) s.volume = sfxVol;
        if (this.bgmAudio) this.bgmAudio.volume = bgmVol;
    }
}

/* ================================================================
   RANDOMIZER
   Two modes: 7-Bag (modern fair distribution) and Pure Random.
   7-Bag guarantees each of the 7 tetrominos appears once before repeating.
   ================================================================ */
class Randomizer {
    constructor(mode) {
        this.mode = mode;
        this.bag = [];
    }

    // -- Piece Generation --

    /* Returns the next tetromino key string */
    next() {
        if (this.mode === '7bag') {
            if (this.bag.length === 0) this._refillBag();
            return this.bag.pop();
        }
        // Pure random: equal chance for any piece each time
        return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
    }

    /* Peek at the upcoming piece (for preview display) */
    peek() {
        if (this.mode === '7bag') {
            if (this.bag.length === 0) this._refillBag();
            return this.bag[this.bag.length - 1];
        }
        return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
    }

    // -- Internal --

    /* Refill the bag with all 7 pieces, shuffled via Fisher-Yates */
    _refillBag() {
        this.bag = [...PIECE_KEYS];
        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
    }
}

/* ================================================================
   INPUT HANDLER
   Manages keyboard input with DAS (Delayed Auto Shift) and
   ARR (Auto Repeat Rate) for held directional keys.
   ================================================================ */
class InputHandler {
    constructor() {
        /* Track state per action. DAS/ARR timers only used by left/right/down. */
        this.actions = {
            left: { pressed: false, dasTimer: null, arrTimer: null },
            right: { pressed: false, dasTimer: null, arrTimer: null },
            down: { pressed: false, dasTimer: null, arrTimer: null },
            hardDrop: { pressed: false },
            rotateCW: { pressed: false },
            rotateCCW: { pressed: false },
            pause: { pressed: false }
        };

        /* Reverse lookup: keyCode -> list of action names */
        this.keyMap = new Map();
        this._buildKeyMap();

        /* Callbacks invoked by Game class */
        this.callbacks = {
            onAction: null,   // (action) => void  – fired on initial key press
            onRepeat: null    // (action) => void  – fired by ARR timer while held
        };

        window.addEventListener('keydown', (e) => this._onKeyDown(e));
        window.addEventListener('keyup', (e) => this._onKeyUp(e));
    }

    // -- Key Mapping --

    /* Build reverse lookup from CONFIG.controls.keys: keyCode -> [action, ...] */
    _buildKeyMap() {
        for (const [action, keyCodes] of Object.entries(CONFIG.controls.keys)) {
            const codes = Array.isArray(keyCodes) ? keyCodes : [keyCodes];
            for (const code of codes) {
                if (!this.keyMap.has(code)) this.keyMap.set(code, []);
                this.keyMap.get(code).push(action);
            }
        }
    }

    // -- Event Handlers --

    _onKeyDown(e) {
        const actions = this.keyMap.get(e.code);
        if (!actions) return;

        /* Prevent scrolling / browser shortcuts for any mapped game key */
        e.preventDefault();

        for (const action of actions) {
            this._handlePress(action);
        }
    }

    _onKeyUp(e) {
        const actions = this.keyMap.get(e.code);
        if (!actions) return;

        for (const action of actions) {
            this._handleRelease(action);
        }
    }

    // -- Action State --

    _handlePress(action) {
        const act = this.actions[action];
        if (!act || act.pressed) return;

        act.pressed = true;

        /* Fire instant action callback on first press */
        if (this.callbacks.onAction) this.callbacks.onAction(action);

        /* Start DAS/ARR repeat for directional hold (left, right, down) */
        if (['left', 'right', 'down'].includes(action)) {
            act.dasTimer = setTimeout(() => {
                act.arrTimer = setInterval(() => {
                    if (this.callbacks.onRepeat) this.callbacks.onRepeat(action);
                }, CONFIG.controls.arr);
            }, CONFIG.controls.das);
        }
    }

    _handleRelease(action) {
        const act = this.actions[action];
        if (!act) return;

        act.pressed = false;
        if (act.dasTimer) { clearTimeout(act.dasTimer); act.dasTimer = null; }
        if (act.arrTimer) { clearInterval(act.arrTimer); act.arrTimer = null; }
    }

    /* Reset all action state and timers (used on pause / game over) */
    reset() {
        for (const act of Object.values(this.actions)) {
            act.pressed = false;
            if (act.dasTimer) { clearTimeout(act.dasTimer); act.dasTimer = null; }
            if (act.arrTimer) { clearInterval(act.arrTimer); act.arrTimer = null; }
        }
    }
}

/* ================================================================
   BOARD / STATE MANAGER
   Manages the grid, active piece, scoring, leveling, line clears,
   lock delay, and ghost piece calculation.
   ================================================================ */

/* Shared wall-kick offsets tried when a rotation collides.
   Format: [dx, dy] – tested in order until one fits. */
const WALL_KICKS = [
    [-1, 0], [1, 0], [0, -1],
    [-2, 0], [2, 0], [0, -2],
    [-1, -1], [1, -1]
];

class Board {
    constructor() {
        this.width = CONFIG.board.width;
        this.height = CONFIG.board.height;
        this.grid = this._createGrid();
        this.score = 0;
        this.lines = 0;
        this.level = 0;
        this.activePiece = null;
        this.activeX = 0;
        this.activeY = 0;
        this.activeRotation = 0;    // 0..3  (quarter-turns CW from base)
        this.lockElapsed = 0;       // ms accumulated toward lock delay
        this.isLocked = false;
        this.lineFlashRows = [];    // rows currently flashing during line-clear anim
        this.lineFlashTimer = 0;    // timestamp when flash started
        this.isLineClearing = false;
        this.lineClearPauseElapsed = 0;
        this.pendingClearRows = [];
        this.pendingLevelUp = false;  // Track level up for deferred sound
        this.gameOver = false;
        this.randomizer = new Randomizer(CONFIG.dev.randomizer);
        this.nextPieceKey = this.randomizer.next();
    }

    // -- Grid Initialization --

    /* Create an empty height x width grid (null = empty cell) */
    _createGrid() {
        return Array.from({ length: this.height }, () => Array(this.width).fill(null));
    }

    /* Reset all board state for a new game */
    reset(startLevel) {
        this.grid = this._createGrid();
        this.score = 0;
        this.lines = 0;
        this.level = startLevel;
        this.activePiece = null;
        this.activeX = 0;
        this.activeY = 0;
        this.activeRotation = 0;
        this.lockElapsed = 0;
        this.isLocked = false;
        this.lineFlashRows = [];
        this.lineFlashTimer = 0;
        this.isLineClearing = false;
        this.lineClearPauseElapsed = 0;
        this.pendingClearRows = [];
        this.pendingLevelUp = false;
        this.gameOver = false;
        this.randomizer = new Randomizer(CONFIG.dev.randomizer);
        this.nextPieceKey = this.randomizer.next();
    }

    // -- Piece Spawning --

    /* Spawn the next queued piece at the top-center of the board.
       Sets gameOver = true if the spawn position immediately collides. */
    spawnPiece() {
        const key = this.nextPieceKey;
        this.nextPieceKey = this.randomizer.next();

        const shape = this._getRotatedShape(key, 0);
        this.activePiece = key;
        this.activeRotation = 0;
        this.activeX = CONFIG.ui.spawnOffset.x - Math.floor(shape[0].length / 2);
        this.activeY = CONFIG.ui.spawnOffset.y;
        this.isLocked = false;
        this.lockElapsed = 0;

        /* Collision at spawn means the board is full -> game over */
        if (this._collides(this.activeX, this.activeY, shape)) {
            this.gameOver = true;
            this.activePiece = null; // Prevent further gravity / input updates
        }
    }

    // -- Shape / Rotation Utilities --

    /* Return a deep-copied shape matrix rotated `rotation` quarter-turns CW */
    _getRotatedShape(key, rotation) {
        let shape = PIECES[key].shape.map(row => [...row]);
        for (let i = 0; i < rotation; i++) {
            shape = this._rotateMatrixCW(shape);
        }
        return shape;
    }

    /* Rotate a square matrix 90 degrees clockwise */
    _rotateMatrixCW(matrix) {
        const n = matrix.length;
        const result = Array.from({ length: n }, () => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                result[c][n - 1 - r] = matrix[r][c];
            }
        }
        return result;
    }

    // -- Collision Detection --

    /* Check whether `shape` placed at (x, y) overlaps walls or locked blocks.
       Cells above the visible board (y < 0) are allowed (spawn buffer). */
    _collides(x, y, shape) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const bx = x + c;
                const by = y + r;
                if (bx < 0 || bx >= this.width) return true;   // horizontal wall
                if (by >= this.height) return true;             // floor
                if (by < 0) continue;                           // above-board buffer
                if (this.grid[by][bx] !== null) return true;    // locked block
            }
        }
        return false;
    }

    /* Check whether the active piece would collide one row below (grounded) */
    _isGrounded() {
        if (!this.activePiece) return false;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        return this._collides(this.activeX, this.activeY + 1, shape);
    }

    // -- Movement --

    /* Attempt to shift the active piece by (dx, dy). Returns true on success. */
    move(dx, dy) {
        if (!this.activePiece || this.isLocked) return false;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        if (!this._collides(this.activeX + dx, this.activeY + dy, shape)) {
            this.activeX += dx;
            this.activeY += dy;
            this._maybeResetLockDelay();
            // Play move sound on horizontal movement only
            if (dx !== 0) {
                window.game?.audio?.play('move');
            }
            return true;
        }
        return false;
    }

    // -- Rotation (shared logic for CW and CCW) --

    /* Attempt rotation to `newRot`. Tries base position then WALL_KICKS.
       Resets lock delay on success if grounded and configured. */
    _tryRotate(newRot) {
        if (!this.activePiece || this.isLocked) return false;
        const shape = this._getRotatedShape(this.activePiece, newRot);

        // Try the current position first
        if (!this._collides(this.activeX, this.activeY, shape)) {
            this.activeRotation = newRot;
            this._maybeResetLockDelay();
            return true;
        }

        // Try each wall-kick offset in order
        for (const [kx, ky] of WALL_KICKS) {
            if (!this._collides(this.activeX + kx, this.activeY + ky, shape)) {
                this.activeX += kx;
                this.activeY += ky;
                this.activeRotation = newRot;
                this._maybeResetLockDelay();
                return true;
            }
        }
        return false;
    }

    /* Rotate clockwise (quarter-turn +1) */
    rotateCW() {
        return this._tryRotate((this.activeRotation + 1) % 4);
    }

    /* Rotate counter-clockwise (quarter-turn +3 ≡ -1 mod 4) */
    rotateCCW() {
        return this._tryRotate((this.activeRotation + 3) % 4);
    }

    // -- Locking --

    /* Hard drop: slide piece to the lowest valid Y, then lock it.
       Returns the number of cells dropped (for scoring). */
    hardDrop() {
        if (!this.activePiece || this.isLocked) return 0;
        let distance = 0;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        while (!this._collides(this.activeX, this.activeY + 1, shape)) {
            this.activeY++;
            distance++;
        }
        this._lockPiece();
        return distance;
    }

    /* Bake the active piece into the grid and trigger line-check. */
    _lockPiece() {
        if (!this.activePiece || this.isLocked) return;
        this.isLocked = true;

        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const bx = this.activeX + c;
                const by = this.activeY + r;
                if (by >= 0 && by < this.height && bx >= 0 && bx < this.width) {
                    this.grid[by][bx] = this.activePiece;
                }
            }
        }

        this.activePiece = null;
        this._checkLines();
    }

    /* Called each frame: accumulate lock delay while grounded, lock when threshold hit. */
    updateLockDelay(dt) {
        if (!this.activePiece || this.isLocked) return;

        if (this._isGrounded()) {
            this.lockElapsed += dt;
            if (this.lockElapsed >= CONFIG.controls.lockDelay) {
                this._lockPiece();
                // Play softdrop (lock) sound - distinct from harddrop
                window.game?.audio?.play('softdrop');
            }
        } else {
            this.lockElapsed = 0; // mid-air: reset
        }
    }

    /* Reset lock timer if the piece is grounded and the feature is enabled.
       Called after every successful move or rotation. */
    _maybeResetLockDelay() {
        if (CONFIG.controls.lockDelayResetOnInput && this._isGrounded()) {
            this.lockElapsed = 0;
        }
    }

    // -- Line Clearing --

    /* Detect full rows, calculate score/level, play SFX, and start the
       deferred-clear animation (rows stay visible during the flash). */
    _checkLines() {
        const fullRows = [];
        for (let r = 0; r < this.height; r++) {
            if (this.grid[r].every(cell => cell !== null)) {
                fullRows.push(r);
            }
        }

        if (fullRows.length === 0) {
            this.spawnPiece();
            return;
        }

        // Score using Gameboy formula: base × (level + 1)
        const multiplier = this.level + 1;
        let lineScore = 0;
        switch (fullRows.length) {
            case 1: lineScore = CONFIG.scoring.single * multiplier; break;
            case 2: lineScore = CONFIG.scoring.double * multiplier; break;
            case 3: lineScore = CONFIG.scoring.triple * multiplier; break;
            case 4: lineScore = CONFIG.scoring.tetris * multiplier; break;
            default: lineScore = CONFIG.scoring.single * multiplier * fullRows.length;
        }

        this.score += lineScore;
        this.lines += fullRows.length;

        // Level up (capped at maxLevel)
        const oldLevel = this.level;
        const newLevel = Math.min(
            CONFIG.levels.maxLevel,
            Math.floor(this.lines / CONFIG.levels.linesPerLevel)
        );
        this.level = Math.max(this.level, newLevel);

        // Defer level up sound to play after line clear animation
        if (this.level > oldLevel) {
            this.pendingLevelUp = true;
        }

        // Play appropriate SFX
        if (fullRows.length === 4) {
            window.game?.audio?.play('tetris');
        } else {
            window.game?.audio?.play('clear');
        }

        // Defer row removal so the flash animation can play first
        this.pendingClearRows = fullRows;
        this.lineFlashRows = fullRows;
        this.isLineClearing = true;
        this.lineClearPauseElapsed = 0;
        this.lineFlashTimer = performance.now();
    }

    /* Called each frame during line-clear animation. After the configured
       pause elapses, actually remove the rows and spawn the next piece. */
    checkLineClearPause(dt) {
        if (!this.isLineClearing) return;
        this.lineClearPauseElapsed += dt;

        if (this.lineClearPauseElapsed >= CONFIG.animations.lineClearPause) {
            this.isLineClearing = false;

            // Remove cleared rows and prepend empty ones
            if (this.pendingClearRows.length > 0) {
                const removeSet = new Set(this.pendingClearRows);
                this.grid = this.grid.filter((_, i) => !removeSet.has(i));
                for (let i = 0; i < this.pendingClearRows.length; i++) {
                    this.grid.unshift(Array(this.width).fill(null));
                }
            }

            this.lineFlashRows = [];
            this.pendingClearRows = [];

            // Play deferred level up sound after line clear animation
            if (this.pendingLevelUp) {
                this.pendingLevelUp = false;
                window.game?.audio?.play('levelup');
            }

            this.spawnPiece();
        }
    }

    // -- Query Helpers --

    /* Y coordinate where the active piece would land (for ghost piece rendering) */
    getGhostY() {
        if (!this.activePiece) return this.activeY;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        let ghostY = this.activeY;
        while (!this._collides(this.activeX, ghostY + 1, shape)) {
            ghostY++;
        }
        return ghostY;
    }

    /* Gravity tick interval in ms for the current level */
    getDropInterval() {
        const interval = CONFIG.speed.baseDropInterval *
            Math.pow(CONFIG.speed.dropIntervalDecay, this.level);
        return Math.max(interval, CONFIG.speed.minDropInterval);
    }
}

/* ================================================================
   RENDERER
   Draws the game board, ghost piece, grid, active piece, and previews
   using HTML5 Canvas.
   ================================================================ */
class Renderer {
    constructor(canvas, nextCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nextCanvas = nextCanvas;
        this.nextCtx = nextCanvas.getContext('2d');
        this.cellSize = 30;
        this.hardDropFlashAlpha = 0;
        this.hardDropFlashTimer = 0;

        this._resize();

        /* Listen for window resizes */
        window.addEventListener('resize', () => this._resize());

        /* Dynamically track container size changes */
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(canvas.parentElement);
    }

    /* Calculate optimal cell size based on viewport constraints */
    _resize() {
        const wrapper = this.canvas.parentElement;
        if (!wrapper) return;

        const boardW = CONFIG.board.width;
        const boardH = CONFIG.board.height;

        /* 1. Determine strict boundaries based on Window, not just container */
        /* Subtracting padding/margins roughly to ensure it fits */
        const maxW = Math.min(wrapper.clientWidth, window.innerWidth * 0.90);
        const maxH = Math.min(wrapper.clientHeight, window.innerHeight * 0.90);

        /* 2. Calculate the largest cell size that fits within BOTH width and height */
        /* We prioritize height to prevent the overflow issue */
        let cellSize = Math.floor(Math.min(
            maxW / boardW,
            maxH / boardH
        ));

        /* 3. Set internal resolution (crisp rendering) */
        this.cellSize = Math.max(cellSize, 16);
        this.canvas.width = boardW * this.cellSize;
        this.canvas.height = boardH * this.cellSize;

        /* 4. Scale next piece preview proportionally */
        this.nextCanvas.width = 4 * this.cellSize;
        this.nextCanvas.height = 4 * this.cellSize;

        /* 5. Redraw immediately if game is running */
        if (window.game && window.game.board) {
            window.game.renderer.draw(window.game.board);
        }
    }

    /* Main draw call for the game board */
    draw(board, isPaused = false) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const w = CONFIG.board.width;
        const h = CONFIG.board.height;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this._drawGrid(ctx, cs, w, h);

        if (isPaused) {
            this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        } else {
            this._drawGridBlocks(ctx, board, cs);

            if (CONFIG.visuals.showGhostPiece && board.activePiece && !board.isLocked) {
                this._drawGhostPiece(ctx, board, cs);
            }
            if (board.activePiece && !board.isLocked) {
                this._drawActivePiece(ctx, board, cs);
            }
            this._drawNextPiece(board);
        }

        // Draw line-clear flash: toggle white overlay on cleared rows
        this._drawLineFlash(ctx, board, cs, w);

        // Overlay hard-drop flash
        if (this.hardDropFlashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.hardDropFlashAlpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /* Draw the flashing white bars on completed rows during line-clear animation.
       Toggles on/off every ~120ms to create a blink effect. */
    _drawLineFlash(ctx, board, cs, boardW) {
        if (board.lineFlashRows.length === 0) return;

        // Determine flash phase: blink on/off every 120ms
        const elapsed = performance.now() - board.lineFlashTimer;
        const flashPeriod = 120; // ms per on/off phase
        const isVisible = Math.floor(elapsed / flashPeriod) % 2 === 0;

        if (!isVisible) return; // "off" phase — skip drawing

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (const row of board.lineFlashRows) {
            ctx.fillRect(0, row * cs, boardW * cs, cs);
        }
    }

    /* Draw grid lines with subtle opacity */
    _drawGrid(ctx, cs, w, h) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${CONFIG.visuals.gridOpacity})`;
        ctx.lineWidth = 0.5;
        for (let x = 1; x < w; x++) {
            ctx.beginPath();
            ctx.moveTo(x * cs, 0);
            ctx.lineTo(x * cs, h * cs);
            ctx.stroke();
        }
        for (let y = 1; y < h; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * cs);
            ctx.lineTo(w * cs, y * cs);
            ctx.stroke();
        }
    }

    /* Draw all placed blocks in the grid */
    _drawGridBlocks(ctx, board, cs) {
        for (let r = 0; r < board.height; r++) {
            for (let c = 0; c < board.width; c++) {
                const cell = board.grid[r][c];
                if (cell) {
                    this._drawBlock(ctx, c * cs, r * cs, cs, CONFIG.visuals.blockColors[cell]);
                }
            }
        }
    }

    /* Draw the ghost piece (translucent) */
    _drawGhostPiece(ctx, board, cs) {
        const shape = board._getRotatedShape(board.activePiece, board.activeRotation);
        const ghostY = board.getGhostY();
        const color = CONFIG.visuals.blockColors[board.activePiece];
        const opacity = CONFIG.visuals.ghostPieceOpacity;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const x = (board.activeX + c) * cs;
                const y = (ghostY + r) * cs;
                if (y < 0) continue;
                ctx.globalAlpha = opacity;
                this._drawBlock(ctx, x, y, cs, color);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* Draw the active piece with a highlight */
    _drawActivePiece(ctx, board, cs) {
        const shape = board._getRotatedShape(board.activePiece, board.activeRotation);
        const color = CONFIG.visuals.blockColors[board.activePiece];

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const x = (board.activeX + c) * cs;
                const y = (board.activeY + r) * cs;
                if (y < 0) continue; // Don't draw above the board
                this._drawBlock(ctx, x, y, cs, color, true);
            }
        }
    }

    /* Draw a single cell block with bevel effect */
    _drawBlock(ctx, x, y, size, color, highlight = false) {
        const inset = Math.max(1, size * 0.1);

        /* Main fill */
        ctx.fillStyle = color;
        ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);

        /* Highlight (top-left) */
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x + inset, y + inset, size - inset * 2, inset);
        ctx.fillRect(x + inset, y + inset, inset, size - inset * 2);

        /* Shadow (bottom-right) */
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x + inset, y + size - inset * 2, size - inset * 2, inset);
        ctx.fillRect(x + size - inset * 2, y + inset, inset, size - inset * 2);

        if (highlight) {
            /* Extra brightness for active piece */
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
        }
    }

    /* Draw next piece preview in sidebar canvas */
    _drawNextPiece(board) {
        const ctx = this.nextCtx;
        const cs = this.cellSize;

        ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

        const key = board.nextPieceKey;
        const shape = PIECES[key].shape;
        const color = CONFIG.visuals.blockColors[key];

        /* Center the piece in a 4×4 area */
        const rows = shape.length;
        const cols = shape[0].length;
        const offsetX = ((4 - cols) / 2) * cs;
        const offsetY = ((4 - rows) / 2) * cs;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!shape[r][c]) continue;
                this._drawBlock(ctx, offsetX + c * cs, offsetY + r * cs, cs, color);
            }
        }
    }

    /* Trigger hard drop flash animation */
    triggerHardDropFlash() {
        if (!CONFIG.animations.hardDropFlash) return;
        this.hardDropFlashAlpha = 0.3;
        this.hardDropFlashTimer = performance.now();
    }

    /* Update flash animation (call each frame) */
    updateFlash() {
        if (this.hardDropFlashAlpha <= 0) return;
        const elapsed = performance.now() - this.hardDropFlashTimer;
        this.hardDropFlashAlpha = Math.max(0, 0.3 - (elapsed / 150) * 0.3);
    }
}

/* ================================================================
   GAME CLASS
   Orchestrates the game loop, input handling, state transitions,
   scoring, and rendering.
   ================================================================ */
class Game {
    constructor() {
        this.board = new Board();
        this.audio = new AudioManager();
        this.input = new InputHandler();
        this.renderer = new Renderer(
            document.getElementById('game-canvas'),
            document.getElementById('next-canvas')
        );


        this.state = 'menu'; // 'menu', 'playing', 'paused', 'gameover'
        this._pausedByBlur = false;
        window.addEventListener('blur', () => this._onBlur());
        window.addEventListener('focus', () => this._onFocus());
        this.selectedStartLevel = 0;
        this.sessionHighScore = 0;
        this.lastTime = 0;
        this.dropAccumulator = 0;

        /* Bind UI callbacks */
        this.input.callbacks.onAction = (action) => this._onAction(action);
        this.input.callbacks.onRepeat = (action) => this._onRepeat(action);

        /* Setup UI elements */
        this._setupStartScreen();
        this._setupBgmSelector();
        this._bindButtons();

        /* UI references */
        this.uiScore = document.getElementById('score');
        this.uiLevel = document.getElementById('level');
        this.uiLines = document.getElementById('lines');
        this.uiHighScore = document.getElementById('high-score');
        this.uiLinesBox = document.getElementById('lines-box');

        /* Start the game loop */
        requestAnimationFrame((t) => this._gameLoop(t));
    }

    /* ===========================================================
       UI SETUP
       =========================================================== */

    _setupStartScreen() {
        const container = document.getElementById('level-buttons');
        container.innerHTML = '';
        for (let i = 0; i <= 9; i++) {
            const btn = document.createElement('button');
            btn.className = 'level-btn' + (i === 0 ? ' selected' : '');
            btn.textContent = i;
            btn.dataset.level = i;
            btn.addEventListener('click', () => {
                container.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedStartLevel = i;
            });
            container.appendChild(btn);
        }
    }

    _setupBgmSelector() {
        const select = document.getElementById('bgm-select');
        select.innerHTML = '';
        for (const track of CONFIG.audio.bgm) {
            const opt = document.createElement('option');
            opt.value = track.id;
            opt.textContent = track.label;
            select.appendChild(opt);
        }
        select.selectedIndex = 1;
        select.addEventListener('change', () => {
            this.audio.setBgm(select.value);
            if (this.state === 'playing') this.audio.playBgm();
        });
    }

    _bindButtons() {
        document.getElementById('btn-start').addEventListener('click', () => this.startGame());
        document.getElementById('btn-restart').addEventListener('click', () => this.startGame());
        document.getElementById('btn-menu').addEventListener('click', () => this._showScreen('start-screen'));
    }

    /* ===========================================================
       SCREEN MANAGEMENT
       =========================================================== */

    _showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    /* ===========================================================
       GAME START / RESTART
       =========================================================== */

    startGame() {
        this.board.reset(this.selectedStartLevel);
        this.board.spawnPiece();
        this.state = 'playing';
        this.dropAccumulator = 0;
        this.input.reset();

        this._showScreen('game-screen');
        document.getElementById('pause-overlay').classList.add('hidden');

        /* Update UI */
        this._updateStats();

        /* Start BGM if selected */
        const bgmId = document.getElementById('bgm-select').value;
        this.audio.setBgm(bgmId);
        if (bgmId !== 'none') this.audio.playBgm();

        /* Show/hide lines based on config */
        if (this.uiLinesBox) {
            this.uiLinesBox.style.display = CONFIG.ui.showLinesCleared ? '' : 'none';
        }
    }

    /* ===========================================================
       GAME LOOP
       =========================================================== */

    _gameLoop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (this.state === 'playing') {
            this._update(dt);
        }

        /* Always render when game screen is visible */
        if (this.state === 'playing' || this.state === 'paused') {
            this.renderer.updateFlash();
            this.renderer.draw(this.board, this.state === 'paused');
        }

        requestAnimationFrame((t) => this._gameLoop(t));
    }

    // -- Update Loop --

    /* Called each frame during gameplay. Handles gravity, lock delay,
       line-clear animation, and game-over detection. */
    _update(dt) {
        // During line-clear animation, skip all game logic
        if (this.board.isLineClearing) {
            this.board.checkLineClearPause(dt);
            return;
        }

        // Gravity: accumulate time and drop piece when threshold reached
        const dropInterval = this.board.getDropInterval();
        this.dropAccumulator += dt;

        // Soft drop: holding down speeds up gravity
        const softDropActive = this.input.actions.down.pressed;
        let effectiveDropInterval = dropInterval;
        if (softDropActive) {
            effectiveDropInterval = Math.min(50, dropInterval * 0.2);
        }

        if (this.dropAccumulator >= effectiveDropInterval) {
            this.dropAccumulator -= effectiveDropInterval;
            if (this.board.activePiece && !this.board.isLocked && !this.board.gameOver) {
                this.board.move(0, 1);
                if (softDropActive) {
                    this.board.score += CONFIG.scoring.softDrop;
                    this._updateStats();
                }
            }
        }

        // Lock delay
        this.board.updateLockDelay(dt);

        // Line-clear flash: clear the flash rows after the animation duration
        if (this.board.lineFlashRows.length > 0) {
            const elapsed = performance.now() - this.board.lineFlashTimer;
            if (elapsed > CONFIG.animations.lineClearPause) {
                this.board.lineFlashRows = [];
            }
        }

        // Update stats display
        this._updateStats();

        // Game over check
        if (this.board.gameOver) {
            this._triggerGameOver();
        }
    }

    // -- Input Callbacks --

    /* Handle single-action input (first press of a key) */
    _onAction(action) {
        // Any game-control key unpauses the game
        if (this.state === 'paused') {
            if (Object.keys(CONFIG.controls.keys).includes(action)) {
                this._togglePause();
                return;
            }
        }
        if (this.state !== 'playing') return;

        switch (action) {
            case 'left':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(-1, 0);
                break;
            case 'right':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(1, 0);
                break;
            case 'down':
                // Soft drop handled in _update via gravity speed
                break;
            case 'hardDrop':
                if (this.board.activePiece && !this.board.isLocked) {
                    const dropDist = this.board.hardDrop();
                    this.board.score += dropDist * CONFIG.scoring.softDrop;
                    this.renderer.triggerHardDropFlash();
                    this.audio.play('harddrop');
                    this._updateStats();
                }
                break;
            case 'rotateCW':
                if (this.board.rotateCW()) this.audio.play('rotate');
                break;
            case 'rotateCCW':
                if (this.board.rotateCCW()) this.audio.play('rotate');
                break;
            case 'pause':
                this._togglePause();
                break;
        }
    }

    /* Handle repeated input from DAS/ARR (held keys) */
    _onRepeat(action) {
        if (this.state !== 'playing') return;

        switch (action) {
            case 'left':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(-1, 0);
                break;
            case 'right':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(1, 0);
                break;
            case 'down':
                // Soft drop handled by gravity speed, no repeat needed
                break;
        }
    }

    /* ===========================================================
       PAUSE
       =========================================================== */

    _togglePause() {
        this.audio.play('pause');
        if (this.state === 'playing') {
            this.state = 'paused';
            document.getElementById('pause-overlay').classList.remove('hidden');
            this.audio.pauseBgm();
            this.input.reset();
        } else if (this.state === 'paused') {
            this.state = 'playing';
            document.getElementById('pause-overlay').classList.add('hidden');
            this.audio.playBgm();
            this.dropAccumulator = 0; // reset to avoid huge jump
            this.lastTime = performance.now(); // reset timestamp to prevent massive dt on first frame

        }
    }

    /* ===========================================================
       GAME OVER
       =========================================================== */

    _triggerGameOver() {
        this.state = 'gameover';
        this.audio.stopBgm();
        this.audio.play('gameover');
        this.input.reset();

        /* Update session high score */
        const newHigh = this.board.score > this.sessionHighScore;
        if (newHigh) {
            this.sessionHighScore = this.board.score;
        }

        /* Populate game over screen */
        document.getElementById('final-score').textContent = this._formatScore(this.board.score);
        document.getElementById('final-level').textContent = this.board.level;
        document.getElementById('final-lines').textContent = this.board.lines;
        document.getElementById('new-high-score').classList.toggle('hidden', !newHigh);

        this._updateStats();
        this._showScreen('gameover-screen');
    }

    _onBlur() {
        if (this.state === 'playing') {
            this._pausedByBlur = true;
            this._togglePause();
            this.input.reset(); // ⚠️ Clears any held/queued keys to prevent "stuck" movement
        }
    }

    _onFocus() {
        if (this._pausedByBlur && this.state === 'paused') {
            this._pausedByBlur = false;
            this.input.reset(); // ⚠️ Clears buffered events that may have queued while unfocused
            // Auto-resume removed: require explicit input to unpause
        }
    }

    /* ===========================================================
       UTILITY
       =========================================================== */

    _formatScore(n) {
        return n.toLocaleString();
    }

    _updateStats() {
        this.uiScore.textContent = this._formatScore(this.board.score);
        this.uiLevel.textContent = this.board.level;
        this.uiLines.textContent = this.board.lines;
        this.uiHighScore.textContent = this._formatScore(this.sessionHighScore);
    }
}

/* ================================================================
   INITIALIZATION
   Start the game when the DOM is ready.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
