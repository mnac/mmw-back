var crypto = require('crypto');
var user = require('../../user');
var redis = require('../database/index.js').redis;

function generateToken(data) {
    var random = Math.floor(Math.random() * 100001);
    var timestamp = (new Date()).getTime();
    var sha256 = crypto.createHmac("sha256", random + "WOO" + timestamp);

    var token = sha256.update(data).digest("base64");

    console.log(`Token: ${token}`);

    return token;
}

exports.grantClientToken = function(credentials, req, cb){
  let clientId = credentials.clientId;
  let clientSecret = credentials.clientSecret;
  if (clientId !== null && credentials.clientSecret !== null) {
    user.validCredentials(clientId, clientSecret, function(isValid, userId){
      console.log(`isValid: ${isValid}`);
      if (isValid) {
        console.log(`grantClientToken with clientId: ${clientId} and ${clientSecret} for userId ${userId}`);

        var token = generateToken(clientId + ":" + clientSecret);
        // If the client authenticates, generate a token for them and store it so `exports.authenticateToken` below
        // can look it up later.
        user.saveToken(clientId, token, function(error, result){
            if (result) {
              return cb(null, userId, token);
            } else {
              return cb(null, false, false);
            }
        });
      } else {
        // Call back with `false` to signal the username/password combination did not authenticate.
        // Calling back with an error would be reserved for internal server error situations.
        return cb(null, false);
      }
    });
  } else {
    cb(null, false);
  }
};

exports.authenticateToken = function (token, req, cb) {
  console.log(`authenticateToken`);
  if (redis.exists(token)) {
    // If the token authenticates, set the corresponding property on the request, and call back with `true`.
    // The routes can now use these properties to check if the request is authorized and authenticated.
    redis.get(token, function (err, res){
        req.clientId = res;
        console.log(`ClientId: ${res}`);
        return cb(null, true);
    });
  } else {
    // If the token does not authenticate, call back with `false` to signal that.
    // Calling back with an error would be reserved for internal server error situations.
    cb(null, false);
  }
};
