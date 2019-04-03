/*********** WEB SERVER ************/
var express = require('express');
var app = express();

let port = process.env.PORT;
if (port == null || port == "") { // if on prod server, then run on the required port, otherwise run on 8000 test port
  port = 8000;
}
var server = app.listen(port);

app.use(express.static('public'));
console.log("...Node server started...");

/*********** SOCKET ************/

var socket = require('socket.io');
var io = socket(server);

io.sockets.on('connection', newConnection);

// called when we get a new connection
function newConnection(socket) {
    console.log("connected to " + socket.id);
    
    socket.on('mouseUpdate', function(data) { // whenever we get a mouse update packet
        socket.broadcast.emit('otherMouse', data); // send the mouse data to all other sockets
    });
    
    socket.on('clearScreen', function() { // whenever we get a mouse update packet
        socket.broadcast.emit('clearScreen'); // send the mouse data to all other sockets
    });
}