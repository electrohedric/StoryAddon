/*********** Web server ************/
const express = require('express');
const app = express();
const genUUID = require('uuid/v1');

let cookieParser = require('cookie-parser');

// need cookieParser middleware before we can do anything with cookies
app.use(cookieParser());

let port = process.env.PORT; // environment variable provided by heroku for our app
if (port == null || port === "") { // if on prod server, then run on the required port, otherwise run on 8000 test port
    port = 8000;
}

//Time consts
const SINGLEWORDTIME = 60 * 1000 * 3;
const THREEWORDTIME = 60 * 1000 * 3;

/************* MongoDB *************/
const mongoDB = require('mongodb');
const mongo = mongoDB.MongoClient;
const mongoURL = process.env.MONGODB_URI;
let storyDB;

mongo.connect(mongoURL, {useNewUrlParser: true}, function(err, db) {
    if (port === 8000) {
        console.log("Debug mode: ignored mongo.");
        return; // if debug mode, we aren't going to be able to connect to the db. ignore
    }
    if (err) throw err;
    storyDB = db; // once we're connected to the database, set up the variable
    console.log("Connected to mongo!");
});

/*********** Gallery functions ************/

/*
const pageSize = 10;

function getStoryTitlesByPage(page, callback) { // page starts indexing at 1 for user's sake. returns cursor to data
    if (storyDB == null) return;
    if (page >= 0) {
        // sorts in reverse order. skips the first n * page elements and limits to n elements
        storyDB.collection("stories")
            .find({}, {
                projection: {
                    title: 1
                }
            })
            .sort({
                $natural: -1
            })
            .skip(pageSize * (page - 1))
            .limit(pageSize)
            .toArray(callback);
    }
}

function getStoryByID(storyID, callback) {
    if (storyDB == null) return;
    let o_id = new mongoDB.ObjectID(storyID); // storyID should be in string form
    storyDB.collection("stories")
        .find({
            _id: o_id
        }, callback);
}

function saveStory(storyText, callback) {
    if (storyDB == null) return; // this should honestly and realistically never occur
    // save the first 50 characters as the title, and then save the entire text
    // must save whole text because we may allow users to change title
    storyDB.collection("stories")
        .insertOne({
            "title": storyText.substring(0, 50),
            "text": storyText
        }, callback);
}
 */

/************* Socket **************/
const socket = require('socket.io');
const server = app.listen(port); // listen for connections
const io = socket(server);
io.sockets.on('connection', newConnection);
app.use(express.static('public'));

// keeps track of current turn per game, players connected, and the story
const roomData = new Map();

const GAMESTATE = {
    WAITING: 'waiting',
    SINGLEWORD: 'singleword',
    THREEWORD: 'threeword',
    SENTENCE: 'sentence'
};

/*********** GETTERS AND SETTERS FOR ROOM ************/

function initRoom(roomID) {
    roomData.set(roomID, {
        story: "",
        turn: 0,
        connected: 1,
        state: GAMESTATE.WAITING
    });
}

function getRoomStory(roomID) {
    return roomData.get(roomID).story;
}

function setRoomStory(roomID, newStory) {
    let data = roomData.get(roomID);
    data.story = newStory;
    roomData.set(roomID, data);
}

function getRoomTurn(roomID) {
    return roomData.get(roomID).turn;
}

function setRoomTurn(roomID, newTurn) {
    let data = roomData.get(roomID);
    data.turn = newTurn;
    roomData.set(roomID, data);
}

function getRoomConnected(roomID) {
    return roomData.get(roomID).connected;
}

function setRoomConnected(roomID, newConnected) {
    let data = roomData.get(roomID);
    data.connected = newConnected;
    roomData.set(roomID, data);
}

function getRoomState(roomID) {
    return roomData.get(roomID).state;
}

function setRoomState(roomID, newGameState) {
    let data = roomData.get(roomID);
    data.state = newGameState;
    roomData.set(roomID, data);
}

const roomCap = 2;
let nextRoomWaiting = "";
let lobbyList = new Set();

// calculates the turn index (0-n) number from a total number of turns
function getTurnIndex(turnNum) {
    return (turnNum - 1) % roomCap + 1;
}

/* sockets currently store the following custom values:
room		= the room id the socket is currently joined to
turnOrder	= the index of the turn this player is
rediskey	= the unique id to identify this player if they rejoin
*/
var disconectedPlayers = new Map();


function getDisconectedRoom(rediskey) {
    return disconectedPlayers.get(rediskey).room;
}

