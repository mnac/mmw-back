// restify framework with session management on redis
var restify = require('restify');
var server = restify.createServer();
var restifyOAuth2 = require("../config/authentication/restify-oauth2");
var hooks = require("../config/authentication/hooks");

server.use(restify.plugins.bodyParser({ mapParams: true }));
server.use(restify.plugins.authorizationParser());
server.use(restify.plugins.queryParser({ mapParams: true }));

server.get("/", function(request, response, next){
  response.json("Home")
});

var RESOURCES = Object.freeze({
    INITIAL: "/",
    TOKEN: "/connect"
});

restifyOAuth2.cc(server, { tokenEndpoint: RESOURCES.TOKEN, hooks: hooks });

require('../user').init(server);
require('../trip').init(server);
require('../stage').init(server);

server.get("/healthcheck", function(request, response, next){
  response.send(200);
  next();
});

server.listen(8080, function(){
  console.log("REDIS_HOST: " + process.env.REDIS_HOST);
  console.log("MYSQL_HOST: " + process.env.MYSQL_HOST);
  console.log('%s listening at %s', server.name, server.url);
});
