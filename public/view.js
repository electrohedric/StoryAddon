const DEV = false;

let socket;

if (DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000/view");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com/view"); // connect to 'show' titles namespace
}

if (socket != null) {
    // setup callbacks from server

    socket.on('receive', receive);
    socket.on('err', err);

    let idParam = new URL(window.location.href).searchParams.get('id');
    console.log("requesting " + idParam);
    socket.emit('get', idParam);
}

function receive(data) {
    if (data === null) {
        document.getElementById('date').innerText = "Created: ?";
        document.getElementById('word-count').innerText = "#Words: ?";
        document.getElementById('title').innerText = "That ID does not exist";
        document.title = "Story Add-on Error";
    } else {
        document.getElementById('date').innerText = "Created: " + new Date(data.date).toLocaleString();
        document.getElementById('word-count').innerText = "#Words: " + data.wordCount;
        document.getElementById('title').innerText = data.title + "...";
        document.title = data.title.substring(0, 25) + "..."; // cut the title down even short to the first 25 chars
        document.getElementById('display').innerHTML = data.text;
    }
}

function err() {
    document.getElementById('date').innerText = "Created: ?";
    document.getElementById('word-count').innerText = "#Words: ?";
    document.getElementById('title').innerText = "Server error";
    document.title = "Story Add-on Error";
}
