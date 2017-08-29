var config = require('../context_config.js').get(process.env.NODE_ENV);
var mysql = require('mysql');
var aws = require("aws-sdk");
var promises = require('q').Promise;

// local pool
var pool = mysql.createPool({
  connectionLimit: config.mysql.connectionLimit,
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  debug: config.mysql.debug
});

var db = function(query, values, callback){
  pool.getConnection(function(error, connection){
    if (error) {
      console.log("conection user: developer password: -> " + error);
      callback({
        "code" : 100, "status" : "error in database connection."
      });
      return;
    }
    console.log("connected as id " + connection.threadId);

    connection.query(query, values, function(error, rows){
      connection.release();
      if (error) {
        console.log("error query: " + error);
        callback({"code" : 100, "status" : "Query failure"});
        return;
      }
      callback(null, rows);
    });

    connection.on('error', function(error){
      console.log("onerror: " + error);
      callback({
        "code" : 100, "status" : "error occurs on db"
      });
      return;
    });

    pool.on('release', function (connection) {
      console.log("Connection %d released", connection.threadId);
    });
  });
};

var redis = require('redis').createClient(config.redis.port, config.redis.host, {
    retry_strategy: function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with
            // a individual error
            console.log("Redis Connection refused");
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands
            // with a individual error
            console.log("Redis retry exhausted");
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            // End reconnecting with built in error
            console.log("End reconnecting");
            return undefined;
        }
        // reconnect after
        return Math.min(options.attempt * 100, 3000);
    }
});

redis.on("error", function (err) {
    console.log("Error " + err);
});

aws.config.update({
  accessKeyId: config.dynamo.accessKey,
  secretAccessKey: config.dynamo.secretKey,
  region: config.dynamo.region,
  dynamodb: config.dynamo.version
});

aws.config.setPromisesDependency(promises);

var dynamo = new aws.DynamoDB.DocumentClient();

module.exports = {
  db,
  redis,
  dynamo
};
