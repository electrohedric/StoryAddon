const DEV = false;

let socket;

if (DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000/show");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com/show"); // connect to 'show' titles namespace
}

if (socket != null) {
    // setup callbacks from server
    socket.on('data', addData);
}

function addData(storyData) { // each is an object with '_id', and 'title'
    let table = document.getElementById('stories');
    let row = table.insertRow(-1);
    let timestamp = row.insertCell(0);
    let wordcount = row.insertCell(1);
    let storytitle = row.insertCell(2);
    timestamp.innerText = storyData.date.toLocaleString(); // e.g. "4/24/2019, 10:49:33 PM"
    wordcount.innerText = storyData.wordCount;
    storytitle.innerText = storyData.title;
    let hlink = document.createElement("a");
    hlink.href = "view.html?id=" + storyData.id;

}

function load_next_stories() {
    socket.emit('next'); // ask the server for the next page of results
}
