// GEOMETRY DASH CLONE - STABLE VERSION 4.1
// ALL LEVELS RESTORED + NEW ORB TYPES + UNIQUE ART
// FIXED: seededRandom hoisting and function ordering

// --- 1. GLOBAL EXPORTS & UTILS ---
window.startLevel = function(index) {
    if (typeof init === 'function') {
        currentLevelIndex = index;
        const menu = document.getElementById('levelMenu');
        if (menu) menu.classList.add('hidden');
        if (sm && typeof sm.generateMusic === 'function') sm.generateMusic();
        isPaused = false;
        init(index);
    }
};

window.toggleFullscreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
};

function seededRandom() { 
    const a = 1664525, c = 1013904223, m = 4294967296; 
    currentSeed = (a * currentSeed + c) % m; 
    return currentSeed / m; 
}

// --- 2. LEVELS CONFIGURATION ---
const levels = window.LEVELS_DATA || [
    { 
        name: "Stereo Madness", stars: 1, difficulty: "Easy", seed: 1001, hue: 200, duration: 60, params: { gap: 1.6, complexity: 1 },
        platformStyle: 'grid', modeSequence: ['cube', 'ship', 'ufo', 'wave', 'cube_upside_down']
    },
    { 
        name: "Back on Track", stars: 3, difficulty: "Normal", seed: 2002, hue: 280, duration: 60, params: { gap: 1.3, complexity: 2 },
        platformStyle: 'bricks', modeSequence: ['ship', 'ufo', 'cube', 'wave', 'cube_upside_down']
    },
    { 
        name: "Polargeist", stars: 5, difficulty: "Hard", seed: 3003, hue: 120, duration: 60, params: { gap: 1.1, complexity: 3 },
        platformStyle: 'glow', modeSequence: ['cube', 'wave', 'ufo', 'ship', 'cube_upside_down']
    },
    { 
        name: "Dry Out", stars: 7, difficulty: "Harder", seed: 4004, hue: 30, duration: 60, params: { gap: 0.9, complexity: 4 },
        platformStyle: 'metal', modeSequence: ['wave', 'ship', 'cube', 'ufo', 'cube_upside_down']
    },
    { 
        name: "Base After Base", stars: 10, difficulty: "Insane", seed: 5005, hue: 0, duration: 60, params: { gap: 0.8, complexity: 5 },
        platformStyle: 'checkered', modeSequence: ['ufo', 'cube', 'ship', 'wave', 'cube_upside_down']
    }
];

// --- 3. CONSTANTS ---
let canvas, ctx;
const PLAYER_WIDTH = 50, PLAYER_HEIGHT = 50, PLAYER_COLOR = '#00ffff';
const PLAYER_JUMP_FORCE = 16.0, UFO_JUMP_FORCE = 16.0, GRAVITY = 1.1, ROTATION_SPEED = 0.108; 
const OBSTACLE_WIDTH = 40, OBSTACLE_HEIGHT = 60, OBSTACLE_COLOR = '#ff00ff', OBSTACLE_SPEED = 8; 
const PLATFORM_HEIGHT = 15, PLATFORM_WIDTH_MIN = 60, PLATFORM_WIDTH_MAX = 120;
const JUMP_BUFFER_TIME = 15, COYOTE_TIME = 15;
let groundHeight = 100; 

// --- 4. STATE ---
let player, gameObjects = [], score = 0, highScore = 0, gameTime = 0; 
let isGameOver = false, isLevelComplete = false, isPaused = true, nextSpawnTime = 0; 
let bgOffset = 0, consecutivePlatforms = 0, bgHue = 0, lastPlatformY = 0;
let particles = [], bgParticles = [], bgCubes = [], lastTime = 0, pointsSincePortal = 0;
let isWaitingForPortal = false, isUpsideDown = false, isLevelEnding = false, orbsSpawnedCount = 0, animationFrameId = null;
let currentLevelIndex = 0, currentSeed = 1;
let jumpPressed = false, isHoldingJump = false, jumpBufferCounter = 0;
let gameMode = 'cube';

