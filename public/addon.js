const DEV = false;

let socket;
let myTurnOrder;

if (DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com");
}

if (socket != null) {
    // setup callbacks from server

    socket.on('connect', onConnect);
    socket.on('turnOrder', turnOrder); // setup other players drawing
    socket.on('newTurn', newTurn);
    socket.on('newCookie', newCookie);
    socket.on('reloadGameData', reloadGameData);
    socket.on('playerLeft', playerLeft);
    window.onload = function () { // when the windows's ready, setup the keypress handler;
        console.log("setup key handler");
        document.getElementById('turn').onkeydown = handleKeyPress;
    };
    console.log("connected to server successfully");
}

function newCookie(cookie) {
    //var d = new Date();
    //d.setTime(d.getTime() + (24*60*60*1000)); // expires in 24 hours
    //var expires = "expires="+ d.toUTCString();
    document.cookie = 'rediskey' + "=" + cookie;// + ";" + expires;
}

function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function onConnect() {
    let rediskey = getCookie('rediskey');
    socket.emit('login', {rediskey: rediskey});
}

function turnOrder(t) {
    myTurnOrder = t; // the only thing this changes is when we allow the user to type
    // even if the user hacks and changes it, it will do nothing except make it difficult to type anything
    // turn handling is done 100% server-side so they won't be able to cheat the game
}

const GAMESTATE = {
    WAITING: 'waiting',
    SINGLEWORD: 'singleword',
    THREEWORD: 'threeword',
    SENTENCE: 'sentence'
};

function loadTurn(data) {
    let ghostTextInstructions = "";
    let modeInstructions = "";
    switch (data.mode) {
        case GAMESTATE.SINGLEWORD:
            ghostTextInstructions = "(Enter a single word)";
            modeInstructions = "Story Mode: Single words";
            break;
        case GAMESTATE.THREEWORD:
            ghostTextInstructions = "(Enter up to three words)";
            modeInstructions = "Story Mode: Three words";
            break;
        case GAMESTATE.SENTENCE:
            ghostTextInstructions = "(Enter any number of words)";
            modeInstructions = "Story Mode: Unlimited words";
            break;
    }
    // disable or enable the turn box depending on whether it's their turn or not
    document.getElementById('turn').disabled = (data.nextTurn !== myTurnOrder);
    document.getElementById('turn').placeholder = data.nextTurn === myTurnOrder ? "It is your turn " + ghostTextInstructions : "It is another players turn";
    document.getElementById('turn').value = ''; // clear the text box after our own submission to confirm
    if (data.nextTurn === myTurnOrder) {
        document.getElementById('turn').focus();
    }
    document.getElementById('instructions').innerHTML = modeInstructions; //clear when game has begun
}

function reloadGameData(data) {
    myTurnOrder = data.turnOrder;
    loadTurn(data);
    document.getElementById('game').innerHTML = data.text; // puts all the text from the story in the story box
    document.getElementById('leave').disabled = false;
}

function newTurn(data) {
    loadTurn(data);
    document.getElementById('game').innerHTML += data.text; // every other turn, we'll add their text to the display
    document.getElementById('leave').disabled = false;
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
    if (event.keyCode === 13) { // enter pressed
        endTurn();
    }
}

function leaveGame() {
    socket.emit("leavingGame");
    window.location.replace("index.html");
}

function playerLeft(permanent) { // bool
    if (permanent) {
        alert("A player has ended the game and left.");
    } else {
        alert("A player left... but they may come back.");
    }
}
