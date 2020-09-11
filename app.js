var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
//  var newrelic = require('newrelic');

var path = require('path');

var dbConfig = require('./config/dbConfig');
var db = require('./utils/mysqldb');

var loginRouter = require('./api/users/user.router');
var app;
var openHttpConnections = {};
var httpServer;

process.on('uncaughtException', function(err) {
    console.error('Uncaught exception ', err);
    shutdown('from uncaughtException');
});

process.on('SIGTERM', function () {
    console.log('Received SIGTERM');
    shutdown('from SIGTERM after process kill');
});

process.on('SIGINT', function () {
    console.log('Received SIGINT');
    shutdown('from SIGINT kill');
});

// Increasing the number of worker threads from default value 4 to be in sync with the poolMax connections

initApp();

function initApp() {
	app = express();

	// parse application/x-www-form-urlencoded
	app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));

	// parse application/json
	app.use(bodyParser.json({ limit: "50mb" }));

	app.use(handleError);

	// api routes
	app.use("/api/users", loginRouter);

	httpServer = http.Server(app);

	httpServer.on('connection', function(conn) {
		var key = conn.remoteAddress + ':' + (conn.remotePort || '');

		openHttpConnections[key] = conn;

		conn.on('close', function() {
			delete openHttpConnections[key];
		});
	});


	db.createPool(dbConfig.mysql)
		.then(function() {
      httpServer.listen(3000, function() {
        console.log('Webserver listening on localhost:3000');
      });
		})
		.catch(function(err) {
            console.error('Error occurred creating database connection pool', err);
            console.log('Exiting process');
            process.exit(0);
		});

}

function handleError(err, req, res, next) {
    console.error(err);
    res.status(500).send({error: 'An error has occurred, please contact support if the error persists'});
    shutdown('from handleError');//process would usually be restarted via something like https://github.com/foreverjs/forever
}

function shutdown(source) {
	console.log('Shutting down');
    console.log('Closing web server');
	var dbPool = db.getPool();
	var connectionInfo = `In use :- ${dbPool.connectionsInUse} & Open:- ${dbPool.connectionsOpen}`;

	httpServer.close(function() {
		console.log('Web server closed');
			db.terminatePool()
				.then(function() {
					console.log('node-oracledb connection pool terminated');
					console.log('Exiting process');
					process.exit(0);
				})
				.catch(function(err) {
					console.error(`Error occurred while terminating node-oracledb connection pool: ${connectionInfo} ${source}`, err);
					console.log('Exiting process');
					process.exit(0);
				});
	});

    for (key in openHttpConnections) {
        openHttpConnections[key].destroy();
    }
}

module.exports = app;