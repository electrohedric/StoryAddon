/*********** Web server ************/

var express = require('express');
var app = express();
const genUUID = require('uuid/v1');

var port = process.env.PORT; // environment variable provided by heroku for our app
if (port == null || port == "") { // if on prod server, then run on the required port, otherwise run on 8000 test port
    port = 8000;
}

/************* MongoDB *************/

var mongoDB = require('mongodb');
var mongo = mongoDB.MongoClient;
var mongoURL = process.env.MONGODB_URI;
var storyDB;

mongo.connect(mongoURL, {
    useNewUrlParser: true
}, function(err, db) {
    if (port == 8000) {
        console.log("Debug mode: ignored mongo.")
        return; // if debug mode, we aren't going to be able to connect to the db. ignore
    }
    if (err) throw err;
    storyDB = db; // once we're connected to the database, set up the variable
    console.log("Connected to mongo!");
});

/*********** Gallery functions ************/

const pageSize = 10;
// returns a cursor to the data
function getStoryTitlesByPage(page, callback) { // page starts indexing at 1 for user's sake
    if (storyDB == null) return;
    if (page >= 0) {
        // sorts in reverse order. skips the first n * page elements and limits to n elements
        db.collection("stories")
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
    db.collection("stories")
        .find({
            _id: o_id
        }, callback);
}

function saveStory(storyText, callback) {
    if (storyDB == null) return; // this should honestly and realistically never occur
    // save the first 50 characters as the title, and then save the entire text
    // must save whole text because we may allow users to change title
    db.collection("stories")
        .insertOne({
            "title": storyText.substring(0, 50),
            "text": storyText
        }, callback);
}

/************* Socket **************/
var socket = require('socket.io');
var server = app.listen(port); // listen for connections
var io = socket(server);
io.sockets.on('connection', newConnection);
app.use(express.static('public'));

// keeps track of current turn per game, players connected, and the story
var roomData = new Map();

const GAMESTATE = {
    WAITING: 'waiting',
    SINGLEWORD: 'singleword',
    THREEWORD: 'threeword',
    SENTENCE: 'sentence'
}

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
var nextRoomWaiting = "";

// calculates the turn index (0-n) number from a total number of turns
function getTurnIndex(turnNum) {
    return (turnNum - 1) % roomCap + 1;
}

// called when we get a new connection
function newConnection(socket) {
    console.log("connected to " + socket.id);
    // TODO handle cookies if they have a session they are reconnecting to
    // connections will join a random UUID room unless there is one waiting
    // if they were to join the room, not enough space OR lobby doesn't exist, CREATE A NEW ROOM
    if (!roomData.has(nextRoomWaiting) || getRoomConnected(nextRoomWaiting) + 1 > roomCap) {
        nextRoomWaiting = genUUID();
        initRoom(nextRoomWaiting); // sets connected to 1 and turn to 0 (basically null, no one can go)
    } else {
        setRoomConnected(nextRoomWaiting, getRoomConnected(nextRoomWaiting) + 1);  // increment number connected to room
    }
    // now guaranteed there's available space, join the room
    socket.join(nextRoomWaiting);
    socket.room = nextRoomWaiting; // to send to other sockets in this room
    // this value must be equal to that of the value in room turn in order for a turn to work
    socket.turnOrder = getRoomConnected(nextRoomWaiting); // turn order is equivalent to connection order
    console.log("put into room " + socket.room + ", with turn# " + socket.turnOrder);
    if (getRoomConnected(nextRoomWaiting) == roomCap) { // final dude, let's start the game
        setRoomTurn(nextRoomWaiting, 1);
        setRoomState(nextRoomWaiting, GAMESTATE.SINGLEWORD); // games start out as single word
        io.in(socket.room).emit('newTurn', {
            nextTurn: 1,
            text: ''
        });
        console.log("started game!");
    }
    // the only thing the client can use this for is to disable the box when it's not their turn
    // even if the user manages to re-enable the box, the server still won't accept their turn
    // because of the room turn value
    socket.emit("turnOrder", socket.turnOrder);

    // called when the client submits their turn
    socket.on('turnEnd', function(textData) {
        // data will be the new text they added
        // if their turn order value is equivalent to the room, then it's their turn
        // the room's turn index is incremented without wrapping to provide a total turn number
        // so we must mod it to get the actual turn index
        let roomTurn = getRoomTurn(socket.room); // total turn number
        let roomIndex = getTurnIndex(roomTurn); // modulo'ed 1-n number indiciated client's turn
        if (roomIndex == socket.turnOrder) {
            let currentStory = getRoomStory(socket.room);
            let addText = textData.trim(); // alter their text to fit basic grammar (i.e. format spaces)
            // check for invalid syntax for the game state.
            // these should never get past the client, but we still have to check
            switch (getRoomState(socket.room)) {
                case GAMESTATE.SINGLEWORD:
                    // matches punctuation on either side of a word with any character except a space;
                    if (!addText.match(/^[.,?!:";/ ]*[^.,?!:";/ ]+[.,?!:";/ ]*$/)) return;
                    break;
                case GAMESTATE.THREEWORD: // TODO process text to match threeword
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
            io.in(socket.room).emit('newTurn', {
                nextTurn: getTurnIndex(roomTurn + 1),
                text: addText
            });
            console.log("received turn# " + roomTurn + " from " + socket.id + " in room " + socket.room + ", text='" + addText + "' next# " + getTurnIndex(roomTurn + 1));
        }
    });

    socket.on('disconnect', function() {
        // when a client disconnects, the room connected count decrements
        console.log(socket.id + " abandoned room " + socket.room);
        let roomConnected = getRoomConnected(socket.room);
        setRoomConnected(socket.room, roomConnected - 1);
        // they were the last to leave, so destroy the room after 60 seconds
        if (roomConnected == 1) { // (was 1, now 0)
            // FOR NOW, destroy the room immediately IF the game's begun (i.e. it's possible for everyone to reconnect)
            if (getRoomState(socket.room) == GAMESTATE.WAITING) { // they left the lobby and now it's empty
                roomData.delete(socket.room);
                console.log("destroyed " + socket.room + ". everyone left :(");
            } else {
                // TODO make it 60 seconds after cookies added
                roomData.delete(socket.room);
                console.log("this is where " + socket.room + " would be queued up to be destroyed soon.");
            }
        } else { // only send it if people are around to hear it
            // a message is sent to all other connected sockets that their session is invalid
            socket.to(socket.room).emit('playerLeft');
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
