const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('gameOver');
const restartBtn = document.getElementById('restartBtn');

// --- Game Constants ---
const PLAYER_WIDTH = 50; 
const PLAYER_HEIGHT = 50; 
const PLAYER_COLOR = '#00ffff';
const PLAYER_JUMP_FORCE = 19.0; 
const UFO_JUMP_FORCE = 15.0; 
const GRAVITY = 1.2; 
const ROTATION_SPEED = 0.1; 

const OBSTACLE_WIDTH = 40; 
const OBSTACLE_HEIGHT = 60; 
const OBSTACLE_COLOR = '#ff00ff';
const OBSTACLE_SPEED = 8; 

const PLATFORM_HEIGHT = 30; 
const PLATFORM_WIDTH_MIN = 150;
const PLATFORM_WIDTH_MAX = 400;
const PLATFORM_COLOR = '#8A2BE2';

let groundHeight = 100; 

// --- Game State ---
let player;
let gameObjects; 
let score;
let frameCount;
let isGameOver;
let nextSpawnFrame;
let bgOffset = 0; 
let consecutivePlatforms = 0; 
let bgHue = 0; 
let lastPlatformY = 0;
let particles = [];
let bgParticles = [];

// --- Sound Manager ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.isPlayingMusic = false;
        this.nextNoteTime = 0;
        this.tempo = 120;
        this.noteIndex = 0;
        this.bassLine = [110, 110, 220, 110, 165, 110, 220, 165]; 
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    startMusic() {
        this.resume();
        if (this.isPlayingMusic) return;
        this.isPlayingMusic = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduleMusic();
    }

    stopMusic() {
        this.isPlayingMusic = false;
    }

    scheduleMusic() {
        if (!this.isPlayingMusic) return;
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playNote(this.nextNoteTime);
            const secondsPerBeat = 60.0 / this.tempo;
            this.nextNoteTime += secondsPerBeat / 2; 
            this.noteIndex = (this.noteIndex + 1) % this.bassLine.length;
        }
        setTimeout(() => this.scheduleMusic(), 25);
    }

    playNote(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = this.bassLine[this.noteIndex];
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
    }

    playJump() {
        this.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playDeath() {
        this.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
    
    playPortal() {
        this.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }
}

const soundManager = new SoundManager();

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 8 + 4; 
        this.speedX = Math.random() * -5 - 2; 
        this.speedY = Math.random() * 4 - 2;
        this.life = 1.0;
        this.decay = 0.05;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size *= 0.95;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

class BgParticle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * (canvas.height - groundHeight); 
        this.size = Math.random() * 3;
        this.speedX = Math.random() * -0.5 - 0.1;
    }
    update() {
        this.x += this.speedX;
        if (this.x < 0) {
            this.x = canvas.width;
            this.y = Math.random() * (canvas.height - groundHeight);
        }
    }
    draw() {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.3;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

// --- Input State ---
let jumpPressed = false;
let isHoldingJump = false; 
let jumpBufferCounter = 0; 
const JUMP_BUFFER_TIME = 15; 
const COYOTE_TIME = 15; 

let gameMode = 'cube'; 

// --- Player Class ---
class Player {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityY = 0;
        this.onGround = false;
        this.angle = 0;
        this.coyoteCounter = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        
        if (gameMode === 'ufo') {
            // --- DRAW UFO ---
            ctx.rotate(this.angle);
            
            // Dome
            ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(0, -10, 25, Math.PI, 0); 
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Body
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.ellipse(0, 5, 40, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Lights
            ctx.fillStyle = '#ff0000';
            for(let i=-2; i<=2; i++) {
                ctx.beginPath();
                ctx.arc(i * 15, 5, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.save();
            ctx.translate(0, -15);
            ctx.scale(0.4, 0.4);
            this.drawCube();
            ctx.restore();

        } else if (gameMode === 'ship') {
            // --- DRAW JET ---
            ctx.rotate(this.angle);
            
            if (isHoldingJump) {
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath();
                ctx.moveTo(-40, 5);
                ctx.lineTo(-60, 0);
                ctx.lineTo(-40, -5);
                ctx.fill();
            }

            ctx.fillStyle = '#555'; 
            ctx.beginPath();
            ctx.moveTo(-40, 10);
            ctx.lineTo(20, 10);
            ctx.lineTo(60, 0); 
            ctx.lineTo(20, -10);
            ctx.lineTo(-40, -10);
            ctx.lineTo(-30, 0); 
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#777';
            ctx.beginPath();
            ctx.moveTo(-20, 5);
            ctx.lineTo(-40, 30); 
            ctx.lineTo(10, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(-35, -10);
            ctx.lineTo(-45, -35); 
            ctx.lineTo(-15, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; 
            ctx.beginPath();
            ctx.ellipse(0, -12, 20, 12, 0, Math.PI, 0); 
            ctx.fill();
            ctx.stroke();
            
            ctx.save();
            ctx.translate(0, -12); 
            ctx.scale(0.3, 0.3); 
            this.drawCube();
            ctx.restore();
            
        } else if (gameMode === 'wave') {
            // --- DRAW WAVE (Dart) ---
            ctx.rotate(this.angle);
            
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(-20, -15);
            ctx.lineTo(20, 0);
            ctx.lineTo(-20, 15);
            ctx.closePath();
            ctx.fill();
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            
            // Inner detail
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.moveTo(-10, -5);
            ctx.lineTo(0, 0);
            ctx.lineTo(-10, 5);
            ctx.closePath();
            ctx.fill();

        } else {
            // --- DRAW CUBE ---
            ctx.rotate(this.angle);
            this.drawCube();
        }

        ctx.restore();
    }

    drawCube() {
        ctx.shadowBlur = 30; 
        ctx.shadowColor = this.color;

        const grad = ctx.createLinearGradient(-this.width/2, -this.height/2, this.width/2, this.height/2);
        grad.addColorStop(0, '#00ffff'); 
        grad.addColorStop(1, '#008888'); 
        ctx.fillStyle = grad;
        
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.strokeRect(-this.width / 2 + 3, -this.height / 2 + 3, this.width - 6, this.height - 6);
        
        ctx.fillStyle = '#000';
        ctx.fillRect(-10, -8, 8, 8); 
        ctx.fillRect(2, -8, 8, 8); 
        
        if (!this.onGround && gameMode === 'cube') {
            ctx.beginPath();
            ctx.arc(0, 6, 8, 0, Math.PI, false); 
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(0, 14, 8, Math.PI, 0, false); 
            ctx.fill();
        }
    }

    update() {
        const floorY = canvas.height - groundHeight;

        if (gameMode === 'cube') {
            // --- CUBE PHYSICS ---
            this.velocityY += GRAVITY;
            
            if (this.onGround) {
                this.coyoteCounter = COYOTE_TIME;
            } else {
                this.coyoteCounter--;
            }

            // Perform Jump BEFORE position update to prevent ground snap
            if (jumpBufferCounter > 0 && (this.onGround || this.coyoteCounter > 0)) {
                this.performJump();
                jumpBufferCounter = 0; 
                this.coyoteCounter = 0; 
            }

            this.y += this.velocityY;

            if (frameCount % 2 === 0) {
                particles.push(new Particle(this.x, this.y + this.height/2, this.color));
            }

            if (!this.onGround) {
                this.angle += ROTATION_SPEED;
            } else {
                const targetAngle = Math.round(this.angle / (Math.PI / 2)) * (Math.PI / 2);
                this.angle = targetAngle;
            }
        } else if (gameMode === 'ship') {
            // --- SHIP PHYSICS ---
            const SHIP_GRAVITY = 0.6;
            const SHIP_THRUST = 1.0;
            const MAX_SHIP_VELOCITY = 12;

            if (isHoldingJump) {
                this.velocityY -= SHIP_THRUST;
            } else {
                this.velocityY += SHIP_GRAVITY;
            }
            
            if (this.velocityY > MAX_SHIP_VELOCITY) this.velocityY = MAX_SHIP_VELOCITY;
            if (this.velocityY < -MAX_SHIP_VELOCITY) this.velocityY = -MAX_SHIP_VELOCITY;

            this.y += this.velocityY;
            this.angle = this.velocityY * 0.1;
            
            if (isHoldingJump && frameCount % 3 === 0) {
                 const p = new Particle(this.x, this.y + this.height/2, '#ffaa00');
                 p.speedX = -5;
                 particles.push(p);
            }
        } else if (gameMode === 'ufo') {
            // --- UFO PHYSICS ---
            this.velocityY += GRAVITY; 
            
            // Infinite Air Jump
            if (jumpBufferCounter > 0) {
                this.velocityY = -UFO_JUMP_FORCE; 
                jumpBufferCounter = 0;
                soundManager.playJump();
                for(let i=0; i<5; i++) {
                     const p = new Particle(this.x + this.width/2, this.y + this.height, '#fff');
                     particles.push(p);
                }
            }
            
            this.y += this.velocityY;
            
            if (this.velocityY < 0) this.angle = -0.2;
            else this.angle = 0.1;
        } else if (gameMode === 'wave') {
            // --- WAVE PHYSICS ---
            // Constant vertical speed, 45 degree angle (velocity magnitude roughly equals horizontal speed)
            const WAVE_SPEED = OBSTACLE_SPEED; 

            if (isHoldingJump) {
                this.velocityY = -WAVE_SPEED;
                this.angle = -Math.PI / 4; // -45 degrees
            } else {
                this.velocityY = WAVE_SPEED;
                this.angle = Math.PI / 4; // 45 degrees
            }

            this.y += this.velocityY;

            // Generate tail particles
            if (frameCount % 2 === 0) {
                 const p = new Particle(this.x, this.y + this.height/2, '#ffffff');
                 p.speedX = -OBSTACLE_SPEED; 
                 p.speedY = 0;
                 p.life = 1.0;
                 p.decay = 0.015;
                 particles.push(p);
            }
        }

        this.onGround = false; 

        // Ground Collision
        if (this.y + this.height > floorY) {
            this.y = floorY - this.height;
            if (gameMode === 'cube') this.velocityY = 0;
            else if (gameMode === 'wave') { /* die logic usually, but here clamp */ }
            else this.velocityY = 0; 
            this.onGround = true;
        }
        
        // Ceiling Collision
        if (this.y < 0) {
            this.y = 0;
            if (this.velocityY < 0) this.velocityY = 0;
        }
    }

    performJump() {
        this.velocityY = -PLAYER_JUMP_FORCE;
        this.onGround = false;
        soundManager.playJump();
        for(let i=0; i<8; i++) {
             const p = new Particle(this.x + this.width/2, this.y + this.height, '#fff');
             p.speedY = Math.random() * -3; 
             p.speedX = Math.random() * 4 - 2;
             particles.push(p);
        }
    }
}

// --- Portal Class ---
class Portal {
    constructor(x, y, targetMode) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 80;
        this.targetMode = targetMode; 
        this.type = 'portal';
        this.passed = false;
        this.rotation = 0;
    }
    
    draw() {
        ctx.save();
        ctx.shadowBlur = 30;
        let color = '#00ff00';
        if (this.targetMode === 'ship') color = '#ff00ff'; 
        if (this.targetMode === 'ufo') color = '#ffaa00'; 
        if (this.targetMode === 'wave') color = '#00ffff'; // Cyan for wave
        
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        
        for(let i=0; i<3; i++) {
            ctx.beginPath();
            ctx.rotate(this.rotation + (i * Math.PI / 3));
            ctx.ellipse(0, 0, this.width/2 - (i*5), this.height/2 - (i*8), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    update() {
        this.x -= OBSTACLE_SPEED;
        this.rotation += 0.1;
        
        if (Math.random() < 0.3) {
            let color = '#00ff00';
            if (this.targetMode === 'ship') color = '#ff00ff';
            if (this.targetMode === 'ufo') color = '#ffaa00';
            if (this.targetMode === 'wave') color = '#00ffff';
            
            const p = new Particle(
                this.x + this.width/2 + (Math.random() * 20 - 10), 
                this.y + this.height/2 + (Math.random() * 40 - 20), 
                color
            );
            p.speedX = Math.random() * 2 - 1;
            p.speedY = Math.random() * 2 - 1;
            p.size = 3;
            particles.push(p);
        }
    }
}

// --- Obstacle Class ---
class Obstacle {
    constructor(x, y, width, height, color, flipped = false) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.type = 'spike';
        this.passed = false;
        this.flipped = flipped;
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        
        const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
        grad.addColorStop(0, '#ff00ff');
        grad.addColorStop(1, '#880088');
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        if (this.flipped) {
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + this.width / 2, this.y + this.height);
            ctx.lineTo(this.x + this.width, this.y);
        } else {
            ctx.moveTo(this.x, this.y + this.height);
            ctx.lineTo(this.x + this.width / 2, this.y);
            ctx.lineTo(this.x + this.width, this.y + this.height);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }

    update() {
        this.x -= OBSTACLE_SPEED;
    }
}

// --- Pillar Class ---
class Pillar {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.type = 'spike'; 
        this.passed = false;
    }
    
    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        ctx.fillStyle = '#444';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        ctx.strokeStyle = '#ffff00';
        ctx.beginPath();
        for(let i=0; i<this.height; i+=20) {
            ctx.moveTo(this.x, this.y + i);
            ctx.lineTo(this.x + this.width, this.y + i + 10);
        }
        ctx.stroke();
        
        ctx.restore();
    }
    
    update() {
        this.x -= OBSTACLE_SPEED;
    }
}

// --- Platform Class ---
class Platform {
    constructor(x, y, width, height, color, moveType = 'none') {
        this.x = x;
        this.y = y;
        this.initialY = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.type = 'platform';
        this.passed = false;
        
        this.moveType = moveType; // 'none', 'vertical', 'horizontal'
        this.moveSpeed = 2;
        this.moveRange = 50;
        this.moveOffset = Math.random() * Math.PI * 2;
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let i=0; i<this.width; i+=20) {
            ctx.moveTo(this.x + i, this.y);
            ctx.lineTo(this.x + i + 15, this.y + this.height);
        }
        ctx.stroke();

        ctx.restore();
    }

    update() {
        // Base scroll speed
        this.x -= OBSTACLE_SPEED;
        
        if (this.moveType === 'vertical') {
            this.y = this.initialY + Math.sin((frameCount * 0.05) + this.moveOffset) * this.moveRange;
        } else if (this.moveType === 'horizontal') {
            // Oscillate X speed relative to OBSTACLE_SPEED
            // We modify this.x additionally
            this.x -= Math.sin((frameCount * 0.05) + this.moveOffset) * 3; 
        }
    }
}

// --- Game Functions ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    groundHeight = canvas.height / 3;
}

window.addEventListener('resize', () => {
    resizeCanvas();
    if (player && player.y > canvas.height - groundHeight) {
        player.y = canvas.height - groundHeight - 100;
        player.velocityY = 0;
    }
});

function init() {
    resizeCanvas();
    const floorY = canvas.height - groundHeight;
    player = new Player(100, floorY - PLAYER_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR); 
    gameObjects = [];
    particles = [];
    bgParticles = [];
    score = 0;
    frameCount = 0;
    isGameOver = false;
    nextSpawnFrame = 50; 
    bgOffset = 0;
    consecutivePlatforms = 0;
    bgHue = 240; 
    lastPlatformY = floorY;
    gameMode = 'cube'; 

    for(let i=0; i<50; i++) {
        bgParticles.push(new BgParticle());
    }

    scoreEl.textContent = 'Score: 0';
    gameOverEl.classList.add('hidden');
    
    soundManager.startMusic(); 
    tryPlayMusic(); 

    gameLoop();
}

let pointsSincePortal = 0;

function spawnObject() {
    const floorY = canvas.height - groundHeight;
    
    // Portal Spawning Logic
    if (score > 0 && score % 10 === 0 && pointsSincePortal !== score) {
        let target = 'cube';
        if (gameMode === 'cube') target = 'ship';
        else if (gameMode === 'ship') target = 'ufo'; 
        else if (gameMode === 'ufo') target = 'wave';
        else if (gameMode === 'wave') target = 'cube';
        
        const portalHeight = 80;
        const y = floorY - portalHeight; 
        const x = canvas.width;
        gameObjects.push(new Portal(x, y, target));
        
        // Spawn Spikes above the portal that go to the ceiling
        const pillarWidth = 30;
        const pillarHeight = y; 
        gameObjects.push(new Pillar(x + (50 - pillarWidth)/2, 0, pillarWidth, pillarHeight, '#ff0000'));
        
        pointsSincePortal = score;
        nextSpawnFrame = frameCount + 100; 
        return;
    }

    if (gameMode === 'ship' || gameMode === 'ufo' || gameMode === 'wave') {
        const rand = Math.random();
        const x = canvas.width;
        if (rand < 0.25) {
            gameObjects.push(new Obstacle(x, 0, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, OBSTACLE_COLOR, true));
        } else if (rand < 0.5) {
            gameObjects.push(new Obstacle(x, floorY - OBSTACLE_HEIGHT, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, OBSTACLE_COLOR, false));
        } else if (rand < 0.75) {
            const height = Math.random() * 150 + 50;
            if (Math.random() < 0.5) {
                gameObjects.push(new Pillar(x, 0, 40, height, '#ff0000'));
            } else {
                gameObjects.push(new Pillar(x, floorY - height, 40, height, '#ff0000'));
            }
        } else {
            const y = Math.random() * (floorY - 200) + 100;
            gameObjects.push(new Platform(x, y, 60, 60, '#ffaa00'));
        }
        nextSpawnFrame = frameCount + 30; 
        return;
    }

    // CUBE MODE
    let type = 'random';
    if (consecutivePlatforms > 0 && consecutivePlatforms < 4) {
        type = 'platform';
    } else if (consecutivePlatforms >= 4) {
        type = 'spike'; 
        consecutivePlatforms = 0;
    } else {
        const r = Math.random();
        if (r < 0.5) type = 'spike';
        else if (r < 0.8) type = 'platform';
        else type = 'pillar'; 
    }

    if (type === 'pillar') {
        const x = canvas.width;
        const height = Math.random() * 60 + 40;
        gameObjects.push(new Pillar(x, floorY - height, 30, height, '#ff0000'));
        consecutivePlatforms = 0;
    } else if (type === 'spike') {
        const rCount = Math.random();
        const count = rCount < 0.6 ? 3 : (rCount < 0.85 ? 2 : 1); 
        
        let spacing = OBSTACLE_WIDTH;
        if (count === 3 && Math.random() < 0.1) {
            spacing += 10; 
        }

        for(let i=0; i<count; i++) {
             const x = canvas.width + (i * spacing); 
             const y = floorY - OBSTACLE_HEIGHT;
             gameObjects.push(new Obstacle(x, y, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, OBSTACLE_COLOR));
        }
        consecutivePlatforms = 0; 
    } else {
        const width = Math.floor(Math.random() * (PLATFORM_WIDTH_MAX - PLATFORM_WIDTH_MIN)) + PLATFORM_WIDTH_MIN;
        let yPos;
        // Randomize Move Type
        let moveType = 'none';
        const r = Math.random();
        if (r < 0.25) moveType = 'vertical'; // 25% Vertical
        else if (r < 0.5) moveType = 'horizontal'; // 25% Horizontal
        
        if (consecutivePlatforms === 0) {
             const heightFromGround = Math.floor(Math.random() * 60) + 40; 
             yPos = floorY - heightFromGround - PLATFORM_HEIGHT;
        } else {
             const stepUp = Math.floor(Math.random() * 30) + 20; 
             yPos = lastPlatformY - stepUp;
             if (yPos < 100) { 
                 yPos = floorY - 100 - PLATFORM_HEIGHT; 
             }
        }
        lastPlatformY = yPos;
        const x = canvas.width;
        gameObjects.push(new Platform(x, yPos, width, PLATFORM_HEIGHT, PLATFORM_COLOR, moveType));
        consecutivePlatforms++;
        
        if (moveType === 'none' && Math.random() > 0.7 && width > 120) {
             const spikeX = x + width / 2;
             const spikeY = yPos - OBSTACLE_HEIGHT;
             gameObjects.push(new Obstacle(spikeX, spikeY, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, OBSTACLE_COLOR));
        }
    }

    let delay = 0;
    if (type === 'platform') {
        delay = Math.floor(Math.random() * 30) + 25; 
    } else {
        delay = Math.floor(Math.random() * 30) + 25;
    }
    nextSpawnFrame = frameCount + delay;
}

function checkCollision(player, obj) {
    const isColliding = (
        player.x < obj.x + obj.width &&
        player.x + player.width > obj.x &&
        player.y < obj.y + obj.height &&
        player.y + player.height > obj.y
    );

    if (isColliding) {
        if (obj.type === 'portal') {
            if (!obj.passed) {
                gameMode = obj.targetMode;
                soundManager.playPortal();
                player.angle = 0; 
                obj.passed = true; 
            }
            return 'none';
        }
        if (obj.type === 'spike') {
            const margin = 5;
            if (
                player.x + margin < obj.x + obj.width - margin &&
                player.x + player.width - margin > obj.x + margin &&
                player.y + margin < obj.y + obj.height - margin &&
                player.y + player.height - margin > obj.y + margin
            ) {
                 return 'death';
            }
            return 'none';
        } 
        if (obj.type === 'platform') {
            const feetPos = player.y + player.height;
            const platformBottom = obj.y + obj.height;

            if (feetPos <= platformBottom) { 
                 if (player.velocityY >= 0) {
                     return 'land';
                 } else {
                     return 'none'; 
                 }
            }
            return 'death';
        }
    }
    return 'none';
}

function updateGame() {
    frameCount++;
    bgOffset -= 2; 
    if (bgOffset <= -40) bgOffset = 0;

    bgHue = (bgHue + 0.2) % 360; 
    
    if (jumpBufferCounter > 0) {
        jumpBufferCounter--;
    }
    
    if (frameCount >= nextSpawnFrame) {
        spawnObject();
    }

    player.update();

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
    
    bgParticles.forEach(p => p.update());

    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        obj.update();

        const colStatus = checkCollision(player, obj);

        if (colStatus === 'death') {
            isGameOver = true;
            soundManager.playDeath();
            soundManager.stopMusic();
            const audio = document.getElementById('bgMusic');
            if(audio) audio.pause();
            return;
        } else if (colStatus === 'land') {
            player.y = obj.y - player.height;
            player.velocityY = 0;
            player.onGround = true;
            player.coyoteCounter = COYOTE_TIME; 
             const targetAngle = Math.round(player.angle / (Math.PI / 2)) * (Math.PI / 2);
             player.angle = targetAngle;
        }

        if (!obj.passed && obj.x + obj.width < player.x) {
            score++;
            scoreEl.textContent = `Score: ${score}`;
            obj.passed = true;
        }

        if (obj.x + obj.width < 0) {
            gameObjects.splice(i, 1);
        }
    }
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, `hsl(${bgHue}, 50%, 10%)`); 
    gradient.addColorStop(0.5, `hsl(${(bgHue + 40) % 360}, 60%, 20%)`); 
    gradient.addColorStop(1, `hsl(${(bgHue + 80) % 360}, 50%, 15%)`); 
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    bgParticles.forEach(p => p.draw());

    ctx.strokeStyle = `hsla(${(bgHue + 180) % 360}, 100%, 50%, 0.15)`;
    ctx.lineWidth = 1;
    
    const gridSize = 40;
    for (let x = bgOffset; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    const floorY = canvas.height - groundHeight;
    ctx.shadowBlur = 30;
    ctx.shadowColor = `hsl(${bgHue}, 100%, 50%)`;
    ctx.strokeStyle = `hsl(${bgHue}, 100%, 50%)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(canvas.width, floorY);
    ctx.stroke();
    ctx.shadowBlur = 0; 

    ctx.fillStyle = `hsl(${bgHue}, 50%, 5%)`;
    ctx.fillRect(0, floorY, canvas.width, groundHeight);
}

function drawGame() {
    drawBackground();
    player.draw();
    gameObjects.forEach(obj => obj.draw());
    particles.forEach(p => p.draw());
}

function gameLoop() {
    if (isGameOver) {
        gameOverEl.classList.remove('hidden');
        return;
    }

    updateGame();
    drawGame();

    requestAnimationFrame(gameLoop);
}

function tryPlayMusic() {
    const audio = document.getElementById('bgMusic');
    if (audio && audio.paused) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio play failed:", e));
    }
}

window.addEventListener('keydown', (e) => {
    soundManager.resume();
    tryPlayMusic(); 
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        jumpBufferCounter = JUMP_BUFFER_TIME; 
        isHoldingJump = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        isHoldingJump = false;
    }
});

canvas.addEventListener('mousedown', () => {
    soundManager.resume();
    tryPlayMusic(); 
    jumpBufferCounter = JUMP_BUFFER_TIME; 
    isHoldingJump = true;
});

canvas.addEventListener('mouseup', () => {
    isHoldingJump = false;
});

canvas.addEventListener('mouseleave', () => {
    isHoldingJump = false;
});

restartBtn.addEventListener('click', () => {
    soundManager.resume();
    tryPlayMusic();
    init();
});

init();