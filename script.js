
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
        dropIntervalDecay: 0.95, // multiplier per level
        minDropInterval: 50       // fastest possible gravity tick
    },
    controls: {
        keys: {
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD'],
            down: ['ArrowDown', 'KeyS'],
            hardDrop: ['ArrowUp', 'KeyW'],
            rotateCW: 'Space',
            rotateCCW: ['AltLeft', 'AltRight'],
            pause: 'Escape'
        },
        das: 170,                     // Delayed Auto Shift (ms)
        arr: 50,                     // Auto Repeat Rate (ms)
        lockDelay: 500,              // Lock delay (ms)
        lockDelayResetOnInput: false,  // Reset lock timer on input while grounded
        gameOverThreshold: 2          // Rows above board that trigger Game Over
    },
    visuals: {
        showGhostPiece: true,
        ghostPieceOpacity: 0.3,
        gridOpacity: 0.1,
        blockColors: {
            I: '#00f0f0',
            O: '#f0f000',
            T: '#a000f0',
            S: '#00f000',
            Z: '#f00000',
            J: '#0000f0',
            L: '#f0a000'
        }
    },
    animations: {
        lineClearDuration: 300, // ms
        hardDropFlash: true
    },
    audio: {
        sfx: {
            drop: './sounds/drop.wav',
            rotate: './sounds/rotate.wav',
            clear: './sounds/clear.wav',
            gameover: './sounds/gameover.wav'
        },
        bgm: [
            { id: 'none', label: 'No Music', src: null },
            { id: 'a', label: 'Song A', src: './music/GUILE.mp3' },
            { id: 'b', label: 'Song B', src: './music/track_b.mp3' }
        ],
        volume: { sfx: 0.8, bgm: 0.6 }
    },
    ui: {
        pauseKey: 'Escape',
        showLinesCleared: true,
        spawnOffset: { x: 4, y: -1 }
    },
    dev: {
        debugMode: false,
        persistentHighScore: false,
        targetFPS: 60,
        randomizer: '7bag' // '7bag' or 'pureRandom'
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
        this.sfxSounds = {};
        this.bgmAudio = null;
        this.currentBgmId = 'none';
        this.sfxVolume = CONFIG.audio.volume.sfx;
        this.bgmVolume = CONFIG.audio.volume.bgm;
        this.paused = false;
        this._loadSFX();
    }

    /* Preload all SFX from CONFIG */
    _loadSFX() {
        for (const [key, path] of Object.entries(CONFIG.audio.sfx)) {
            const audio = new Audio();
            audio.src = path;
            audio.preload = 'auto';
            audio.volume = this.sfxVolume;
            this.sfxSounds[key] = audio;
        }
    }

    /* Play an SFX by key. Creates a fresh clone each time so effects
       can overlap (e.g. rapid drops). */
    play(key) {
        const template = this.sfxSounds[key];
        if (!template) return;
        try {
            const clone = template.cloneNode();
            clone.volume = this.sfxVolume;
            clone.play().catch(() => { }); // ignore autoplay-blocked errors
        } catch (e) {
            // fallback: try playing the original
            try {
                template.currentTime = 0;
                template.play().catch(() => { });
            } catch (e2) { }
        }
    }

    /* Set BGM track by id from CONFIG.audio.bgm */
    setBgm(id) {
        const track = CONFIG.audio.bgm.find(t => t.id === id);
        if (!track) return;
        this.currentBgmId = id;

        /* Stop current BGM */
        this.stopBgm();

        if (!track.src) return; // 'none'

        try {
            this.bgmAudio = new Audio(track.src);
            this.bgmAudio.loop = true;
            this.bgmAudio.volume = this.bgmVolume;
            this.bgmAudio.play().catch(() => { });
        } catch (e) {
            this.bgmAudio = null;
        }
    }

    playBgm() {
        if (!this.bgmAudio) {
            this.setBgm(this.currentBgmId);
            return;
        }
        if (this.bgmAudio.paused) {
            this.bgmAudio.play().catch(() => { });
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
   ================================================================ */
class Randomizer {
    constructor(mode) {
        this.mode = mode;
        this.bag = [];
    }

    /* Returns the next tetromino key string */
    next() {
        if (this.mode === '7bag') {
            if (this.bag.length === 0) {
                this._refillBag();
            }
            return this.bag.pop();
        } else {
            /* Pure random: equal chance each time */
            return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
        }
    }

    /* Peek at the upcoming piece (for preview) */
    peek() {
        if (this.mode === '7bag') {
            if (this.bag.length === 0) this._refillBag();
            return this.bag[this.bag.length - 1];
        } else {
            return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
        }
    }

    _refillBag() {
        this.bag = [...PIECE_KEYS];
        /* Fisher-Yates shuffle */
        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
    }
}

/* ================================================================
   INPUT HANDLER
   Manages keyboard input with DAS/ARR, key dedup, and pause detection.
   ================================================================ */
class InputHandler {
    constructor() {
        this.actions = {
            left: { pressed: false, dasTimer: null, arrTimer: null },
            right: { pressed: false, dasTimer: null, arrTimer: null },
            down: { pressed: false, dasTimer: null, arrTimer: null },
            hardDrop: { pressed: false, dasTimer: null, arrTimer: null },
            rotateCW: { pressed: false },
            rotateCCW: { pressed: false },
            pause: { pressed: false }
        };

        /* Map every configured key code to its action(s) */
        this.keyMap = new Map();
        this._buildKeyMap();

        this.callbacks = {
            onAction: null,   // (action) => void, for instant actions
            onRepeat: null,   // (action) => void, for DAS/ARR repeat
            onPause: null     // () => void
        };

        window.addEventListener('keydown', (e) => this._onKeyDown(e));
        window.addEventListener('keyup', (e) => this._onKeyUp(e));
    }

    /* Build a reverse lookup: keyCode -> list of actions */
    _buildKeyMap() {
        const keys = CONFIG.controls.keys;
        for (const [action, keyCodes] of Object.entries(keys)) {
            const codes = Array.isArray(keyCodes) ? keyCodes : [keyCodes];
            for (const code of codes) {
                if (!this.keyMap.has(code)) this.keyMap.set(code, []);
                this.keyMap.get(code).push(action);
            }
        }
    }

    _onKeyDown(e) {
        const code = e.code;
        const actions = this.keyMap.get(code);
        if (!actions) return;

        /* Prevent default browser behavior for game keys */
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'AltLeft', 'AltRight'].includes(code)) {
            e.preventDefault();
        }

        for (const action of actions) {
            this._handlePress(action);
        }
    }

    _onKeyUp(e) {
        const code = e.code;
        const actions = this.keyMap.get(code);
        if (!actions) return;

        for (const action of actions) {
            this._handleRelease(action);
        }
    }

    _handlePress(action) {
        const act = this.actions[action];
        if (!act || act.pressed) return;

        act.pressed = true;

        /* Instant move on first press */
        if (this.callbacks.onAction) this.callbacks.onAction(action);

        /* DAS/ARR only for horizontal movement */
        if (['left', 'right'].includes(action)) {
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

    reset() {
        for (const act of Object.values(this.actions)) {
            /* Guard against non-object values */
            if (act && typeof act === 'object') {
                act.pressed = false;
                if (act.dasTimer !== undefined) { clearTimeout(act.dasTimer); act.dasTimer = null; }
                if (act.arrTimer !== undefined) { clearInterval(act.arrTimer); act.arrTimer = null; }
            }
        }
    }
}

/* ================================================================
   BOARD / STATE MANAGER
   Manages the grid, pieces, scoring, leveling, and line clears.
   ================================================================ */
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
        this.activeRotation = 0; // 0, 1, 2, 3 (quarters turned CW)
        this.lockTimer = null;
        this.lockElapsed = 0;
        this.isLocked = false;
        this.lineFlashRows = []; // rows currently animating flash
        this.lineFlashTimer = 0;
        this.gameOver = false;
        this.randomizer = new Randomizer(CONFIG.dev.randomizer);
        this.nextPieceKey = this.randomizer.next();
    }

    /* Create empty grid: 2D array of null (empty) or piece key string */
    _createGrid() {
        return Array.from({ length: this.height }, () =>
            Array(this.width).fill(null)
        );
    }

    /* Reset board state for new game */
    reset(startLevel) {
        this.grid = this._createGrid();
        this.score = 0;
        this.lines = 0;
        this.level = startLevel;
        this.activePiece = null;
        this.activeX = 0;
        this.activeY = 0;
        this.activeRotation = 0;
        this.lockTimer = null;
        this.lockElapsed = 0;
        this.isLocked = false;
        this.lineFlashRows = [];
        this.lineFlashTimer = 0;
        this.gameOver = false;
        this.randomizer = new Randomizer(CONFIG.dev.randomizer);
        this.nextPieceKey = this.randomizer.next();
    }

    /* Spawn a new active piece from the queue */
    spawnPiece() {
        const key = this.nextPieceKey;
        this.nextPieceKey = this.randomizer.next();

        const shape = this._getRotatedShape(key, 0);
        const offsetX = CONFIG.ui.spawnOffset.x;
        const offsetY = CONFIG.ui.spawnOffset.y; // Uses the negative buffer from config

        this.activePiece = key;
        this.activeRotation = 0;
        this.activeX = offsetX - Math.floor(shape[0].length / 2);
        this.activeY = offsetY;
        this.isLocked = false;
        this.lockElapsed = 0;
        if (this.lockTimer) { clearTimeout(this.lockTimer); this.lockTimer = null; }

        /* Check for immediate collision (game over) */
        if (this._collides(this.activeX, this.activeY, shape)) {
            this.gameOver = true;
            this.activePiece = null; // Halt gravity/state updates
        }
    }

    /* Get the shape matrix for a given piece type and rotation quarter */
    _getRotatedShape(key, rotation) {
        let shape = PIECES[key].shape.map(row => [...row]);
        for (let i = 0; i < rotation; i++) {
            shape = this._rotateMatrixCW(shape);
        }
        return shape;
    }

    /* Rotate a square matrix 90° clockwise */
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

    /* Rotate a square matrix 90° counter-clockwise */
    _rotateMatrixCCW(matrix) {
        const n = matrix.length;
        const result = Array.from({ length: n }, () => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                result[n - 1 - c][r] = matrix[r][c];
            }
        }
        return result;
    }

    /* Check if a shape at given position collides with walls or placed blocks */
    _collides(x, y, shape) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const boardX = x + c;
                const boardY = y + r;
                /* Out of bounds horizontally */
                if (boardX < 0 || boardX >= this.width) return true;
                /* Below the board */
                if (boardY >= this.height) return true;
                /* Above the visible board (handled by spawn) */
                if (boardY < 0) continue;
                /* Occupied cell */
                if (this.grid[boardY][boardX] !== null) return true;
            }
        }
        return false;
    }

    /* Attempt to move the active piece. Returns true if successful. */
    move(dx, dy) {
        if (!this.activePiece || this.isLocked) return false;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        if (!this._collides(this.activeX + dx, this.activeY + dy, shape)) {
            this.activeX += dx;
            this.activeY += dy;

            /* Reset lock delay on input if configured */
            if (this._isGrounded() && CONFIG.controls.lockDelayResetOnInput) {
                this._resetLockTimer();
            }
            return true;
        }
        return false;
    }

    /* Attempt to rotate CW. Uses basic wall kicks. */
    rotateCW() {
        if (!this.activePiece || this.isLocked) return false;
        const newRot = (this.activeRotation + 1) % 4;
        const shape = this._getRotatedShape(this.activePiece, newRot);

        /* Try base position */
        if (!this._collides(this.activeX, this.activeY, shape)) {
            this.activeRotation = newRot;
            if (this._isGrounded() && CONFIG.controls.lockDelayResetOnInput) {
                this._resetLockTimer();
            }
            return true;
        }

        /* Basic wall kicks: try shifting left, right, up */
        const kicks = [
            [-1, 0], [1, 0], [0, -1],
            [-2, 0], [2, 0], [0, -2],
            [-1, -1], [1, -1]
        ];
        for (const [kx, ky] of kicks) {
            if (!this._collides(this.activeX + kx, this.activeY + ky, shape)) {
                this.activeX += kx;
                this.activeY += ky;
                this.activeRotation = newRot;
                if (this._isGrounded() && CONFIG.controls.lockDelayResetOnInput) {
                    this._resetLockTimer();
                }
                return true;
            }
        }
        return false;
    }

    /* Attempt to rotate CCW */
    rotateCCW() {
        if (!this.activePiece || this.isLocked) return false;
        const newRot = (this.activeRotation + 3) % 4;
        const shape = this._getRotatedShape(this.activePiece, newRot);

        if (!this._collides(this.activeX, this.activeY, shape)) {
            this.activeRotation = newRot;
            if (this._isGrounded() && CONFIG.controls.lockDelayResetOnInput) {
                this._resetLockTimer();
            }
            return true;
        }

        const kicks = [
            [-1, 0], [1, 0], [0, -1],
            [-2, 0], [2, 0], [0, -2],
            [-1, -1], [1, -1]
        ];
        for (const [kx, ky] of kicks) {
            if (!this._collides(this.activeX + kx, this.activeY + ky, shape)) {
                this.activeX += kx;
                this.activeY += ky;
                this.activeRotation = newRot;
                if (this._isGrounded() && CONFIG.controls.lockDelayResetOnInput) {
                    this._resetLockTimer();
                }
                return true;
            }
        }
        return false;
    }

    /* Check if the active piece is resting on something */
    _isGrounded() {
        if (!this.activePiece) return false;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        return this._collides(this.activeX, this.activeY + 1, shape);
    }

    /* Hard drop: move piece to the lowest valid position and lock */
    hardDrop() {
        if (!this.activePiece || this.isLocked) return 0;
        let dropDistance = 0;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        while (!this._collides(this.activeX, this.activeY + 1, shape)) {
            this.activeY++;
            dropDistance++;
        }
        this._lockPiece();
        return dropDistance;
    }

    /* Lock the active piece into the grid */
    _lockPiece() {
        if (!this.activePiece || this.isLocked) return;
        this.isLocked = true;
        if (this.lockTimer) { clearTimeout(this.lockTimer); this.lockTimer = null; }

        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const boardX = this.activeX + c;
                const boardY = this.activeY + r;
                if (boardY >= 0 && boardY < this.height && boardX >= 0 && boardX < this.width) {
                    this.grid[boardY][boardX] = this.activePiece;
                }
            }
        }

        this.activePiece = null;
        this._checkLines();
    }

    /* Check for completed lines and score them */
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

        /* Start line flash animation */
        this.lineFlashRows = fullRows;
        this.lineFlashTimer = performance.now();

        /* Calculate score using Gameboy formula: multiplier = level + 1 */
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

        /* Level progression: level = max(startLevel, floor(lines / 10)), capped at maxLevel */
        const newLevel = Math.min(
            CONFIG.levels.maxLevel,
            Math.floor(this.lines / CONFIG.levels.linesPerLevel)
        );
        this.level = Math.max(this.level, newLevel);

        /* ✅ SAFELY REMOVE ALL FULL ROWS AT ONCE */
        /* Using a Set for O(1) lookups, then filtering out matched indices */
        const removeSet = new Set(fullRows);
        this.grid = this.grid.filter((_, index) => !removeSet.has(index));
        for (let i = 0; i < fullRows.length; i++) {
            this.grid.unshift(Array(this.width).fill(null));
        }

        this.lineFlashRows = [];
        this.spawnPiece();
    }

    /* Get the Y position where the piece would land (for ghost piece) */
    getGhostY() {
        if (!this.activePiece) return this.activeY;
        const shape = this._getRotatedShape(this.activePiece, this.activeRotation);
        let ghostY = this.activeY;
        while (!this._collides(this.activeX, ghostY + 1, shape)) {
            ghostY++;
        }
        return ghostY;
    }

    /* Get the current drop interval in ms based on level */
    getDropInterval() {
        const interval = CONFIG.speed.baseDropInterval * Math.pow(CONFIG.speed.dropIntervalDecay, this.level);
        return Math.max(interval, CONFIG.speed.minDropInterval);
    }

    /* Called each frame to update lock delay timer */
    updateLockDelay(dt) {
        if (!this.activePiece || this.isLocked) return;

        if (this._isGrounded()) {
            // Accumulate time while piece is resting on blocks/ground
            this.lockElapsed += dt;
            // Lock when threshold is reached
            if (this.lockElapsed >= CONFIG.controls.lockDelay) {
                this._lockPiece();
            }
        } else {
            // Piece is mid-air: reset timer immediately
            this.lockElapsed = 0;
        }
    }

    /* Reset the lock timer (called on input while grounded) */
    _resetLockTimer() {
        // Only reset if the piece is actually touching something
        if (this._isGrounded()) {
            this.lockElapsed = 0;
        }
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
        this._drawGridBlocks(ctx, board, cs);

        if (board.lineFlashRows.length > 0) {
            const elapsed = performance.now() - board.lineFlashTimer;
            const duration = CONFIG.animations.lineClearDuration;
            const alpha = 0.5 + 0.5 * Math.sin((elapsed / duration) * Math.PI);
            for (const row of board.lineFlashRows) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fillRect(0, row * cs, w * cs, cs);
            }
        }

        /* HIDE ACTIVE PIECE, GHOST, & NEXT PREVIEW WHEN PAUSED */
        if (isPaused) {
            this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        } else {
            if (CONFIG.visuals.showGhostPiece && board.activePiece && !board.isLocked) {
                this._drawGhostPiece(ctx, board, cs);
            }
            if (board.activePiece && !board.isLocked) {
                this._drawActivePiece(ctx, board, cs);
            }
            this._drawNextPiece(board);
        }

        if (this.hardDropFlashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.hardDropFlashAlpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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

    /* ===========================================================
       UPDATE LOGIC (called each frame during gameplay)
       =========================================================== */

    _update(dt) {
        /* Gravity: accumulate time and drop piece when threshold reached */
        const dropInterval = this.board.getDropInterval();
        this.dropAccumulator += dt;

        /* Handle soft drop: holding down speeds up gravity */
        const softDropActive = this.input.actions.down.pressed;
        let effectiveDropInterval = dropInterval;
        if (softDropActive) {
            effectiveDropInterval = Math.min(50, dropInterval * 0.2); // faster gravity on soft drop
        }

        if (this.dropAccumulator >= effectiveDropInterval) {
            this.dropAccumulator -= effectiveDropInterval;
            if (this.board.activePiece && !this.board.isLocked && !this.board.gameOver) {
                this.board.move(0, 1);
                /* Soft drop scoring: 1 point per cell */
                if (softDropActive) {
                    this.board.score += CONFIG.scoring.softDrop;
                    this._updateStats();
                }
            }
        }

        /* Update lock delay */
        this.board.updateLockDelay(dt);

        /* Check for line clear animation time */
        if (this.board.lineFlashRows.length > 0) {
            const elapsed = performance.now() - this.board.lineFlashTimer;
            if (elapsed > CONFIG.animations.lineClearDuration) {
                this.board.lineFlashRows = [];
            }
        }

        /* Update stats display */
        this._updateStats();

        /* Check game over */
        if (this.board.gameOver) {
            this._triggerGameOver();
        }
    }

    /* ===========================================================
       INPUT CALLBACKS
       =========================================================== */

    _onAction(action) {
        if (this.state !== 'playing') {
            /* Allow pause toggle from any state except gameover */
            if (action === 'pause' && this.state === 'paused') {
                this._togglePause();
            }
            return;
        }

        switch (action) {
            case 'left':
                if (this.board.activePiece && !this.board.isLocked) {
                    this.board.move(-1, 0);
                }
                break;
            case 'right':
                if (this.board.activePiece && !this.board.isLocked) {
                    this.board.move(1, 0);
                }
                break;
            case 'down':
                /* Soft drop handled in _update via gravity speed */
                break;
            case 'hardDrop':
                if (this.board.activePiece && !this.board.isLocked) {
                    const dropDist = this.board.hardDrop();
                    this.board.score += dropDist * CONFIG.scoring.softDrop;
                    this.renderer.triggerHardDropFlash();
                    this.audio.play('drop');
                    this._updateStats();
                }
                break;
            case 'rotateCW':
                if (this.board.rotateCW()) {
                    this.audio.play('rotate');
                }
                break;
            case 'rotateCCW':
                if (this.board.rotateCCW()) {
                    this.audio.play('rotate');
                }
                break;
            case 'pause':
                this._togglePause();
                break;
        }
    }

    _onRepeat(action) {
        /* DAS/ARR repeat for held directional keys */
        if (this.state !== 'playing') return;

        switch (action) {
            case 'left':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(-1, 0);
                break;
            case 'right':
                if (this.board.activePiece && !this.board.isLocked) this.board.move(1, 0);
                break;
            case 'down':
                /* Soft drop handled by gravity speed, no repeat needed */
                break;
        }
    }

    /* ===========================================================
       PAUSE
       =========================================================== */

    _togglePause() {
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
            this._togglePause();
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