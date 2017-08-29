var dynamo = require('../config/database/index.js').dynamo;
var uuid = require('uuid');
var User = require('../user/index.js');
var stage = require('../stage/index.js');

function getTripFollower(tripId, userId, exclusiveStartKey) {
  console.log("Trip follower trip Id: " + tripId);
  console.log("Trip follower user Id: " + userId);

  var params = {
    TableName: 'trip-follower',
    Limit: 1,
    ScanIndexForward: false,
    KeyConditionExpression: 'tripId = :x AND followerId = :y',
    ExpressionAttributeValues: {
      ':x': tripId,
      ':y': userId
    }
  };

  if (exclusiveStartKey != null
    && typeof exclusiveStartKey.id !== 'undefined'
    && typeof exclusiveStartKey.tripId !== 'undefined'
    && typeof exclusiveStartKey.date !== 'undefined') {
      console.log(exclusiveStartKey);
      params["ExclusiveStartKey"] = exclusiveStartKey;
  }

  return dynamo.query(params);
}

function getTrip(uuid, result) {
  var params = {
    TableName: 'trip',
    Key: {
      "id": uuid
    }
  };
  dynamo.get(params, result);
}

function getUserTrips(userId, exclusiveStartKey, result) {
  var params = {
    TableName: 'trip',
    Limit: 50,
    IndexName: 'userId-creationDate-index',
    ScanIndexForward: false,
    KeyConditionExpression: 'userId = :x',
    ExpressionAttributeValues: {
      ':x': userId
    }
  };

  console.log(exclusiveStartKey.id + " " + exclusiveStartKey.userId + " " + exclusiveStartKey.creationDate);
  if (typeof exclusiveStartKey.id !== 'undefined'
      && typeof exclusiveStartKey.userId !== 'undefined'
       && typeof exclusiveStartKey.creationDate !== 'undefined') {
         console.log(exclusiveStartKey);
         params["ExclusiveStartKey"] = exclusiveStartKey;
  }
  dynamo.query(params, result);
}

function getTimeLineTrips(exclusiveStartKey, currentUserId, result) {
  var params = {
    TableName: 'trip',
    Limit: 50,
    IndexName: 'feed-creationDate-index',
    ScanIndexForward: false,
    KeyConditionExpression: 'feed = :x',
    ExpressionAttributeValues: {
      ':x': 'timeline'
    }
  };

  console.log("Start key: " + exclusiveStartKey.id + " " + exclusiveStartKey.feed + " " + exclusiveStartKey.creationDate);
  if (typeof exclusiveStartKey.id !== 'undefined'
      && typeof exclusiveStartKey.feed !== 'undefined'
       && typeof exclusiveStartKey.creationDate !== 'undefined') {
         console.log(exclusiveStartKey);
         params["ExclusiveStartKey"] = exclusiveStartKey;
  }

  dynamo.query(params).promise()
    .then(function(tripData){
      let promises = [];
      for (let item of tripData.Items){
        (function(item){
          // local user id
          //item.userId = "AD022C83-8806-11E7-8D66-0242AC110002";
          promises.push(User.findUserPromise(item.userId)
            .then(function(user){
              item.user = user;
              console.log("user");
              console.log(user);
              return Promise.resolve();
            }));
          promises.push(stage.getTripStages(item.id, null).promise()
            .then(function(stages){
              item.stages = stages;
              console.log("stages");
              console.log(stages);
              return Promise.resolve();
            }));
          promises.push(getTripFollower(item.id, currentUserId, null).promise()
            .then(function(follower) {
              item.isFollowing = follower !== null && follower.Item != null && follower.Items !== 'undefined' && follower.Items.length > 0;
              console.log("Following: ");
              console.log(item.isFollowing);
            }));
        })(item);
      }
      return Promise.all(promises).then(() => {
        return Promise.resolve(tripData.Items);
      });
    }).then((items) => {
      return result(null, items);
    }).catch(function(err) {
      console.log(err);
      result(err);
    });
}

function saveTrip(trip, result){
  var params = {
    TableName: 'trip',
    Item: {
      "id": trip.id,
      "userId": trip.userId,
      "title": trip.title,
      "description": trip.description,
      "pictureUrl": trip.pictureUrl,
      "creationDate": trip.creationDate,
      "updatedDate": trip.updatedDate,
      "feed": "timeline"
    }
  };
  dynamo.put(params, result);
}

