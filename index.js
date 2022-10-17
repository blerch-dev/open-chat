const { Server } = require('./model');
const { OpenChatApp } = require('./app');

const config = require('./config/config.json');
const package = require('./package.json');

var srv = new Server(config, package);
var app = new OpenChatApp(config, package, srv);

srv.start(app);

/*

app.connectRedis().then(() => {
    var srv = new Server(config, package);

    srv.start(app);
});



var srv = new Server(config, package);

srv.start(app);

*/