// --- 5. SOUND MANAGER ---
class SoundManager {
    constructor() { 
        this.ctx = null; this.isPlaying = false; this.nextTime = 0; this.step = 0;
        this.melody = [];
        this.bass = [];
        this.generateMusic();
    }
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} } }
    generateMusic() {
        const scale = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 622.25, 698.46]; // C Minor Pentatonic
        const bassScale = [65.41, 98.00, 130.81]; // C2, G2, C3
        this.melody = new Array(64).fill(0).map(() => Math.random() > 0.4 ? scale[Math.floor(Math.random() * scale.length)] : 0);
        this.bass = new Array(64).fill(0).map((_, i) => (i % 4 === 0 || Math.random() > 0.7) ? bassScale[Math.floor(Math.random() * bassScale.length)] : 0);
    }
    resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    start() { this.resume(); if (this.isPlaying || !this.ctx) return; this.isPlaying = true; this.nextTime = this.ctx.currentTime; this.loop(); }
    stop() { this.isPlaying = false; }
    loop() { 
        if (!this.isPlaying || !this.ctx) return; 
        while (this.nextTime < this.ctx.currentTime + 0.1) { this.runSequence(this.nextTime); this.nextTime += 0.125; } 
        setTimeout(() => this.loop(), 25); 
    }
    runSequence(t) {
        if (!this.ctx) return; const s = this.step % 64;
        if(this.melody[s]){ const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.type='square'; o.frequency.value=this.melody[s]; g.gain.setValueAtTime(0.03,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.1); }
        if(this.bass[s]){ const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.type='triangle'; o.frequency.value=this.bass[s]; g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.1); }
        this.step++;
    }
    play(f1, f2, type = 'square') { this.resume(); if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f1, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(f2, this.ctx.currentTime + 0.1); g.gain.setValueAtTime(0.1, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1); o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.1); }
}
const sm = new SoundManager();

