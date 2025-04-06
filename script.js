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

// Variables for device motion
let motionData = null;       // Latest device motion event data (when not in swing mode)
let sensorAccX = 0;          // Latest acceleration X (for swing mode visualization)
let sensorAccY = 0;          // Latest acceleration Y

// Swing mode state variables
let swingMode = false;
let swingStartTime = 0;
let swingDuration = 2000;    // Swing mode lasts 2 seconds
let swingMaxAcc = 0;         // Maximum absolute acceleration x recorded during swing mode
let swingDeviation = 0;      // Y acceleration corresponding to max acceleration
// For live visualization we use sensorAccX and sensorAccY (updated in handleMotion)

// Variables for drawing the shot angle
let isDrawing = false;
let drawnAngle = null;   // Calculated angle (in degrees) from the drawn line
let lineEnd = null;      // Current endpoint of the drawn line

// -----------------------
// Course View Functions
// -----------------------

// Draw the course with ball and hole (and red shot line if drawn)
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
  
  // If a shot angle was drawn, show the red line
  if (lineEnd) {
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Animate the ball moving to the target position on the course
function animateBall(targetX, targetY) {
  let swingInProgress = true;
  const frames = 60;
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
      // Reset for next shot
      drawnAngle = null;
      lineEnd = null;
      promptMessage.textContent = "Press near the ball and drag to draw your shot direction.";
      swingButton.disabled = true;
    }
  }
  animate();
}

// -----------------------
// Swing Mode Functions
// -----------------------

// Enter swing mode when the swing button is pressed.
// The canvas is cleared to a black background and a live visualization is shown.
function enterSwingMode() {
  // Transition into swing mode
  swingMode = true;
  // Clear the canvas with a black background for swing mode visualization
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Reset swing mode data
  swingMaxAcc = 0;
  swingDeviation = 0;
  swingStartTime = Date.now();
  
  // Start the live swing visualization loop
  requestAnimationFrame(drawSwingMode);
  
  // Set a timer to exit swing mode after the defined duration
  setTimeout(exitSwingMode, swingDuration);
}

// Live swing visualization: draw the current sensor acceleration vector.
function drawSwingMode() {
  if (!swingMode) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Center of the canvas for visualization
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  // Use the latest sensor values (sensorAccX, sensorAccY) for visualization
  const scale = 20; // scaling factor for visualization
  const lineEndX = centerX + sensorAccX * scale;
  const lineEndY = centerY - sensorAccY * scale; // invert Y for canvas
  
  // Draw a white circle at the center
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.closePath();
  
  // Draw a red line representing the acceleration vector
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(lineEndX, lineEndY);
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.closePath();
  
  // Optional text for debugging or feedback
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText("Swinging...", 10, 30);
  
  requestAnimationFrame(drawSwingMode);
}

// Exit swing mode after the swing period ends, then finalize the swing.
function exitSwingMode() {
  swingMode = false;
  finishSwing();
}

// Finalize the swing: use the maximum recorded sensor values to calculate swing strength and deviation,
// combine with the drawn shot angle and club multiplier, and animate the ball.
function finishSwing() {
  // Use the recorded maximum acceleration (swingMaxAcc) as the swing strength,
  // and swingDeviation (the corresponding y-axis value) as the deviation.
  let swingStrength = swingMaxAcc || 10;  // default if no sensor data was captured
  let deviation = swingDeviation || 0;
  
  console.log("Final swing strength:", swingStrength, "Final deviation:", deviation);
  
  const selectedClub = clubSelect.value;
  const baseAngle = drawnAngle;  // The angle drawn earlier in course view
  
  // Adjust swing strength by club multiplier
  swingStrength *= clubMultipliers[selectedClub];
  
  // Final shot angle incorporates the deviation
  const finalAngle = baseAngle + deviation;
  const rad = finalAngle * Math.PI / 180;
  const distance = swingStrength * 10;
  const targetX = ball.x + distance * Math.cos(rad);
  const targetY = ball.y - distance * Math.sin(rad);
  
  // Animate the ball on the course using the computed target position.
  animateBall(targetX, targetY);
}

// -----------------------
// Device Motion & Pointer Handling
// -----------------------

// Handle device motion events. When in swing mode, update the live sensor values and record maximum values.
function handleMotion(event) {
  if (event.acceleration && event.acceleration.x !== null) {
    sensorAccX = event.acceleration.x;
    sensorAccY = event.acceleration.y || 0;
  } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x !== null) {
    sensorAccX = event.accelerationIncludingGravity.x;
    sensorAccY = event.accelerationIncludingGravity.y || 0;
  }
  
  if (swingMode) {
    // Record the maximum absolute acceleration (x-axis) during the swing mode
    if (Math.abs(sensorAccX) > swingMaxAcc) {
      swingMaxAcc = Math.abs(sensorAccX);
      swingDeviation = sensorAccY;
    }
  } else {
    // When not in swing mode, store the event (if needed)
    motionData = event;
  }
}

// Utility to get pointer coordinates relative to the canvas
function getPointerPosition(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Pointer event handlers for drawing the shot angle in course view
function startDrawing(e) {
  const pos = getPointerPosition(e);
  const dist = Math.hypot(pos.x - ball.x, pos.y - ball.y);
  // Only start drawing if within ball radius + 20 pixels
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
  
  // Calculate the shot angle (in degrees) from the ball to the drawn point.
  const dx = pos.x - ball.x;
  const dy = ball.y - pos.y; // Invert Y because canvas increases downward
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
  // Only proceed if a shot angle has been drawn
  if (drawnAngle === null) {
    alert("Please draw the angle first!");
    return;
  }
  // Enter swing mode where the device's motion is visualized and recorded.
  enterSwingMode();
});

// Set up device motion event listener with permission handling
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

// Set up start button listener for the overlay
startButton.addEventListener('click', startGame);

// Initial draw of the course view
drawCourse();
