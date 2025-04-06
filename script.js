// Get references to DOM elements
const canvas = document.getElementById('courseCanvas');
const ctx = canvas.getContext('2d');
const clubSelect = document.getElementById('clubSelect');
const swingButton = document.getElementById('swingButton');
const promptMessage = document.getElementById('promptMessage');
const startButton = document.getElementById('startButton');
const overlay = document.getElementById('overlay');

// Set canvas dimensions
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.6;

// Game objects: ball and hole on the course
let ball = { x: 50, y: canvas.height - 50, radius: 10 };
const hole = { x: canvas.width - 100, y: 100, radius: 15 };

// Club multipliers for distance adjustment
const clubMultipliers = {
  driver: 1.2,
  iron: 0.9,
  hybrid: 1.0,
  putter: 0.5
};

// -----------------------
// Device Motion Mapping for Swing Mode
// -----------------------
// Phone held in portrait with charging port up.
// We use the device's y‑axis for swing strength (forward/backward acceleration)
// and the x‑axis for hit deviation (sideways).
let sensorAccX = 0; // sideways deviation
let sensorAccY = 0; // forward/backward acceleration

// When not in swing mode, we can store motionData if needed.
let motionData = null;

// -----------------------
// Swing Mode Variables
// -----------------------
let swingMode = false;
let swingStartTime = 0;
const swingDuration = 2000;    // Swing mode lasts 2 seconds
let swingMaxAcc = 0;           // Maximum |sensorAccY| recorded during swing mode
let swingDeviation = 0;        // sensorAccX corresponding to that max |sensorAccY|
let hapticTriggered = false;   // Ensure haptic is triggered only once

// -----------------------
// Drawing Variables (for course view)
// -----------------------
let isDrawing = false;
let drawnAngle = null;   // Angle (in degrees) from the drawn shot line
let lineEnd = null;      // Current endpoint of the drawn shot line

// -----------------------
// Course View Functions
// -----------------------