// --- 6. ENTITY CLASSES ---
class Particle { constructor(x,y,color){this.x=x;this.y=y;this.color=color;this.size=Math.random()*8+4;this.vx=Math.random()*10-5;this.vy=Math.random()*10-5;this.life=1.0;} update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.life-=0.05*dt;this.size=Math.max(0,this.size-0.2);} draw(){ctx.globalAlpha=Math.max(0,this.life);ctx.fillStyle=this.color;ctx.fillRect(this.x,this.y,this.size,this.size);ctx.globalAlpha=1.0;} }
class BgCube { constructor(init){this.size=Math.random()*80+40;this.x=init?Math.random()*canvas.width:canvas.width+this.size;this.y=Math.random()*(canvas.height-groundHeight-100);this.alpha=Math.random()*0.1+0.05;this.v=(this.size/100)*0.5;} update(dt){this.x-=this.v*dt;if(this.x<-this.size){this.x=canvas.width+this.size;this.y=Math.random()*(canvas.height-groundHeight-100);}} draw(){ctx.fillStyle=`hsla(${bgHue},100%,50%,${this.alpha})`;ctx.fillRect(this.x,this.y,this.size,this.size);} }
class JumpPad { constructor(x,y){this.x=x;this.y=y;this.width=40;this.height=10;this.type='pad';} draw(){ctx.fillStyle='#FFFF00';ctx.fillRect(this.x,this.y,this.width,this.height);ctx.strokeStyle='#fff';ctx.strokeRect(this.x,this.y,this.width,this.height);} update(dt){this.x-=OBSTACLE_SPEED*dt;} }
class Orb { 
    constructor(x,y,type='yellow'){this.x=x;this.y=y;this.width=40;this.height=40;this.type='orb';this.orbType=type;this.pulse=0;this.used=false;
        this.color=type==='red'?'#ff0000':(type==='blue'?'#00ffff':'#ffd700');
    } 
    draw(){
        ctx.save(); ctx.translate(this.x+20,this.y+20); this.pulse+=0.1; const s=1+Math.sin(this.pulse)*0.1; ctx.scale(s,s);
        ctx.shadowBlur=15; ctx.shadowColor=this.color; ctx.strokeStyle=this.color; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.stroke();
        if(this.used){ctx.fillStyle=this.color;ctx.globalAlpha=0.3;ctx.fill();ctx.globalAlpha=1.0;} ctx.restore();
    } 
    update(dt){this.x-=OBSTACLE_SPEED*dt;} 
}
class Obstacle { constructor(x,y,w,h,flipped=false){this.x=x;this.y=y;this.width=w;this.height=h;this.type='spike';this.flipped=flipped;} draw(){ctx.save();ctx.fillStyle=`hsl(${bgHue},60%,15%)`;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();if(this.flipped){ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+this.width/2,this.y+this.height);ctx.lineTo(this.x+this.width,this.y);}else{ctx.moveTo(this.x,this.y+this.height);ctx.lineTo(this.x+this.width/2,this.y);ctx.lineTo(this.x+this.width,this.y+this.height);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();} update(dt){this.x-=OBSTACLE_SPEED*dt;} }
class Pillar { constructor(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;this.type='spike';} draw(){ctx.save();ctx.fillStyle=`hsl(${bgHue},60%,15%)`;ctx.fillRect(this.x,this.y,this.width,this.height);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(this.x,this.y,this.width,this.height);ctx.restore(); } update(dt){this.x -= OBSTACLE_SPEED * dt; } }
class Platform { 
    constructor(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;this.type='platform';} 
    draw(){
        ctx.save(); ctx.fillStyle=`hsl(${bgHue},60%,15%)`; ctx.fillRect(this.x,this.y,this.width,this.height);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(this.x,this.y,this.width,this.height);
        const style = levels[currentLevelIndex]?.platformStyle || 'grid';
        if(style==='bricks'){ for(let i=20; i<this.width; i+=20) { ctx.beginPath(); ctx.moveTo(this.x+i,this.y); ctx.lineTo(this.x+i,this.y+this.height); ctx.stroke(); } }
        else if(style==='metal'){ ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.fillRect(this.x+5,this.y+5,this.width-10,5); }
        else if(style==='checkered'){ for(let i=0; i<this.width; i+=20) { if((i/20)%2===0) { ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(this.x+i,this.y,20,this.height); } } }
        ctx.restore(); 
    } 
    update(dt){this.x -= OBSTACLE_SPEED * dt; } 
}
class Portal { constructor(x, y, targetMode) { this.x = x; this.y = y; this.width = 50; this.height = 80; this.targetMode = targetMode; this.type = 'portal'; this.passed = false; this.rotation = 0; } draw() { ctx.save(); ctx.shadowBlur = 30; let color = '#00ff00'; if (this.targetMode === 'ship') color = '#ff00ff'; if (this.targetMode === 'ufo') color = '#ffaa00'; if (this.targetMode === 'wave') color = '#00ffff'; if (this.targetMode === 'cube_upside_down') color = '#FF8C00'; ctx.shadowColor = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.translate(this.x + 25, this.y + 40); for(let i=0; i<3; i++) { ctx.beginPath(); ctx.rotate(this.rotation + (i * Math.PI / 3)); ctx.ellipse(0, 0, 25 - (i*5), 40 - (i*8), 0, 0, Math.PI * 2); ctx.stroke(); } ctx.fillStyle = `hsl(${bgHue}, 60%, 15%)`; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); } update(dt) { this.x -= OBSTACLE_SPEED * dt; this.rotation += 0.1 * dt; } }

