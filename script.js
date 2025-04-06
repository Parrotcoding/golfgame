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
// Device Motion Variables & Mapping
// -----------------------
// For your swing, the phone is held in portrait with charging port up.
// We'll use the device's y-axis (forward/backward) as swing strength,
// and the x-axis as the sideways deviation.
let sensorAccX = 0; // sideways deviation (from device's x-axis)
let sensorAccY = 0; // forward/backward acceleration (swing strength)

// When not in swing mode, we may store the event in motionData if needed.
let motionData = null;

// -----------------------
// Swing Mode Variables
// -----------------------
let swingMode = false;
let swingStartTime = 0;
const swingDuration = 2000;    // Swing mode lasts 2 seconds
let swingMaxAcc = 0;           // Maximum |sensorAccY| recorded during swing mode
let swingDeviation = 0;        // sensorAccX corresponding to the max |sensorAccY|

// -----------------------
// Drawing Variables (for course view)
// -----------------------
let isDrawing = false;
let drawnAngle = null;   // Angle (in degrees) from the drawn line
let lineEnd = null;      // Current endpoint of the drawn shot line

// -----------------------
// Course View Functions
// -----------------------

// Draw the course view with the ball, hole, and if available, the drawn shot line.
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
  
  // Draw the shot line if one was drawn
  if (lineEnd) {
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Animate the ball moving on the course after the swing
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
      // Reset shot data for the next round
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

// Enter swing mode: clear the canvas to a black background and show live acceleration.
function enterSwingMode() {
  swingMode = true;
  // Clear canvas for swing mode visualization (black background)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Reset swing data
  swingMaxAcc = 0;
  swingDeviation = 0;
  swingStartTime = Date.now();
  
  // Begin live visualization loop
  requestAnimationFrame(drawSwingMode);
  
  // End swing mode after the specified duration
  setTimeout(exitSwingMode, swingDuration);
}

// Live visualization in swing mode: show a stable acceleration vector.
function drawSwingMode() {
  if (!swingMode) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Use the center of the canvas for visualization.
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  // For visualization, scale the sensor values.
  const scale = 20;
  // Our vector: x is sensorAccX (sideways), y is sensorAccY (forward/backward).
  const vectorEndX = centerX + sensorAccX * scale;
  const vectorEndY = centerY - sensorAccY * scale; // Invert y for canvas
  
  // Draw a white circle at the center.
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.closePath();
  
  // Draw a red line representing the acceleration vector.
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(vectorEndX, vectorEndY);
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.closePath();
  
  // Display text for feedback.
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

// Finalize the swing by computing shot parameters using recorded sensor values.
function finishSwing() {
  // Use the maximum absolute sensorAccY recorded during swing mode as swing strength.
  let swingStrength = swingMaxAcc || 10;  // default if no significant motion was detected
  let deviation = swingDeviation || 0;      // sideways deviation from sensorAccX
  
  console.log("Final swing strength (from sensorAccY):", swingStrength, "Final deviation (sensorAccX):", deviation);
  
  const selectedClub = clubSelect.value;
  const baseAngle = drawnAngle;  // previously drawn shot angle
  
  // Adjust swing strength by the club multiplier.
  swingStrength *= clubMultipliers[selectedClub];
  
  // The final shot angle incorporates deviation from the swing.
  const finalAngle = baseAngle + deviation;
  const rad = finalAngle * Math.PI / 180;
  const distance = swingStrength * 10; // scale factor for distance
  
  const targetX = ball.x + distance * Math.cos(rad);
  const targetY = ball.y - distance * Math.sin(rad);
  
  // Animate the ball moving along the computed trajectory.
  animateBall(targetX, targetY);
}

// -----------------------
// Device Motion Handling
// -----------------------

// Handle device motion events. Remap sensor data so that sensorAccY (forward/backward)
// is used for swing strength and sensorAccX for sideways deviation.
function handleMotion(event) {
  let aX = 0, aY = 0;
  if (event.acceleration && event.acceleration.y !== null) {
    aY = event.acceleration.y;
    aX = event.acceleration.x || 0;
  } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.y !== null) {
    aY = event.accelerationIncludingGravity.y;
    aX = event.accelerationIncludingGravity.x || 0;
  }
  
  // Update our sensor variables
  sensorAccX = aX;
  sensorAccY = aY;
  
  if (swingMode) {
    // Record the maximum forward/backward acceleration (sensorAccY) and associated sideways deviation.
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
  // Begin drawing only if the pointer is within ball radius + 20 pixels.
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
  // Enter swing mode where live sensor motion is visualized and recorded.
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
