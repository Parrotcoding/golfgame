// ====================
// Global DOM Elements
// ====================
const canvas = document.getElementById('courseCanvas');
const ctx = canvas.getContext('2d');
const clubSelect = document.getElementById('clubSelect');
const swingButton = document.getElementById('swingButton');
const promptMessage = document.getElementById('promptMessage');
const startButton = document.getElementById('startButton');
const overlay = document.getElementById('overlay');

// ====================
// World & Canvas Setup
// ====================
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.6;
const worldWidth = 2000;
const worldHeight = 2000;

// Camera offset (panning). Initially center on the ball.
let camX = 0, camY = 0;

// ====================
// Obstacles & Course Layout
// ====================
// For demonstration, we add some sample obstacles.
const obstacles = [
  // Trees (circles)
  { type: 'tree', x: 400, y: 300, radius: 30 },
  { type: 'tree', x: 800, y: 600, radius: 30 },
  { type: 'tree', x: 1200, y: 900, radius: 30 },
  // Sand trap (rectangle)
  { type: 'sand', x: 600, y: 1200, width: 150, height: 100 },
  // Green area (rectangle)
  { type: 'green', x: 1500, y: 400, width: 300, height: 200 }
];

// The hole is placed in world coordinates.
const hole = { x: worldWidth - 150, y: 150, radius: 20 };

// ====================
// Ball Physics & State
// ====================
// The ball is an object with position (x,y) in world coordinates, vertical position z,
// radius, and velocity components.
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
let isAiming = false;  // true when user taps near ball to aim shot
let isPanning = false; // true when panning the course
let panStart = { x: 0, y: 0 };
let lastPan = { x: 0, y: 0 };

// Variables for drawing shot line (aiming)
let drawnAngle = null;  // in degrees (calculated from drawn line)
let lineEnd = null;     // endpoint of drawn line

// ====================
// Swing Mode Variables
// ====================
// When the user taps "Swing", we enter swing mode to record sensor data.
let swingMode = false;
let swingStartTime = 0;
const swingDuration = 2000; // milliseconds
let swingMaxAcc = 0;        // maximum |sensorAccY| recorded (for swing strength)
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
let motionData = null; // store raw event if needed

// ====================
// Club Multipliers
// ====================
const clubMultipliers = {
  driver: 1.2,
  iron: 0.9,
  hybrid: 1.0,
  putter: 0.5
};

// ====================
// Drawing & Camera Functions
// ====================

// Convert world coordinates to screen coordinates (taking camera offset into account)
function worldToScreen(x, y) {
  return { x: x - camX, y: y - camY };
}

