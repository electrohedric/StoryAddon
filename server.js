/*********** Web server ************/

var express = require('express');
var app = express();
const genUUID = require('uuid/v1');

let port = process.env.PORT; // environment variable provided by heroku for our app
if (port == null || port == "") { // if on prod server, then run on the required port, otherwise run on 8000 test port
    port = 8000;
}

/************* MongoDB *************/

var mongoDB = require('mongodb');
var mongo = mongoDB.MongoClient;
let mongoURL = process.env.MONGODB_URI;
var storyDB;

mongo.connect(mongoURL, { useNewUrlParser: true }, function (err, db) {
    if(port == 8000) return; // if debug mode, we aren't going to be able to connect to the db. ignore
    if(err) throw err;
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
            .find({}, {projection: {title:1}})
            .sort({$natural:-1})
            .skip(pageSize * (page - 1))
            .limit(pageSize)
            .toArray(callback);
    }
}

function getStoryByID(storyID, callback) {
    if (storyDB == null) return;
    var o_id = new mongoDB.ObjectID(storyID); // storyID should be in string form
    db.collection("stories")
        .find({_id: o_id}, callback);
}

function saveStory(storyText, callback) {
    if (storyDB == null) return; // this should honestly and realistically never occur
    // save the first 50 characters as the title, and then save the entire text
    // must save whole text because we may allow users to change title
    db.collection("stories")
        .insertOne({"title": storyText.substring(0, 50), "text": storyText}, callback);
}

/************* Socket **************/
var socket = require('socket.io');
var server = app.listen(port); // listen for connections
var io = socket(server);
io.sockets.on('connection', newConnection);
app.use(express.static('public'));

// keeps track of current turn per game, players connected, and the story
var roomData = new Map();

function initRoom(roomID) {
    roomData.set(roomID, {story: "", turn: 0, connected: 1});
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

const roomCap = 2;
let currentRoomSize = roomCap; // force an overflow on first join which will create a room
let nextRoomWaiting = "";

function getTurnIndex(turnNum) {
    return (turnNum - 1) % roomCap + 1;
}

// called when we get a new connection
function newConnection(socket) {
    console.log("connected to " + socket.id);
    // TODO handle cookies if they have a session they are reconnecting to

    // connections will join a random UUID room unless there is one waiting
    if (currentRoomSize + 1 > roomCap) { // if they were to join the room, not enough space, CREATE A NEW ROOM
        nextRoomWaiting = genUUID();
        initRoom(nextRoomWaiting); // sets connected to 1 and turn to 0 (basically null, no one can go)
        currentRoomSize = 1;
    } else {
        currentRoomSize++; // increment number connected to room
        setRoomConnected(nextRoomWaiting, currentRoomSize);
    }
    // now guaranteed there's available space, join the room
    socket.join(nextRoomWaiting);
    socket.room = nextRoomWaiting; // to send to other sockets in this room
    // this value must be equal to that of the value in room turn in order for a turn to work
    socket.turnOrder = currentRoomSize; // turn order is equivalent to connection order
    console.log("put into room " + socket.room + ", with turn# " + socket.turnOrder);
    if (currentRoomSize == roomCap) { // final dude, let's start the game
        setRoomTurn(nextRoomWaiting, 1);
        io.in(socket.room).emit('newTurn', {nextTurn: 1, text: ''});
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
        let roomTurn = getRoomTurn(socket.room);
        let roomIndex = getTurnIndex(roomTurn);
        if(roomIndex == socket.turnOrder) {
            let currentStory = getRoomStory(socket.room);
            let addText = textData.trim(); // alter their text to fit basic grammar (i.e. format spaces)
            // TODO process text to match current phase
             // if it needs a space between it and the last word
             // if there's punctation, it won't put a space or if it's the first word/sentence in the paragraph
            if (currentStory.length > 0 && !addText.match(/^[\.,?!:";/]/)) {
                addText = " " + addText; // add a space to separate this word/sentence from the last
            }
            setRoomTurn(socket.room, roomTurn + 1); // increment turn index
            // append their text to the room
            setRoomStory(socket.room, currentStory + addText);
             // tell the entire room about their turn, including the sender
            io.in(socket.room).emit('newTurn', {nextTurn: getTurnIndex(roomTurn + 1), text: addText});
            console.log("received turn# " + roomTurn + " from " + socket.id + " in room " + socket.room + ", text='" + addText + "' next# " + getTurnIndex(roomTurn + 1));
        }
    });

    socket.on('disconnect', function() {
        // when a client disconnects, the room connected count decrements
        let roomConnected = getRoomConnected(socket.room);
        setRoomConnected(socket.room, roomConnected - 1);
        if(roomConnected == 1) { // they were the last to leave, so destroy the room after 60 seconds
            // TODO if a player connects again, their cookie should allow them to reconnect to the room after a sudden disconnect
            // FOR NOW, destroy the room immediately
            roomData.delete(socket.room);
            console.log("destroyed " + socket.room + ". everyone left :(");
        }
        // and a message is sent to all other connected sockets that their session is invalid
        socket.to(socket.room).emit('playerLeft');
        console.log(socket.id + " abandoned room " + socket.room);
    });
}

process.on('exit', function(code) {
    if (storyDB != null) {
        storyDB.close(); // close the database connection on exit
    }
    console.log('Exiting with code ' + code);
});

console.log("Node server started. Listening for connections...");