function setDisconectedRoom(rediskey, newRoom) {
    let data = disconectedPlayers.get(rediskey);
    data.room = newRoom;
    disconectedPlayers.set(rediskey, data);
}

function getDisconectedTurnOrder(rediskey) {
    return disconectedPlayers.get(rediskey).turnOrder;
}

function setDisconectedTurnOrder(rediskey, newTurnOrder) {
    let data = disconectedPlayers.get(rediskey);
    data.turnOrder = newTurnOrder;
    disconectedPlayers.set(rediskey, data);
}

function changeState(room, newState){
	console.log("changing state to " + newState + " in " + room);
	if(roomData.has(room)) { // ensure the room wasn't destroyed
		setRoomState(room, newState);
		io.sockets.in(room).emit('newTurn', { // emit a mode change
			mode: newState,
			text: "",
			nextTurn: getTurnIndex(getRoomTurn(room))
		});
		console.log("1:changing state to " + newState);
		switch (newState) {
			case GAMESTATE.SINGLEWORD:
				console.log("set timer for " + GAMESTATE.THREEWORD);
				setTimeout(function() {changeState(room, GAMESTATE.THREEWORD);}, SINGLEWORDTIME); 
				break;
			case GAMESTATE.THREEWORD:
				console.log("set timer for " + GAMESTATE.SENTENCE);
				setTimeout(function() {changeState(room, GAMESTATE.SENTENCE);}, THREEWORDTIME); 
				break;
			default: break;
		}
	}
}

