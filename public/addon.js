const DEV = false;

let socket;
let myTurnOrder;

//store the key in a cookie
//SetCookie('rediskey', <%= rediskey %>); //http://msdn.microsoft.com/en-us/library/ms533693(v=vs.85).aspx

if(DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com/");
}

if(socket != null) {
    // setup callbacks from server
	
	socket.on('connect', onConnect);
    socket.on('turnOrder', turnOrder); // setup other players drawing
    socket.on('newTurn', newTurn);
	socket.on('newCookie', newCookie);
	socket.on('reloadGameData', reloadGameData);
	window.onload = function() { // when the windows's ready, setup the keypress handler;
        console.log("setup key handler");
        document.getElementById('turn').onkeydown = handleKeyPress;
    };
    console.log("connected to server successfully");
}

function newCookie(cookie){
	//TODO relogin with a new cookie
	document.cookie = 'rediskey' + "=" + cookie;
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function onConnect() {
	var rediskey = getCookie('rediskey');
	socket.emit('login', {rediskey: rediskey});
}

function turnOrder(turnOrder) {
    myTurnOrder = turnOrder; // the only thing this changes is when we allow the user to type
    // even if the user hacks and changes it, it will do nothing except make it difficult to type anything
    // turn handling is done 100% server-side so they won't be able to cheat the game
}

function loadTurn(data){
	
	// disable or enable the turn box depending on whether it's their turn or not
    document.getElementById('turn').disabled = (data.nextTurn !== myTurnOrder);
    document.getElementById('turn').value = ''; // clear the text box after our own submission to confirm
    
    // TODO these instructions can change based on stuff like current game mode
    document.getElementById('instructions').innerHTML = ''; // clear instructions after the first turn
}

function reloadGameData(data){
	turnOrder(data.turnOrder);
	loadTurn(data);
    document.getElementById('game').innerHTML = data.text; // puts all the text from the story in the story box
}

function newTurn(data) {
	loadTurn(data);
    document.getElementById('game').innerHTML += data.text; // every other turn, we'll add their text to the display
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