class Player {
    constructor(x,y,w,h,c){this.x=x;this.y=y;this.width=w;this.height=h;this.color=c;this.velocityY=0;this.onGround=false;this.angle=0;this.trail=[];}
    draw(){
        ctx.save(); ctx.translate(this.x+this.width/2,this.y+this.height/2);
        if(gameMode==='ship'){
            ctx.rotate(this.angle); ctx.fillStyle=this.color; ctx.beginPath(); ctx.ellipse(0,0,35,18,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.stroke();
            ctx.save(); ctx.translate(0,-22); ctx.scale(0.35,0.35); this.drawCube(); ctx.restore();
        } else if(gameMode==='wave'){
            if(this.trail.length>1){ ctx.restore(); ctx.save(); ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(this.trail[0].x,this.trail[0].y); this.trail.forEach(t=>ctx.lineTo(t.x,t.y)); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(this.x+this.width/2,this.y+this.height/2); }
            ctx.rotate(this.angle); ctx.fillStyle=this.color; ctx.beginPath(); ctx.moveTo(25,0); ctx.lineTo(-15,15); ctx.lineTo(-15,-15); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#fff'; ctx.stroke();
        } else { ctx.rotate(this.angle); this.drawCube(); }
        ctx.restore();
    }
    drawCube(){ ctx.fillStyle=this.color; ctx.fillRect(-this.width/2,-this.height/2,this.width,this.height); ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.strokeRect(-this.width/2+3,-this.height/2+3,this.width-6,this.height-6); }
    update(dt){
        const f = canvas.height-groundHeight;
        if(gameMode==='cube'){ 
            if(jumpPressed){ jumpBufferCounter=JUMP_BUFFER_TIME; jumpPressed=false; }
            if(jumpBufferCounter>0) jumpBufferCounter-=dt;
            this.velocityY+=GRAVITY*dt; if(jumpBufferCounter>0 && this.onGround){ this.jump(); jumpBufferCounter=0; } this.y+=this.velocityY*dt; if(!this.onGround) this.angle+=ROTATION_SPEED*dt; else this.angle=Math.round(this.angle/(Math.PI/2))*(Math.PI/2); 
        }
        else if(gameMode==='ufo'){ this.velocityY+=GRAVITY*dt; if(jumpPressed){ this.velocityY=-UFO_JUMP_FORCE; jumpPressed=false; sm.play(150,600); } this.y+=this.velocityY*dt; this.angle=this.velocityY<0?-0.2:0.1; }
        else if(gameMode==='ship'){ if(isHoldingJump) this.velocityY-=0.85*dt; else this.velocityY+=0.6*dt; this.velocityY=Math.max(-12,Math.min(12,this.velocityY)); this.y+=this.velocityY*dt; this.angle=this.velocityY*0.1; }
        else if(gameMode==='wave'){ this.velocityY=isHoldingJump?-OBSTACLE_SPEED:OBSTACLE_SPEED; this.y+=this.velocityY*dt; this.trail.push({x:this.x+25, y:this.y+25}); if(this.trail.length>50) this.trail.shift(); }
        this.onGround=false; if(this.y+this.height>f){ this.y=f-this.height; this.velocityY=0; this.onGround=true; if (gameMode === 'wave') this.angle = 0; }
        if(this.y<0){ this.y=0; this.velocityY=0; }
    }
    jump(force=-PLAYER_JUMP_FORCE){ this.velocityY=force; this.onGround=false; sm.play(150,600); }
}

// --- 7. LOGIC FUNCTIONS ---
function resizeCanvas() { if(canvas){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; groundHeight = canvas.height / 3; } }

function init(idx){
    resizeCanvas(); const floorY = canvas.height - groundHeight; player = new Player(100, floorY - 50, 50, 50, PLAYER_COLOR);
    gameObjects=[]; particles=[]; bgCubes=[]; score=0; gameTime=0; lastTime=0; isGameOver=false; isLevelEnding=false; orbsSpawnedCount=0; nextSpawnTime=50; consecutivePlatforms=0; pointsSincePortal=0; isWaitingForPortal=false; isUpsideDown=false; gameMode='cube';
    
    // Reset Input State
    jumpPressed = false; isHoldingJump = false; jumpBufferCounter = 0;

    const l=levels[idx]; currentSeed=l.seed; bgHue=l.hue; for(let i=0; i<15; i++) bgCubes.push(new BgCube(true));
    document.getElementById('score').textContent="Progress: 0%";
    document.getElementById('gameOver').classList.add('hidden'); document.getElementById('levelComplete').classList.add('hidden');
    sm.start(); 
}

function spawn(){
    const f=canvas.height-groundHeight, l=levels[currentLevelIndex];
    if (!l || !l.params) return;
    const g = l.params.gap;
    if(score>0 && Math.floor(score/10) > Math.floor(pointsSincePortal / 10)){
        const target=l.modeSequence[Math.floor(score/10)%l.modeSequence.length];
        if(target!==gameMode || target==='cube_upside_down'){
            if(!isWaitingForPortal){ isWaitingForPortal=true; nextSpawnTime=gameTime+60; return; }
            isWaitingForPortal=false; gameObjects.push(new Portal(canvas.width,f-80,target)); gameObjects.push(new Pillar(canvas.width+10,0,30,f-80));
            pointsSincePortal=score; nextSpawnTime=gameTime+canvas.width/OBSTACLE_SPEED+60; return;
        }
    }
    if(gameMode!=='cube'){
        const r=seededRandom(); const x = canvas.width;
        if(r<0.2) gameObjects.push(new Obstacle(x,f-60,40,60)); else if(r<0.4) gameObjects.push(new Obstacle(x,0,40,60,true)); else gameObjects.push(new Pillar(x,seededRandom()*(f-200)+100,50,50));
        nextSpawnTime=gameTime+20*g; return;
    }
    const r=seededRandom(); let type='spike', delay=40;
    if(r<0.3) type='spike'; else if(r<0.8) type='platform'; else if(r<0.92) type='orb'; else type='pad';
    if(orbsSpawnedCount>=2 && type==='orb') type='spike';
    
    if(type==='pad'){ gameObjects.push(new JumpPad(canvas.width,f-10)); gameObjects.push(new Platform(canvas.width+200,f*0.5,200,f*0.5)); delay=100; }
    else if(type==='orb'){ 
        orbsSpawnedCount++; const x = canvas.width; const ot = (seededRandom()<0.1?'red':(seededRandom()<0.3?'blue':'yellow'));
        gameObjects.push(new Orb(x,f-140,ot)); for(let i=0;i<5;i++) gameObjects.push(new Obstacle(x-60+i*40,f-60,40,60)); delay=100; 
    }
    else if(type==='spike'){ gameObjects.push(new Obstacle(canvas.width,f-60,40,60)); delay=40; }
    else { 
        const w=seededRandom()*60+60; const y=consecutivePlatforms===0?f-20:lastPlatformY-(seededRandom()*20+35); lastPlatformY=Math.max(f*0.5,y); 
        if(consecutivePlatforms > 0 && seededRandom() < 0.2) {
            const gap = 400; const orbX = canvas.width + 54; gameObjects.push(new Orb(orbX, lastPlatformY + 50, 'yellow'));
            for(let i=0; i<Math.ceil(gap/OBSTACLE_WIDTH); i++) gameObjects.push(new Obstacle((canvas.width-96)+(i*OBSTACLE_WIDTH), f-60, 40, 60));
            gameObjects.push(new Platform(canvas.width + 244, lastPlatformY, w, f-lastPlatformY));
            delay = (w + 244) / OBSTACLE_SPEED;
        } else { gameObjects.push(new Platform(canvas.width, lastPlatformY, w, f-lastPlatformY)); delay = w/OBSTACLE_SPEED + 12; }
        consecutivePlatforms = (consecutivePlatforms+1)%8;
    }
    nextSpawnTime=gameTime+delay*g;
}

function update(dt){
    if(isPaused||isGameOver||!player) return;
    gameTime+=dt; if(Math.floor(gameTime/60)>score){ score++; const p = Math.min(100, Math.floor(score/levels[currentLevelIndex].duration*100)); document.getElementById('score').textContent=`Progress: ${p}%`; }
    if(score>=levels[currentLevelIndex].duration){ isLevelComplete=true; isPaused=true; document.getElementById('levelComplete').classList.remove('hidden'); return; }
    if(gameTime>=nextSpawnTime) spawn();
    player.update(dt); bgHue=(bgHue+0.1*dt)%360; bgCubes.forEach(c=>c.update(dt));
    for(let i=gameObjects.length-1;i>=0;i--){
        const o=gameObjects[i]; o.update(dt);
        if(!player) break;
        const hit=(player.x<o.x+(o.width||40) && player.x+player.width>o.x && player.y<o.y+(o.height||60) && player.y+player.height>o.y);
        if(hit){
            if(o.type==='portal'){ if(!o.passed){ gameMode=o.targetMode; o.passed=true; sm.play(400,1200,'sine'); } }
            else if(o.type==='orb'){ 
                if((jumpPressed || jumpBufferCounter > 0) && !o.used){ 
                    let f = -PLAYER_JUMP_FORCE; 
                    if(o.orbType==='red') f *= 1.5; else if(o.orbType==='blue') f *= 1.25;
                    player.jump(f); o.used=true; jumpBufferCounter = 0; jumpPressed = false;
                } 
            }
            else if(o.type==='pad'){ player.jump(-PLAYER_JUMP_FORCE * 1.5); }
            else if(o.type==='platform'){ if(player.y+player.height<=o.y+15 && player.velocityY>=0){ player.y=o.y-player.height; player.velocityY=0; player.onGround=true; } else { die(); } }
            else if(o.type==='spike'){ die(); }
        }
        if(o.x+(o.width||40)<0) gameObjects.splice(i,1);
    }
    jumpPressed = false;
}

function die(){
    isGameOver=true; sm.play(800,50,'sawtooth'); 
    for(let k=0; k<50; k++) { particles.push(new Particle(player.x+25, player.y+25, player.color)); }
    player=null; document.getElementById('gameOver').classList.remove('hidden'); 
}

function draw(){
    ctx.fillStyle=`hsl(${bgHue},60%,5%)`; ctx.fillRect(0,0,canvas.width,canvas.height);
    bgCubes.forEach(c=>c.draw());
    const f=canvas.height-groundHeight; ctx.fillStyle=`hsl(${bgHue},60%,10%)`; ctx.fillRect(0,f,canvas.width,groundHeight); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(0,f,canvas.width,2);
    if(player) player.draw(); gameObjects.forEach(o=>o.draw()); particles.forEach(p=>p.draw());
}

function loop(t){
    if(!lastTime) lastTime=t; const dt=Math.min(100,t-lastTime)/16.66; lastTime=t;
    update(dt); draw(); animationFrameId=requestAnimationFrame(loop);
}

function startGameLoop(){ if(animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId=requestAnimationFrame(loop); }

function showLevelMenu() {
    isPaused = true; 
    isGameOver = false; // Reset game over state
    const list = document.getElementById('levelList'); if(!list) return;
    
    const menu = document.getElementById('levelMenu');
    menu.classList.remove('hidden'); // Remove hidden class which has !important
    menu.style.display = 'flex'; // Use flex to match CSS centering
    menu.style.zIndex = '2000'; // Ensure it's on top
    
    document.getElementById('gameOver').classList.add('hidden');
    document.getElementById('levelComplete').classList.add('hidden');
    
    let h=''; levels.forEach((l, i) => {
        const saved = parseInt(localStorage.getItem(`highScore_level_${i}`)) || 0; const p = Math.min(100, Math.floor((saved / l.duration) * 100));
        h+=`<div class="level-card" style="border:2px solid #0ff; margin:10px; padding:15px; cursor:pointer; background:#222; min-width:180px;" onclick="startLevel(${i})">
            <div style="font-weight:bold; color:#fff;">${l.name}</div><div style="color:gold;">★ ${l.stars}</div>
            <div style="width:100%; height:8px; background:#333; margin-top:10px;"><div style="width:${p}%; height:100%; background:#0f0;"></div></div></div>`;
    });
    list.innerHTML=h;
}

window.onload=()=>{
    canvas=document.getElementById('gameCanvas'); ctx=canvas.getContext('2d');
    resizeCanvas(); showLevelMenu(); startGameLoop();
};

window.addEventListener('mousedown', ()=>{jumpPressed=true; isHoldingJump=true; sm.resume();});
window.addEventListener('mouseup', ()=>{isHoldingJump=false;});
window.addEventListener('keydown', (e)=>{if(e.code==='Space'||e.code==='ArrowUp'){jumpPressed=true; isHoldingJump=true; sm.resume();}});
window.addEventListener('keyup', (e)=>{if(e.code==='Space'||e.code==='ArrowUp'){isHoldingJump=false;}});
document.getElementById('restartBtn').addEventListener('click', ()=>init(currentLevelIndex));
document.getElementById('menuBtn').addEventListener('click', showLevelMenu);
document.getElementById('winMenuBtn').addEventListener('click', showLevelMenu);
document.getElementById('nextLevelBtn').addEventListener('click', ()=>{if(currentLevelIndex<levels.length-1)startLevel(currentLevelIndex+1); else showLevelMenu();});
document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
