// ====================
// Global DOM Elements
// ====================
const canvas = document.getElementById('courseCanvas');
const ctx = canvas.getContext('2d');
const clubSelect = document.getElementById('clubSelect');
const swingButton = document.getElementById('swingButton');
const promptMessage = document.getElementById('promptMessage');
const startButton = document.getElementById('startButton');
const zoomInButton = document.getElementById('zoomInButton');
const zoomOutButton = document.getElementById('zoomOutButton');
const overlay = document.getElementById('overlay');

// ====================
// World & Canvas Setup
// ====================
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.6;
const worldWidth = 2000;
const worldHeight = 2000;

// Camera parameters: position (camX, camY) and zoom factor.
let camX = 0, camY = 0;
let camZoom = 1;       // 1 = normal view
let targetCamZoom = 1; // used for smooth zoom transitions

// ====================
// Obstacles & Course Layout
// ====================
const obstacles = [
  // Trees (circles)
  { type: 'tree', x: 400, y: 300, radius: 30 },
  { type: 'tree', x: 800, y: 600, radius: 30 },
  { type: 'tree', x: 1200, y: 900, radius: 30 },
  { type: 'tree', x: 1700, y: 200, radius: 40 },
  // Sand traps (rectangles)
  { type: 'sand', x: 600, y: 1200, width: 150, height: 100 },
  { type: 'sand', x: 1300, y: 1600, width: 200, height: 120 },
  // Greens (rectangles)
  { type: 'green', x: 1500, y: 400, width: 300, height: 200 },
  { type: 'green', x: 300, y: 1500, width: 250, height: 150 },
  // Water hazard (blue rectangle)
  { type: 'water', x: 900, y: 1000, width: 300, height: 150 }
];

// The hole is placed in world coordinates.
const hole = { x: worldWidth - 150, y: 150, radius: 20 };

// ====================
// Ball Physics & State
// ====================
let ball = {
  x: 150, 
  y: worldHeight - 150, 
  z: 0,          // elevation (0 = on ground)
  radius: 10,
  vx: 0,
  vy: 0,
  vz: 0,
  state: "idle"  // can be "idle", "flight", or "rolling"
};

// ====================
// Input Modes: Aiming vs. Panning
// ====================
let isAiming = false;  // true when tapping near ball to aim
let isPanning = false; // true when panning the course
let panStart = { x: 0, y: 0 };
let lastPan = { x: 0, y: 0 };

// Variables for drawing shot line (aiming)
let drawnAngle = null;  // in degrees (computed from drawn line)
let lineEnd = null;     // endpoint of the drawn shot line

// ====================
// Swing Mode Variables
// ====================
let swingMode = false;
let swingStartTime = 0;
const swingDuration = 2000; // milliseconds
let swingMaxAcc = 0;        // maximum |sensorAccY| recorded during swing mode
let swingDeviation = 0;     // sensorAccX corresponding to that max |sensorAccY|
let hapticTriggered = false;

// ====================
// Device Motion Variables
// ====================
// For the phone held in portrait (charging port up):
// sensorAccY (forward/backward acceleration) is used for swing strength,
// sensorAccX (left/right) for deviation.
let sensorAccX = 0;
let sensorAccY = 0;
let motionData = null;

// ====================
// Club Physics Parameters
// ====================
const clubPhysics = {
  driver: { multiplier: 1.5, launchAngle: 8, friction: 0.98 },
  iron:   { multiplier: 1.0, launchAngle: 20, friction: 0.99 },
  hybrid: { multiplier: 1.2, launchAngle: 15, friction: 0.985 },
  putter: { multiplier: 0.4, launchAngle: 2, friction: 0.995 }
};

// ====================
// Camera & Zoom Functions
// ====================

// Convert world coordinates to screen coordinates (taking camera offset and zoom into account)
function worldToScreen(x, y) {
  return { x: (x - camX) * camZoom, y: (y - camY) * camZoom };
}

// Smoothly animate camera parameters (position and zoom) over a given duration (ms).
function animateCamera(targetX, targetY, targetZoom, duration, callback) {
  const startTime = Date.now();
  const startCamX = camX;
  const startCamY = camY;
  const startZoom = camZoom;
  
  function step() {
    let elapsed = Date.now() - startTime;
    let t = Math.min(elapsed / duration, 1);
    // Linear interpolation (can add easing)
    camX = startCamX + (targetX - startCamX) * t;
    camY = startCamY + (targetY - startCamY) * t;
    camZoom = startZoom + (targetZoom - startZoom) * t;
    drawCourse();
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (callback) {
      callback();
    }
  }
  requestAnimationFrame(step);
}

// Zoom In/Out buttons animate the camera zoom while keeping the current center.
function animateZoom(factor, duration) {
  const targetZoom = camZoom * factor;
  // Keep current camera center in world coordinates.
  const centerX = camX + canvas.width / (2 * camZoom);
  const centerY = camY + canvas.height / (2 * camZoom);
  const newCamX = centerX - canvas.width / (2 * targetZoom);
  const newCamY = centerY - canvas.height / (2 * targetZoom);
  animateCamera(newCamX, newCamY, targetZoom, duration);
}

