const DEV = false;

var socket;
var myTurnOrder;

if(DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com/");
}
if(socket != null) {
    // setup callbacks from server
    socket.on('turnOrder', turnOrder); // setup other players drawing
    socket.on('newTurn', newTurn);
    window.onload = function() { // when the windows's ready, setup the keypress handler;
        console.log("setup key handler");
        document.getElementById('turn').onkeydown = handleKeyPress;
    };
    console.log("connected to server successfully");
}

function turnOrder(turnOrder) {
    myTurnOrder = turnOrder; // the only thing this changes is when we allow the user to type
    // even if the user hacks and changes it, it will do nothing except make it difficult to type anything
    // turn handling is done 100% server-side so they won't be able to cheat the game
}

function newTurn(data) {
    // disable or enable the turn box depending on whether it's their turn or not
    document.getElementById('turn').disabled = (data.nextTurn != myTurnOrder);
    document.getElementById('turn').value = ''; // clear the text box after our own submission to confirm
    document.getElementById('game').innerHTML += data.text; // every other turn, we'll add their text to the display
    // TODO these instructions can change based on stuff
    document.getElementById('instructions').innerHTML = ''; // clear instructions after the first turn
}

function endTurn() {
    // TODO: check contents to ensure valid
    // errors
    socket.emit('turnEnd', document.getElementById('turn').value); // send the contents to the server
    // we don't have to handle newTurn stuff because the server will call it when we submit our turn
}

function handleKeyPress(event) {
    // TODO: do nice syntax highlighting somehow with error checking
    console.log(event);
    if (event.keyCode == 13) { // enter pressed
        endTurn();
    }
}
