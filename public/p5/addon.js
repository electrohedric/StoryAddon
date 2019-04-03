const DEV = true;
const CANVAS_COLOR = 250;  // off white
const WIDTH = 780;
const HEIGHT = 480;

var socket;
var lastMouseX;
var lastMouseY;

// called once when the script is loaded
function setup() {
    createCanvas(WIDTH, HEIGHT);
    clearScreen();
    
    if(DEV) {  // if currently developing, connect to localhost
        socket = io.connect("http://localhost:8000");
    } else {
        socket = io.connect("https://addonwebgame.herokuapp.com/");
    }
    if(socket != null) {
        // setup callbacks from server
        socket.on('otherMouse', drawOther); // setup other players drawing
        socket.on('clearScreen', clearScreen);
        console.log("connected to server successfully");
    }
    
    lastMouseX = mouseX;
    lastMouseY = mouseY;
}

// draws a line segment from (x1, y1) to (x2, y2) in color
function segment(x1, y1, x2, y2, color) {
    stroke(color);
    strokeWeight(4);
    line(x1, y1, x2, y2);
}

function clearAllScreens() {
    clearScreen();
    socket.emit('clearScreen');
}

// clears the canvas with the canvas color
function clearScreen() {
    background(CANVAS_COLOR);
}

// called when other players draw
function drawOther(data) {
    segment(data.x, data.y, data.lx, data.ly, 60);
}

// called every frame whenever the mouse is dragged (mouse button is down)
function mouseDragged() {
    segment(mouseX, mouseY, lastMouseX, lastMouseY, 50);
    socket.emit('mouseUpdate', {x: mouseX, y: mouseY, lx: lastMouseX, ly: lastMouseY}); // send the mouse data to the server
}

// called every frame
function draw() {
    lastMouseX = mouseX;
    lastMouseY = mouseY;
}