// ====================
// Drawing & Course Functions
// ====================

function drawCourse() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw background (grass)
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw obstacles
  obstacles.forEach(ob => {
    let pos = worldToScreen(ob.x, ob.y);
    if (ob.type === 'tree') {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ob.radius * 0.3 * camZoom, 0, Math.PI * 2);
      ctx.fillStyle = '#8B4513';
      ctx.fill();
      ctx.closePath();
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - ob.radius * 0.2 * camZoom, ob.radius * camZoom, 0, Math.PI * 2);
      ctx.fillStyle = '#228B22';
      ctx.fill();
      ctx.closePath();
    } else if (ob.type === 'sand') {
      ctx.fillStyle = '#f4e7b8';
      ctx.fillRect(pos.x, pos.y, ob.width * camZoom, ob.height * camZoom);
    } else if (ob.type === 'green') {
      ctx.fillStyle = '#006400';
      ctx.fillRect(pos.x, pos.y, ob.width * camZoom, ob.height * camZoom);
    } else if (ob.type === 'water') {
      ctx.fillStyle = '#3399ff';
      ctx.fillRect(pos.x, pos.y, ob.width * camZoom, ob.height * camZoom);
    }
  });
  
  // Draw the hole
  let holeScreen = worldToScreen(hole.x, hole.y);
  ctx.beginPath();
  ctx.arc(holeScreen.x, holeScreen.y, hole.radius * camZoom, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.closePath();
  
  // Draw shot line if aiming
  if (isAiming && lineEnd) {
    ctx.beginPath();
    const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
    ctx.moveTo(ballScreen.x, ballScreen.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // Draw ball shadow
  let ballGround = worldToScreen(ball.x, ball.y);
  ctx.beginPath();
  let shadowRadius = ball.radius * 1.2 * camZoom;
  ctx.arc(ballGround.x, ballGround.y, shadowRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.closePath();
  
  // Draw ball (offset by z) with scaling for depth
  const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
  let scale = 1 - (ball.z / 200);
  ctx.beginPath();
  ctx.arc(ballScreen.x, ballScreen.y, ball.radius * scale * camZoom, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();
  ctx.closePath();
}

// Update camera to follow the ball if not panning manually.
function updateCamera() {
  if (!isPanning && ball.state === "idle") {
    camX = Math.max(0, Math.min(ball.x - canvas.width/(2*camZoom), worldWidth - canvas.width/camZoom));
    camY = Math.max(0, Math.min(ball.y - canvas.height/(2*camZoom), worldHeight - canvas.height/camZoom));
  }
}

// ====================
// Physics Simulation for Ball Motion
// ====================
const dt = 1/60;      // time step (seconds)
const gravity = 3;    // gravitational acceleration (scaled)
let currentFriction = 0.98; // set per club

function simulateBallMotion() {
  function step() {
    if (ball.state === "flight") {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.z += ball.vz * dt;
      ball.vz -= gravity * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        ball.state = "rolling";
      }
    }
    if (ball.state === "rolling") {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= currentFriction;
      ball.vy *= currentFriction;
      if (Math.hypot(ball.vx, ball.vy) < 1) {
        ball.vx = 0;
        ball.vy = 0;
        ball.state = "idle";
      }
    }
    updateCamera();
    drawCourse();
    if (ball.state !== "idle") {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// ====================
// Swing Mode Functions (Curved Vertical Progress Bar)
// ====================
function enterSwingMode() {
  swingMode = true;
  hapticTriggered = false;
  swingMaxAcc = 0;
  swingDeviation = 0;
  swingStartTime = Date.now();
  requestAnimationFrame(drawSwingMode);
  setTimeout(exitSwingMode, swingDuration);
}

function drawSwingMode() {
  if (!swingMode) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  let elapsed = Date.now() - swingStartTime;
  let progress = Math.min(elapsed / swingDuration, 1);
  
  if (progress >= 1 && !hapticTriggered) {
    if (navigator.vibrate) {
      const didVibrate = navigator.vibrate(200);
      if (!didVibrate) {
        console.log("Vibration API call did not trigger vibration.");
      }
    } else {
      console.log("Vibration API not supported.");
    }
    hapticTriggered = true;
  }
  
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const barWidth = 20;
  const fullHeight = canvas.height;
  const barHeight = progress * fullHeight;
  const barBottomY = canvas.height;
  const barTopY = canvas.height - barHeight;
  const barX = canvas.width / 2 - barWidth / 2;
  
  const controlX = canvas.width / 2 + sensorAccX * 30;
  const controlY = barTopY - 20;
  
  ctx.beginPath();
  ctx.moveTo(barX, barBottomY);
  ctx.lineTo(barX + barWidth, barBottomY);
  ctx.lineTo(barX + barWidth, barTopY);
  ctx.quadraticCurveTo(controlX, controlY, barX, barTopY);
  ctx.closePath();
  
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText("Swinging...", 10, 30);
  
  requestAnimationFrame(drawSwingMode);
}

function exitSwingMode() {
  swingMode = false;
  finishSwing();
}

function finishSwing() {
  let swingStrength = swingMaxAcc || 10;
  let deviation = swingDeviation || 0;
  
  console.log("Final swing strength (sensorAccY):", swingStrength, "Final deviation (sensorAccX):", deviation);
  
  const selectedClub = clubSelect.value;
  const baseAngle = drawnAngle;
  const clubData = clubPhysics[selectedClub];
  
  swingStrength *= clubData.multiplier;
  const finalAngle = baseAngle + deviation;
  const finalAngleRad = finalAngle * Math.PI / 180;
  
  const launchAngle = clubData.launchAngle * Math.PI / 180;
  const desiredRange = swingStrength * 10;
  const v = Math.sqrt(desiredRange * gravity / Math.sin(2 * launchAngle));
  
  const horizontalSpeed = v * Math.cos(launchAngle);
  const vz = v * Math.sin(launchAngle);
  
  const vx = horizontalSpeed * Math.cos(finalAngleRad);
  const vy = horizontalSpeed * Math.sin(finalAngleRad);
  
  ball.vx = vx;
  ball.vy = vy;
  ball.vz = vz;
  ball.state = "flight";
  
  currentFriction = clubData.friction;
  
  simulateBallMotion();
}

// ====================
// Device Motion Handling
// ====================
function handleMotion(event) {
  let aX = 0, aY = 0;
  if (event.acceleration && event.acceleration.y !== null) {
    aY = event.acceleration.y;
    aX = event.acceleration.x || 0;
  } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.y !== null) {
    aY = event.accelerationIncludingGravity.y;
    aX = event.accelerationIncludingGravity.x || 0;
  }
  
  sensorAccX = aX;
  sensorAccY = aY;
  
  if (swingMode) {
    if (Math.abs(sensorAccY) > swingMaxAcc) {
      swingMaxAcc = Math.abs(sensorAccY);
      swingDeviation = sensorAccX;
    }
  } else {
    motionData = event;
  }
}

// ====================
// Pointer Event Handling (Aiming & Panning)
// ====================
function getPointerPosition(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  const pos = getPointerPosition(e);
  const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
  const dist = Math.hypot(pos.x - ballScreen.x, pos.y - ballScreen.y);
  if (dist <= ball.radius * camZoom + 20) {
    isAiming = true;
    lineEnd = pos;
    canvas.setPointerCapture(e.pointerId);
  } else {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    lastPan = { x: camX, y: camY };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (isAiming) {
    lineEnd = getPointerPosition(e);
    drawCourse();
  } else if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    camX = Math.max(0, Math.min(lastPan.x - dx / camZoom, worldWidth - canvas.width / camZoom));
    camY = Math.max(0, Math.min(lastPan.y - dy / camZoom, worldHeight - canvas.height / camZoom));
    drawCourse();
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (isAiming) {
    isAiming = false;
    const pos = getPointerPosition(e);
    lineEnd = pos;
    drawCourse();
    const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
    const dx = pos.x - ballScreen.x;
    const dy = ballScreen.y - pos.y;
    drawnAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    console.log("Angle drawn:", drawnAngle);
    promptMessage.textContent = "Swing now!";
    swingButton.disabled = false;
    canvas.releasePointerCapture(e.pointerId);
  }
  if (isPanning) {
    isPanning = false;
  }
});

canvas.addEventListener('pointercancel', (e) => {
  isAiming = false;
  isPanning = false;
  canvas.releasePointerCapture(e.pointerId);
});

// ====================
// Button & Motion Setup
// ====================
swingButton.addEventListener('click', () => {
  if (drawnAngle === null) {
    alert("Please aim by tapping near the ball first!");
    return;
  }
  enterSwingMode();
});

zoomInButton.addEventListener('click', () => {
  animateZoom(1.2, 500);
});
zoomOutButton.addEventListener('click', () => {
  animateZoom(1/1.2, 500);
});

function startGame() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          window.addEventListener('devicemotion', handleMotion);
        } else {
          alert("Motion sensor permission denied. Motion features will be disabled.");
        }
      })
      .catch(console.error);
  } else {
    window.addEventListener('devicemotion', handleMotion);
  }
  overlay.style.display = 'none';
  
  // Initial cinematic: show whole map, then zoom into the hole and pan to the ball.
  let initialZoom = Math.min(canvas.width / worldWidth, canvas.height / worldHeight);
  camZoom = initialZoom;
  targetCamZoom = initialZoom;
  camX = 0;
  camY = 0;
  drawCourse();
  
  setTimeout(() => {
    const targetX = hole.x - canvas.width/2;
    const targetY = hole.y - canvas.height/2;
    animateCamera(targetX, targetY, 1, 2000, () => {
      const targetX2 = ball.x - canvas.width/2;
      const targetY2 = ball.y - canvas.height/2;
      animateCamera(targetX2, targetY2, 1, 2000);
    });
  }, 2000);
}

startButton.addEventListener('click', startGame);