function saveTripFollower(tripId, followerId, result){
  var params = {
    TableName: 'trip-follower',
    Item: {
      "tripId": userId,
      "followerId": followerId
    }
  };
  dynamo.put(params, result);
}

function removeTripFollower(userId, followerId, result){
  var params = {
    TableName: 'trip-follower',
    Key: {
      "tripId": userId,
      "followerId": followerId
    }
  };
  dynamo.delete(params, result);
}

function handleTrip(from, request, response, next) {

  let trip = request.params;

  let tripId = trip.id;
  if (typeof tripId === 'undefined' || tripId == null || !tripId.trim()) {
    if (from == "POST") {
      trip["id"] = uuid.v4();
      trip["creationDate"] = new Date().toISOString();
    } else {
      response.send(403, "Wrong method type POST instead of PUT");
      next();
      return;
    }
  } else {
    if (from == "PUT") {
      trip["updatedDate"] = new Date().toISOString();
    } else {
      response.send(403, "Wrong method type PUT instead of POST");
      next();
      return;
    }
  }

  let userId = request.header("userId", "");
  if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
    response.send(409, "No associated user");
    next();
    return;
  }

  let title = trip.title;
  if (typeof title === 'undefined' || title == null || !title.trim()) {
    response.send(409, "Trip must contain a title");
    next();
    return;
  }

  saveTrip(trip, function(err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred
      response.send(500, "Un problème est survenue sur nos serveurs");
    } else {
      var responseBody = { trip };
      response.send(from == "PUT" ? 200 : 201, responseBody);
    }
    next();
  });
}

function init(server){
  console.log(`initTrip---------------------`);
  server.post("/trip", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();
    handleTrip("POST", request, response, next);
  });

  server.put("/trip", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();
    handleTrip("PUT", request, response, next);
  });

  server.get("/trip/:uuid", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();
    getTrip(request.params.uuid, function(err, data) {
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        response.send(200, data.Item);
      }
    });
  });

  server.get("/timeline", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};
    lastEvaluatedKey["id"] = request.params.id;
    lastEvaluatedKey["feed"] = request.params.feed;
    lastEvaluatedKey["creationDate"] = request.params.creationDate;

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }
    getTimeLineTrips(lastEvaluatedKey, userId, function(err, data) {
      console.log("data: " + data);
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        response.send(200, data);
      }
    });
  });

  server.get("/trip/user/:uuid", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};
    lastEvaluatedKey["id"] = request.params.id;
    lastEvaluatedKey["userId"] = request.params.userId;
    lastEvaluatedKey["creationDate"] = request.params.creationDate;

    getUserTrips(request.params.uuid, lastEvaluatedKey, function(err, data) {
      console.log("data: " + data);
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        response.send(200, data);
      }
    });
  });


  server.post("/trip/follow", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let tripId = request.params.tripId;
    if (typeof tripId === 'undefined' || tripId == null || !tripId.trim()) {
      response.send(422, `tripId is not associated`);
      next();
      return;
    }

    let followerId = request.params.followerId;
    if (typeof followerId === 'undefined' || followerId == null || !followerId.trim()) {
      response.send(422, `followerId is not associated`);
      next();
      return;
    }

    saveTripFollower(tripId, followerId, function(err, result) {
      if (err) {
        response.send(500, `Une erreur est survenue sur nos serveurs`);
      } else {
        response.send(200);
        next()
      }
    });

  });

  server.post("/unfollow", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let tripId = request.params.tripId;
    if (typeof tripId === 'undefined' || tripId == null || !tripId.trim()) {
      response.send(422, `tripId is not associated`);
      next();
      return;
    }

    let followerId = request.params.followerId;
    if (typeof followerId === 'undefined' || followerId == null || !followerId.trim()) {
      response.send(422, `followerId is not associated`);
      next();
      return;
    }

    removeTripFollower(tripId, followerId, function(err, result) {
      if (err) {
        response.send(500, `Une erreur est survenue sur nos serveurs`);
      } else {
        response.send(200);
        next()
      }
    });

  });
}

module.exports = {
    init,
    getTrip,
    saveTrip
};