// Draw the course, obstacles, hole, and ball (with shadow for elevation)
function drawCourse() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw a background (grass)
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw obstacles
  obstacles.forEach(ob => {
    const pos = worldToScreen(ob.x, ob.y);
    if (ob.type === 'tree') {
      // Draw trunk
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ob.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#8B4513';
      ctx.fill();
      ctx.closePath();
      // Draw canopy
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - ob.radius * 0.2, ob.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#228B22';
      ctx.fill();
      ctx.closePath();
    } else if (ob.type === 'sand') {
      ctx.fillStyle = '#f4e7b8';
      ctx.fillRect(pos.x, pos.y, ob.width, ob.height);
    } else if (ob.type === 'green') {
      ctx.fillStyle = '#006400';
      ctx.fillRect(pos.x, pos.y, ob.width, ob.height);
    }
  });
  
  // Draw the hole
  let holeScreen = worldToScreen(hole.x, hole.y);
  ctx.beginPath();
  ctx.arc(holeScreen.x, holeScreen.y, hole.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.closePath();
  
  // Draw the shot line if aiming
  if (isAiming && lineEnd) {
    ctx.beginPath();
    // Draw from ball's screen position to lineEnd
    const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
    ctx.moveTo(ballScreen.x, ballScreen.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // Draw ball shadow at ground position
  let ballGround = worldToScreen(ball.x, ball.y);
  ctx.beginPath();
  let shadowRadius = ball.radius * 1.2;
  ctx.arc(ballGround.x, ballGround.y, shadowRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.closePath();
  
  // Draw ball (offset upward by its elevation, and slightly scaled)
  const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
  let scale = 1 - (ball.z / 200); // ball appears smaller when high up
  ctx.beginPath();
  ctx.arc(ballScreen.x, ballScreen.y, ball.radius * scale, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();
  ctx.closePath();
}

// Update camera to follow the ball if not panning manually.
function updateCamera() {
  if (!isPanning) {
    // Center the camera on the ball (clamp within world boundaries)
    camX = Math.max(0, Math.min(ball.x - canvas.width/2, worldWidth - canvas.width));
    camY = Math.max(0, Math.min(ball.y - canvas.height/2, worldHeight - canvas.height));
  }
}

// ====================
// Physics Simulation for Ball Motion
// ====================

// Simulation parameters
const dt = 1/60;  // time step (seconds)
const gravity = 3; // gravitational acceleration (scaled)
const friction = 0.98; // friction factor for rolling

// Start simulation when ball is hit (flight phase)
function simulateBallMotion() {
  function step() {
    // If the ball is in flight (parabolic trajectory)
    if (ball.state === "flight") {
      // Update horizontal position
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // Update vertical position
      ball.z += ball.vz * dt;
      ball.vz -= gravity * dt;
      // If the ball lands (z falls below 0)
      if (ball.z <= 0) {
        ball.z = 0;
        ball.state = "rolling";
      }
    }
    // Rolling phase: apply friction until the ball nearly stops.
    if (ball.state === "rolling") {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= friction;
      ball.vy *= friction;
      // If horizontal speed is very low, stop the ball.
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
// Swing Mode Functions (with Curved Vertical Progress Bar)
// ====================

// Enter swing mode: reset recorded sensor data and start visualization.
function enterSwingMode() {
  swingMode = true;
  hapticTriggered = false;
  swingMaxAcc = 0;
  swingDeviation = 0;
  swingStartTime = Date.now();
  // Hide the course view during swing mode by not drawing obstacles.
  requestAnimationFrame(drawSwingMode);
  setTimeout(exitSwingMode, swingDuration);
}

// Draw a vertical progress bar that fills upward from the bottom of the canvas.
// The top edge is curved based on sensorAccX (hit deviation).
function drawSwingMode() {
  if (!swingMode) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Compute progress based on elapsed time
  let elapsed = Date.now() - swingStartTime;
  let progress = Math.min(elapsed / swingDuration, 1);
  
  // Trigger haptic feedback at 100%
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
  
  // Background for swing mode
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Define progress bar dimensions
  const barWidth = 20;
  const fullHeight = canvas.height;
  const barHeight = progress * fullHeight;
  const barBottomY = canvas.height;
  const barTopY = canvas.height - barHeight;
  const barX = canvas.width / 2 - barWidth / 2;
  
  // Create a curved top edge: control point offset based on sensorAccX
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
  
  // Optional text feedback
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText("Swinging...", 10, 30);
  
  requestAnimationFrame(drawSwingMode);
}

// Exit swing mode and finalize the swing.
function exitSwingMode() {
  swingMode = false;
  finishSwing();
}

// Finalize the swing by combining sensor data with the aimed shot.
// This computes the initial projectile speed and sets up the ball's physics.
function finishSwing() {
  // Use maximum recorded sensorAccY (absolute value) as swing strength.
  let swingStrength = swingMaxAcc || 10; // default if no significant motion
  let deviation = swingDeviation || 0;
  
  console.log("Final swing strength (sensorAccY):", swingStrength, "Final deviation (sensorAccX):", deviation);
  
  const selectedClub = clubSelect.value;
  const baseAngle = drawnAngle; // in degrees, as drawn during aiming
  
  // Adjust swing strength by club multiplier.
  swingStrength *= clubMultipliers[selectedClub];
  
  // Final shot angle: add deviation to the drawn angle.
  const finalAngle = baseAngle + deviation;
  const finalAngleRad = finalAngle * Math.PI / 180;
  
  // Use a fixed launch angle (e.g., 20°) for projectile flight.
  const launchAngle = 20 * Math.PI / 180;
  // Let "distance" be computed from swingStrength (using our old scale factor).
  // For projectile motion (ideal), horizontal range R = v² * sin(2*launchAngle)/g.
  // We want R ≈ swingStrength * 10, so we solve for v.
  const desiredRange = swingStrength * 10;
  const v = Math.sqrt(desiredRange * gravity / Math.sin(2 * launchAngle));
  
  // Decompose v into horizontal and vertical components.
  const horizontalSpeed = v * Math.cos(launchAngle);
  const vz = v * Math.sin(launchAngle);
  
  // The horizontal direction is given by finalAngleRad.
  const vx = horizontalSpeed * Math.cos(finalAngleRad);
  const vy = horizontalSpeed * Math.sin(finalAngleRad);
  
  // Set ball physics state for simulation.
  ball.vx = vx;
  ball.vy = vy;
  ball.vz = vz;
  ball.state = "flight";
  
  // Begin physics simulation.
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
// Pointer Event Handling: Aiming vs. Panning
// ====================

function getPointerPosition(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// On pointerdown, if near the ball (in screen coordinates) then aim; otherwise, pan.
canvas.addEventListener('pointerdown', (e) => {
  const pos = getPointerPosition(e);
  // Convert ball's world position to screen position
  const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
  const dist = Math.hypot(pos.x - ballScreen.x, pos.y - ballScreen.y);
  if (dist <= ball.radius + 20) {
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
    // Update the shot line as the pointer moves.
    lineEnd = getPointerPosition(e);
    drawCourse();
  } else if (isPanning) {
    // Update camera offset based on pan movement.
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    camX = Math.max(0, Math.min(lastPan.x - dx, worldWidth - canvas.width));
    camY = Math.max(0, Math.min(lastPan.y - dy, worldHeight - canvas.height));
    drawCourse();
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (isAiming) {
    isAiming = false;
    // Calculate the drawn shot angle from the ball to the final pointer position.
    const pos = getPointerPosition(e);
    lineEnd = pos;
    // Calculate in screen coordinates then convert back relative to ball.
    const ballScreen = worldToScreen(ball.x, ball.y - ball.z);
    const dx = pos.x - ballScreen.x;
    const dy = ballScreen.y - pos.y; // invert y
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
  // Enter swing mode: show the progress bar and record sensor data.
  enterSwingMode();
});

// Request motion sensor permission and start motion events.
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
  
  // Initially center the camera on the ball.
  camX = ball.x - canvas.width/2;
  camY = ball.y - canvas.height/2;
  drawCourse();
}

startButton.addEventListener('click', startGame);
