/*********** WEB SERVER ************/
var express = require('express');
var app = express();
const genUUID = require('uuid/v1');

let port = process.env.PORT; // environment variable provided by heroku for our app
if (port == null || port == "") { // if on prod server, then run on the required port, otherwise run on 8000 test port
    port = 8000;
}

/*********** MongoDB ***********/
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

/*********** SOCKET ************/
var socket = require('socket.io');
var server = app.listen(port); // listen for connections
var io = socket(server);
io.sockets.on('connection', newConnection);
app.use(express.static('public'));

var gameRoomsTurnIndex = new Map(); // keeps track of current turn per game

const roomCap = 2;
let currentRoomSize = roomCap; // force an overflow on first join which will create a room
let nextRoomWaiting = "";

function getTurnIndex(turnNum) {
    return (turnNum - 1) % roomCap + 1;
}

// called when we get a new connection
function newConnection(socket) {
    console.log("connected to " + socket.id);
    // connections will join a random UUID room unless there is one waiting
    currentRoomSize++; // if they were to join the current room
    if (currentRoomSize > roomCap) { // not enough space, create a new room
        nextRoomWaiting = genUUID();
        currentRoomSize = 1;
        gameRoomsTurnIndex.set(nextRoomWaiting, 0); // turn indexing starts at 1, so this is essentially null
    }
    // now guaranteed there's available space, join the room
    socket.join(nextRoomWaiting);
    socket.room = nextRoomWaiting; // to send to other sockets in this room
    // this value must be equal to that of the value in gameRoomsTurnIndex in order for a turn to work
    socket.turnOrder = currentRoomSize; // turn order is equivalent to connection order
    console.log("put into room " + socket.room + ", with turn# " + socket.turnOrder);
    if (currentRoomSize == roomCap) { // final dude, let's start the game
        gameRoomsTurnIndex.set(nextRoomWaiting, 1);
        io.in(socket.room).emit('newTurn', {nextTurn: 1, text: ''});
        console.log("started game!");
    }
    // the only thing the client can use this for is to disable the box when it's not their turn
    // even if the user manages to re-enable the box, the server still won't accept their turn
    // because of the gameRoomsTurnIndex current room turn value
    socket.emit("turnOrder", socket.turnOrder);

    // called when the client submits their turn
    socket.on('turnEnd', function(textdata) {
        // data will be the new text they added
        // if their turn order value is equivalent to the room, then it's their turn
        // the room's turn index is incremented without wrapping to provide a total turn number
        // so we must mod it to get the actual turn index
        if(gameRoomsTurnIndex.has(socket.room)) {
            let roomTurn = gameRoomsTurnIndex.get(socket.room);
            let roomIndex = getTurnIndex(roomTurn);
            if(roomIndex == socket.turnOrder) {
                gameRoomsTurnIndex.set(socket.room, roomTurn + 1); // increment turn index
                 // tell the entire room about their turn, including the sender
                io.in(socket.room).emit('newTurn', {nextTurn: getTurnIndex(roomTurn + 1), text: textdata});
                console.log("received turn# " + roomTurn + " from " + socket.id + " in room " + socket.room + ", text='" + textdata + "' next# " + getTurnIndex(roomTurn + 1));
            }
        }
    });

    socket.on('disconnect', function() {
        gameRoomsTurnIndex.delete(socket.room); // when a client disconnects, the room is destroyed
        // and a message is sent to all other connected sockets that their session is invalid
        socket.to(socket.room).emit('playerLeft');
        console.log(socket.id + " abandoned room " + socket.room);
    });
}

console.log("Node server started. Listening for connections...");
