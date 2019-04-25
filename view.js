const DEV = false;

let socket;

if (DEV) {  // if currently developing, connect to localhost
    socket = io.connect("http://localhost:8000/view");
} else {
    socket = io.connect("https://storyaddon.herokuapp.com/view"); // connect to 'show' titles namespace
}

if (socket != null) {
    // setup callbacks from server


}
