var dynamo = require('../config/database/index.js').dynamo;
var uuid = require('uuid');
var user = require('../user/index.js');
var message = require('../config/notification/index.js');
var redis = require('../config/database/index.js').redis;
var indexing = require('../search/index.js');

function saveStage(stage, result){
  var params = {
    TableName: 'stage',
    Item: {
      "id": stage.id,
      "tripId": stage.tripId,
      "title": stage.title,
      "comment": stage.comment,
      "pictureUrl": stage.pictureUrl,
      "latitude": stage.latitude,
      "longitude": stage.longitude,
      "address": stage.address,
      "date": stage.date,
      "rate": stage.rate,
      "type": stage.type,
      "creationDate": stage.creationDate,
      "updatedDate": stage.updatedDate
    }
  };
  dynamo.put(params, result);
  getIndexedTrip(stage.tripId, function(err, result) {
    if (result) {
      indexing.updateTrip(result);
    }
  });
}

function getIndexedTrip(tripId, result) {
  var params = {
    TableName: 'trip',
    Limit: 1,
    ScanIndexForward: false,
    KeyConditionExpression: 'id = :x',
    ExpressionAttributeValues: {
      ':x': tripId
    }
  };

  dynamo.query(params).promise()
    .then(function(trip){
      console.log("trip");
      console.log(trip);
      let tripStages = trip.Items[0];
      return getTripStages(tripStages.id, null).promise()
        .then(function(stages){
          tripStages.stages = stages.Items;
          console.log("stages");
          console.log(stages);
          return Promise.resolve(tripStages);
        });
    }).then((trip) => {
      console.log("trip");
      console.log(trip);
      return result(null, trip);
    }).catch(function(err) {
      console.log("Final Catch");
      console.log(err);
      result(err);
    });
}

function notifyFollowers(tripId) {
  console.log("Notify for tripId: " + tripId);

  const paramsFollowers = {
    TableName: 'trip-follower',
    KeyConditionExpression: 'userId = :userId',
    IndexName: 'tripId-index',
    ScanIndexForward: false,
    KeyConditionExpression: 'tripId = :x',
    ExpressionAttributeValues: {
      ':x': tripId,
    }
  };

  const paramsTrip = {
    TableName: 'trip',
    Key: {
      "id": tripId
    }
  };

  let tripTitle;
  let payload;

  dynamo.get(paramsTrip).promise()
    .then(function(trip) {
      console.log("Trip: ");
      console.log(trip);
      //payload.data.title = trip.Item.title;
      tripTitle = trip.Item.title;
      return user.findUserPromise(trip.Item.userId);
    }).then(function(user){
      console.log("User");
      console.log(user);
      console.log(user.first_name);
      payload = {
        data: {
          title: tripTitle,
          description: `Nouvelle étape de ${user.first_name}`,
          tripId: tripId
        }
      };

      console.log("params followers");
      console.log(paramsFollowers);
      return dynamo.query(paramsFollowers).promise();
    }).then(function(followers){
      console.log("followers: ");
      console.log(followers);
      for (let item of followers.Items){
        console.log("follower item:");
        console.log(item);
        console.log(payload);
        redis.get(item.followerId, function (err, token){
          console.log("send message to ");
          console.log(token);
          console.log(err);
          if (token && payload) {
            message.sendMessage(token, payload)
          }
        });
      }
    });
}

function getTripStages(tripId, exclusiveStartKey) {
  var params = {
    TableName: 'stage',
    Limit: 10,
    IndexName: 'tripId-date-index',
    ScanIndexForward: false,
    KeyConditionExpression: 'tripId = :x',
    ExpressionAttributeValues: {
      ':x': tripId
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

function handleStage(from, request, response, next) {
  let stage = request.params;
  let stageId = stage.id;

  if (typeof stageId === 'undefined' || stageId == null || !stageId.trim()) {
    if (from == "POST") {
      stage["id"] = uuid.v4();
      stage["creationDate"] = new Date().toISOString();
    } else {
      response.send(403, "Wrong method type POST instead of PUT");
      next();
      return;
    }
  } else {
    if (from == "PUT") {
      stage["updatedDate"] = new Date().toISOString();
    } else {
      response.send(403, "Wrong method type PUT instead of POST");
      next();
      return;
    }
  }

  let tripId = stage.tripId;
  if (typeof tripId === 'undefined' || tripId == null || !tripId.trim()) {
    response.send(409, "No associated trip");
    next();
    return;
  }

  let title = stage.title;
  if (typeof title === 'undefined' || title == null || !title.trim()) {
    response.send(409, "Stage must contain a title");
    next();
    return;
  }

  let pictureUrl = stage.pictureUrl;
  if (typeof pictureUrl === 'undefined' || pictureUrl == null || !pictureUrl.trim()) {
    response.send(409, "Stage must contain a picture");
    next();
    return;
  }

  let rate = stage.rate;
  if (typeof rate === 'undefined' || rate == null || rate === 0) {
    response.send(409, "Stage must contain a rating");
    next();
    return;
  }

  saveStage(stage, function(err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred
      response.send(500, "Un problème est survenue sur nos serveurs");
    } else {
      notifyFollowers(stage.tripId);
      var responseBody = { stage };
      response.send(from == "PUT" ? 200 : 201, responseBody);
    }
    next();
  });
}

function init(server){
  console.log(`initStage---------------------`);
  server.post("/stage", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();
    handleStage("POST", request, response, next);
  });

  server.put("/stage", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();
    handleStage("PUT", request, response, next);
  });

  server.get("/stage/trip/:uuid", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};
    lastEvaluatedKey["id"] = request.params.id;
    lastEvaluatedKey["tripId"] = request.params.tripId;
    lastEvaluatedKey["date"] = request.params.date;
    console.log("Pagination Key: " + request.params.id + " " + request.params.tripId + " " + request.params.date);
    console.log(lastEvaluatedKey);

    getTripStages(request.params.uuid, lastEvaluatedKey).promise()
      .then(function(data){
        console.log(data);
        response.send(200, data);
      })
      .catch(function(err) {
        console.log(err);
        response.send(404);
      });
  });
}

module.exports = {
    init,
    getTripStages
};