// Draw the course view with the ball, hole, and (if drawn) the shot line.
function drawCourse() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw grass field
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw the hole
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.closePath();
  
  // Draw the ball
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();
  ctx.closePath();
  
  // Draw the shot line if drawn
  if (lineEnd) {
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Animate the ball moving on the course after the swing.
function animateBall(targetX, targetY) {
  let frames = 60;
  const dx = (targetX - ball.x) / frames;
  const dy = (targetY - ball.y) / frames;
  let frame = 0;
  
  function animate() {
    if (frame < frames) {
      ball.x += dx;
      ball.y += dy;
      drawCourse();
      frame++;
      requestAnimationFrame(animate);
    } else {
      ball.x = targetX;
      ball.y = targetY;
      drawCourse();
      // Reset shot data for next round
      drawnAngle = null;
      lineEnd = null;
      promptMessage.textContent = "Press near the ball and drag to draw your shot direction.";
      swingButton.disabled = true;
    }
  }
  animate();
}

// -----------------------
// Swing Mode Functions with Curved Vertical Progress Bar
// -----------------------

// Enter swing mode: reset recorded sensor data and begin live visualization.
function enterSwingMode() {
  swingMode = true;
  hapticTriggered = false;
  swingMaxAcc = 0;
  swingDeviation = 0;
  swingStartTime = Date.now();
  
  // Begin live swing visualization
  requestAnimationFrame(drawSwingMode);
  
  // End swing mode after swingDuration milliseconds
  setTimeout(exitSwingMode, swingDuration);
}

// Draw a vertical progress bar that fills upward from the bottom.  
// Instead of shifting horizontally, the bar's top edge is drawn as a curved path.
// The curvature (control point offset) is determined by sensorAccX (hit deviation).
function drawSwingMode() {
  if (!swingMode) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Compute progress based on elapsed time
  let elapsed = Date.now() - swingStartTime;
  let progress = Math.min(elapsed / swingDuration, 1);
  
  // Trigger haptic feedback when progress reaches 100%
  if (progress >= 1 && !hapticTriggered) {
    if (navigator.vibrate) {
      const didVibrate = navigator.vibrate(200); // vibrate for 200ms
      if (!didVibrate) {
        console.log("Vibration API call did not trigger vibration.");
      }
    } else {
      console.log("Vibration API not supported on this device.");
    }
    hapticTriggered = true;
  }
  
  // Set background for swing mode (a dark color)
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Define progress bar dimensions
  const barWidth = 20;
  const fullHeight = canvas.height;
  const barHeight = progress * fullHeight;
  const barBottomY = canvas.height;
  const barTopY = canvas.height - barHeight;
  
  // The progress bar is centered horizontally.
  const barX = canvas.width / 2 - barWidth / 2;
  
  // To create a curved top edge, we draw a shape:
  // - Bottom left: (barX, canvas.height)
  // - Bottom right: (barX + barWidth, canvas.height)
  // - Top right: (barX + barWidth, barTopY)
  // - Top left: (barX, barTopY)
  // Then we replace the flat top edge with a quadratic curve.
  // The control point for the curve is at:
  //   (canvas.width/2 + sensorAccX * 30, barTopY - 20)
  // so a positive sensorAccX (hit to the right) curves the top to the right, etc.
  const controlX = canvas.width / 2 + sensorAccX * 30;
  const controlY = barTopY - 20;
  
  ctx.beginPath();
  // Start at bottom left
  ctx.moveTo(barX, barBottomY);
  // Line to bottom right
  ctx.lineTo(barX + barWidth, barBottomY);
  // Line to top right
  ctx.lineTo(barX + barWidth, barTopY);
  // Curve from top right to top left using the control point
  ctx.quadraticCurveTo(controlX, controlY, barX, barTopY);
  ctx.closePath();
  
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Optional: display text for feedback
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

// Finalize the swing by combining the recorded sensor values with the drawn shot angle.
function finishSwing() {
  // Use the maximum absolute sensorAccY recorded during swing mode as swing strength,
  // and the corresponding sensorAccX as deviation.
  let swingStrength = swingMaxAcc || 10;  // default value if no significant motion
  let deviation = swingDeviation || 0;
  
  console.log("Final swing strength (sensorAccY):", swingStrength, "Final deviation (sensorAccX):", deviation);
  
  const selectedClub = clubSelect.value;
  const baseAngle = drawnAngle;  // shot angle drawn in course view
  
  // Adjust swing strength by the club's multiplier.
  swingStrength *= clubMultipliers[selectedClub];
  
  // The final shot angle incorporates the deviation.
  const finalAngle = baseAngle + deviation;
  const rad = finalAngle * Math.PI / 180;
  const distance = swingStrength * 10;  // scale factor for distance
  
  const targetX = ball.x + distance * Math.cos(rad);
  const targetY = ball.y - distance * Math.sin(rad);
  
  animateBall(targetX, targetY);
}

// -----------------------
// Device Motion Handling
// -----------------------

// Handle device motion events. Remap sensor data so that:
// - sensorAccY (forward/backward acceleration) is used for swing strength.
// - sensorAccX (left/right acceleration) is used for deviation.
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
    // Record the maximum absolute sensorAccY and corresponding sensorAccX during swing mode.
    if (Math.abs(sensorAccY) > swingMaxAcc) {
      swingMaxAcc = Math.abs(sensorAccY);
      swingDeviation = sensorAccX;
    }
  } else {
    motionData = event;
  }
}

// -----------------------
// Pointer Event Handling (for drawing shot angle)
// -----------------------

function getPointerPosition(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDrawing(e) {
  const pos = getPointerPosition(e);
  const dist = Math.hypot(pos.x - ball.x, pos.y - ball.y);
  // Begin drawing only if pointer is within ball radius + 20 pixels.
  if (dist <= ball.radius + 20) {
    isDrawing = true;
    console.log("Drawing started:", pos);
    canvas.setPointerCapture(e.pointerId);
  }
}

function duringDrawing(e) {
  if (!isDrawing) return;
  const pos = getPointerPosition(e);
  lineEnd = pos;
  drawCourse();
}

function endDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPointerPosition(e);
  lineEnd = pos;
  drawCourse();
  
  // Calculate shot angle (in degrees) from the ball to the drawn point.
  const dx = pos.x - ball.x;
  const dy = ball.y - pos.y; // Invert Y since canvas increases downward.
  drawnAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  console.log("Angle drawn:", drawnAngle);
  
  promptMessage.textContent = "Swing now!";
  swingButton.disabled = false;
  canvas.releasePointerCapture(e.pointerId);
}

// -----------------------
// Event Listeners Setup
// -----------------------

canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', duringDrawing);
canvas.addEventListener('pointerup', endDrawing);
canvas.addEventListener('pointercancel', endDrawing);

// When the Swing button is pressed (after drawing the shot angle), enter swing mode.
swingButton.addEventListener('click', () => {
  if (drawnAngle === null) {
    alert("Please draw the angle first!");
    return;
  }
  enterSwingMode();
});

// Set up device motion event listener with permission handling.
function startGame() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
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
}

// Set up the start button listener.
startButton.addEventListener('click', startGame);

// Initial draw of the course view.
drawCourse();