// called when we get a new connection
function newConnection(socket) {
	console.log("connected to " + socket.id);
	
	socket.on('login', function(cookie) {
		
		if(cookie.rediskey){
			socket.rediskey = cookie.rediskey;
			console.log("rediskey " + cookie.rediskey);
			if(disconectedPlayers.has(cookie.rediskey)){

				socket.room = getDisconectedRoom(cookie.rediskey);
				socket.turnOrder = getDisconectedTurnOrder(cookie.rediskey);
				socket.join(socket.room);
				
				setRoomConnected(socket.room, getRoomConnected(socket.room) + 1);
				console.log("reconected into room " + socket.room + ", with turn# " + socket.turnOrder);
				socket.emit("reloadGameData", {
					nextTurn: getTurnIndex(getRoomTurn(socket.room)), 
					turnOrder: socket.turnOrder, 
					text: getRoomStory(socket.room),
					mode: getRoomState(socket.room)
				});
				
				disconectedPlayers.delete(cookie.rediskey);
				return;
			}
		} else {
			socket.rediskey = genUUID();
			socket.emit("newCookie", socket.rediskey);
			console.log("sent a new cookie, " + socket.rediskey);
		}
		
		// connections will join a random UUID room unless there is one waiting
		// if they were to join the room, not enough space OR lobby doesn't exist, CREATE A NEW ROOM
		if (!roomData.has(nextRoomWaiting) || getRoomConnected(nextRoomWaiting) + 1 > roomCap) {
			lobbyList.clear();
			nextRoomWaiting = genUUID();
			initRoom(nextRoomWaiting); // sets connected to 1 and turn to 0 (basically null, no one can go)
		} else {
			// increment number connected to room
			setRoomConnected(nextRoomWaiting, getRoomConnected(nextRoomWaiting) + 1);
		}
		// now guaranteed there's available space, join the room
		socket.join(nextRoomWaiting);
		socket.room = nextRoomWaiting; // to send to other sockets in this room
		
		for(var i = 1; i <= roomCap; i++){
			if(!lobbyList.has(i)){
				lobbyList.add(i);
				socket.turnOrder = i; // turn order is equivalent to connection order
				break;
			}
		}
		// this value must be equal to that of the value in room turn in order for a turn to work
		console.log("put into room " + socket.room + ", with turn# " + socket.turnOrder);
		if (getRoomConnected(nextRoomWaiting) === roomCap) { // final dude, let's start the game
			setRoomTurn(nextRoomWaiting, 1);
			changeState(socket.room, GAMESTATE.SINGLEWORD);
			io.sockets.in(socket.room).emit('newTurn', {
				nextTurn: 1,
				text: '',
				mode: getRoomState(socket.room)
			});
			console.log("started game!");
			nextRoomWaiting = null;
			
		}
		// the only thing the client can use this for is to disable the box when it's not their turn
		// even if the user manages to re-enable the box, the server still won't accept their turn
		// because of the room turn value
		socket.emit("turnOrder", socket.turnOrder);
	});
    
    // called when the client submits their turn
    socket.on('turnEnd', function(textData) {
        // data will be the new text they added
        // if their turn order value is equivalent to the room, then it's their turn
        // the room's turn index is incremented without wrapping to provide a total turn number
        // so we must mod it to get the actual turn index
        let roomTurn = getRoomTurn(socket.room); // total turn number
        let roomIndex = getTurnIndex(roomTurn); // modulo'ed 1-n number indiciated client's turn
        if (roomIndex === socket.turnOrder) {
            let currentStory = getRoomStory(socket.room);
            let addText = textData.trim(); // alter their text to fit basic grammar (i.e. format spaces)
            // check for invalid syntax for the game state.
            // these should never get past the client, but we still have to check
            switch (getRoomState(socket.room)) {
                case GAMESTATE.SINGLEWORD:
                    // matches punctuation on either side of a word with any character except a space;
                    if (!addText.match(/^[.,?!:";/ \u201C\u201D]*[^.,?!:";/ \u201C\u201D]+[.,?!:";/ \u201C\u201D]*$/)) return;
                    break;
                case GAMESTATE.THREEWORD:
					if (!addText.match(/^[.,?!:";/ \u201C\u201D]*(?:[^.,?!:";/ \n\u201C\u201D]+[.,?!:";/ \u201C\u201D]*){1,3}$/)) return;
                    break;
                case GAMESTATE.SENTENCE: // TODO process text to match sentence
                    break;
                default:
                    console.log("uh oh! got state " + getRoomState(socket.room));
                    return; // server error?
            }
            // if it needs a space between it and the last word
            // if there's punctuation, it won't put a space or if it's the first word/sentence in the paragraph
            if (currentStory.length > 0 && !addText.match(/^[.,?!:";/-]/)) {
                addText = " " + addText; // add a space to separate this word/sentence from the last
            }
            setRoomTurn(socket.room, roomTurn + 1); // increment turn index
            // append their text to the room
            setRoomStory(socket.room, currentStory + addText);
            // tell the entire room about their turn, including the sender
            io.sockets.in(socket.room).emit('newTurn', {
                nextTurn: getTurnIndex(roomTurn + 1),
                text: addText,
				mode: getRoomState(socket.room)
            });
            console.log("received turn# " + roomTurn + " from " + socket.id + " in room " + socket.room +
                ", text='" + addText + "' next# " + getTurnIndex(roomTurn + 1));
        }
    });

    socket.on('disconnect', function() {
		if (socket.room !== undefined) {
			// when a client disconnects, the room connected count decrements
			console.log(socket.id + " abandoned room " + socket.room);
			if (getRoomState(socket.room) === GAMESTATE.WAITING){ // THE LOBBY
				lobbyList.delete(socket.turnOrder);
			} else {  //NOT THE LOBBY
				disconectedPlayers.set(socket.rediskey, {room:socket.room, turnOrder:socket.turnOrder});
			}
			let roomConnected = getRoomConnected(socket.room);
			setRoomConnected(socket.room, roomConnected - 1);
			
			
			if (roomConnected === 1) { // (was 1, now 0)
				// FOR NOW, destroy the room immediately IF the game's begun (i.e. it's possible for everyone to reconnect)
				if (getRoomState(socket.room) === GAMESTATE.WAITING) { // they left the lobby and now it's empty
					roomData.delete(socket.room);
					console.log("destroyed lobby " + socket.room + ". everyone left :(");
				} else {
					
					// they were the last to leave, so destroy the room after 60 seconds
					setTimeout(function (){
						if(getRoomConnected(socket.room) === 0){
							roomData.delete(socket.room);
							disconectedPlayers.forEach(function(value, key, map) {
								if (value.room === socket.room) { // remove all other players connecting
									map.delete(key); // screw you guys!
								}
							});
							console.log("destroyed " + socket.room + ". everyone left :(");
						}
					}, 10000);
					
					console.log(socket.room + " queued up to be destroyed soon.");
				}
			} else { // only send it if people are around to hear it
				// a message is sent to all other connected sockets that their session is invalid
				socket.to(socket.room).emit('playerLeft');
			}
		}
    });
}

process.on('exit', function(code) {
    if (storyDB != null) {
        storyDB.close(); // close the database connection on exit
    }
    console.log('Exiting with code ' + code);
});

console.log("Node server started. Listening for connections...");
