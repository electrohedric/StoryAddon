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
    socket.on('cancelNext', cancelNext);

    load_next_stories(); // by default load first page
}

function addData(storyData) { // each is an object with '_id', and 'title' and 'wordCount' and 'date' (string in UTC)
    let table = document.getElementById('stories');
    let row = table.insertRow(-1);
    let timestamp = row.insertCell(0);
    let wordcount = row.insertCell(1);
    let storytitle = row.insertCell(2);

    let hlink = document.createElement("a"); // build an anchor out of story title and id
    hlink.href = "view.html?id=" + storyData.id;
    hlink.innerText = storyData.title;

    timestamp.innerText = new Date(storyData.date).toLocaleString(); // e.g. "4/24/2019, 10:49:33 PM"
    wordcount.innerText = storyData.wordCount;
    storytitle.innerHTML = hlink.outerHTML;
}

function load_next_stories() {
    socket.emit('next'); // ask the server for the next page of results
}

function cancelNext() {
    document.getElementById('load-stories').disabled = true; // when there are no more stories, don't let them press the button
}