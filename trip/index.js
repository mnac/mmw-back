var dynamo = require('../config/database/index.js').dynamo;
var uuid = require('uuid');
var User = require('../user/index.js');
var stage = require('../stage/index.js');
var indexing = require('../search/index.js');

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

  User.findUserPromise(trip.userId)
    .then(function(user){
      trip.user = user;
      indexing.saveNewTrip(trip);
    }).catch(function(userError){
      trip.user = {};
      indexing.saveNewTrip(trip);
    });
}

function updateTrip(tripId) {
  trip.getIndexedTrip(tripId, function(err, result){
      if (result) {
        console.log("Trip to re index: ");
        console.log(trip);
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
      return stage.getTripStages(tripStages.id, null).promise()
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

function getTrip(tripId, userId, result) {
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
      return stage.getTripStages(tripStages.id, null).promise()
        .then(function(stages){
          tripStages.stages = stages.Items;
          console.log("stages");
          console.log(stages);
          return Promise.resolve(tripStages);
        });
    })
    .then(function(trip){
      return getTripFollower(trip.id, userId, null).promise()
        .then(function(follower) {
          console.log("follower: ");
          console.log(follower);
          console.log("Following: ");
          trip.isFollowing = follower !== null && follower.Items != null && follower.Items !== 'undefined' && follower.Items.length > 0;
          console.log(trip.isFollowing);
          return Promise.resolve(trip);
        }).catch(function(err) {
          console.log("Catch follower");
          console.log(err);
        })
    })
    .then((trip) => {
      console.log("trip");
      console.log(trip);
      return result(null, trip);
    }).catch(function(err) {
      console.log("Final Catch");
      console.log(err);
      result(err);
    });
}

function getFavorites(userId, exclusiveStartKey, result) {
  console.log("userId");
  console.log(userId);
  var params = {
    TableName: 'trip-follower',
    Limit: 50,
    IndexName: 'followerId-index',
    ScanIndexForward: false,
    KeyConditionExpression: 'followerId = :x',
    ExpressionAttributeValues: {
      ':x': userId
    }
  };

  dynamo.query(params).promise()
    .then(function(tripsFollower){
      console.log("follower: ");
      console.log(tripsFollower.Items);
      let promises = [];
      let trips = [];

      for (let tripFollower of tripsFollower.Items) {

        console.log("tripFollower: ");
        console.log(tripFollower);

        (function(tripFollower){
          var tripParams = {
            TableName: 'trip',
            Limit: 1,
            ScanIndexForward: false,
            KeyConditionExpression: 'id = :x',
            ExpressionAttributeValues: {
              ':x': tripFollower.tripId
            }
          };

          promises.push(dynamo.query(tripParams).promise()
            .then(function(trip){

              console.log("trip");
              console.log(trip);

              console.log("trip Id");
              console.log(trip.Items[0].id);

              trips.push(trip.Items[0]);

              return Promise.resolve();
          }));
        })(tripFollower);
      }

      return Promise.all(promises).then(() => {
        console.log("tripsFollower");
        console.log(tripsFollower);
        return Promise.resolve(trips);
      });

    }).then(function(trips) {
      console.log("trips");
      console.log(trips);

      let promises = [];

      for (let trip of trips) {
        (function(trip){
          promises.push(stage.getTripStages(trip.id, null).promise()
            .then(function(stages){
              console.log("stages");
              console.log(stages);
              trip.stages = stages.Items;

              console.log("trip");
              console.log(trip);
            }));

          promises.push(User.findUserPromise(trip.userId)
            .then(function(user){
              trip.user = user;
              console.log("user");
              console.log(user);
            }).catch(function(userError){
              trip.user = {};
              console.log(userError);
            }));

        })(trip);
      }

      return Promise.all(promises).then(() => {
        return Promise.resolve(trips);
      });

    })
    .then(function(tripsStaged){
      let trips = {}
      trips["trips"] = tripsStaged;
      return result(null, trips);
    })
    .catch(function(err) {
      console.log("Final Catch");
      console.log(err);
      result(err);
    });
}

function getUserTrips(userId, exclusiveStartKey, result) {
  console.log("userId");
  console.log(userId);
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

  dynamo.query(params).promise()
    .then(function(tripData){
      console.log("tripData: ");
      console.log(tripData.Items);
      let promises = [];
      for (let item of tripData.Items){
        (function(item){
          console.log("trip item");
          console.log(item);
          promises.push(stage.getTripStages(item.id, null).promise()
            .then(function(stages){
              item.stages = stages.Items;
              console.log("stages");
              console.log(stages);
              return Promise.resolve();
            }));
          promises.push(getTripFollower(item.id, userId, null).promise()
            .then(function(follower) {
              console.log("follower: ");
              console.log(follower);
              console.log("Following: ");
              item.isFollowing = follower !== null && follower.Items != null && follower.Items !== 'undefined' && follower.Items.length > 0;
              console.log(item.isFollowing);
            }).catch(function(err) {
              console.log("Catch follower");
              console.log(err);
            }));
        })(item);
      }
      return Promise.all(promises).then(() => {
        return Promise.resolve(tripData.Items);
      });
    }).then(function(tripData) {
      var profile = {};
      profile.trips = tripData;

      console.log("Items: ");
      console.log(tripData);
      return User.findUserById(userId)
        .then(function(user){
          profile.user = user;
          console.log("user");
          console.log(user);
          return Promise.resolve(profile);
        }).catch(function(userError){
          profile.user = {};
          console.log(userError);
          return Promise.resolve(profile);
        });
    }).then((userProfile) => {
      console.log("userProfile");
      console.log(userProfile);
      return result(null, userProfile);
    }).catch(function(err) {
      console.log("Final Catch");
      console.log(err);
      result(err);
    });
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
            }).catch(function(userError){
              item.user = {};
              console.log(userError);
            }));
          promises.push(stage.getTripStages(item.id, null).promise()
            .then(function(stages){
              item.stages = stages.Items;
              console.log("stages");
              console.log(stages);
              return Promise.resolve();
            }));
          promises.push(getTripFollower(item.id, currentUserId, null).promise()
            .then(function(follower) {
              item.isFollowing = follower !== null && follower.Items != null && follower.Items !== 'undefined' && follower.Items.length > 0;
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

function saveTripFollower(tripId, followerId, result){
  var params = {
    TableName: 'trip-follower',
    Item: {
      "tripId": tripId,
      "followerId": followerId
    }
  };
  dynamo.put(params, result);
}

function removeTripFollower(tripId, followerId, result){
  var params = {
    TableName: 'trip-follower',
    Key: {
      "tripId": tripId,
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

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    getTrip(request.params.uuid, userId, function(err, data) {
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        response.send(200, data);
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
        let trips = {};
        trips["trips"] = data;
        response.send(200, trips);
      }
    });
  });

  server.get("/favorites", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    getFavorites(userId, lastEvaluatedKey, function(err, data) {
      console.log("data: " + data);
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        console.log("Profile")
        console.log(data)
        response.send(200, data);
      }
    });
  });

  server.get("/profile", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};
    lastEvaluatedKey["id"] = request.params.id;
    lastEvaluatedKey["userId"] = request.params.userId;
    lastEvaluatedKey["creationDate"] = request.params.creationDate;

    let userId = request.header("userId", "");
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    getUserTrips(userId, lastEvaluatedKey, function(err, data) {
      console.log("data: " + data);
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        console.log("Profile")
        console.log(data)
        let result = {};
        result["profile"] = data;
        response.send(200, result.profile);
      }
    });
  });

  server.get("/trip/user/:uuid", function(request, response, next){
    if (!request.clientId) return response.sendUnauthenticated();

    let lastEvaluatedKey = {};
    lastEvaluatedKey["id"] = request.params.id;
    lastEvaluatedKey["userId"] = request.params.userId;
    lastEvaluatedKey["creationDate"] = request.params.creationDate;

    let userId = request.params.uuid;
    if (typeof userId === 'undefined' || userId == null || !userId.trim()) {
      response.send(422, `userId is not associated`);
      next();
      return;
    }

    getUserTrips(userId, lastEvaluatedKey, function(err, data) {
      console.log("data: " + data);
      if (err) {
        console.log(err);
        response.send(404);
      } else {
        let result = {};
        result["profile"] = data;
        response.send(200, result.profile);
      }
    });
  });


  server.post("/search/:query", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let query = request.params.query;
    if (typeof query === 'undefined' || query == null || !query.trim()) {
      response.send(422, `Query is not correct`);
      next();
      return;
    }

    indexing.searchTrip(query, function(err, result) {
      if (err) {
        response.send(500, `Une erreur est survenue sur nos serveurs`);
      } else {
        let trips = [];
        for (let hit of result.hits){
          trips.push(hit.trip);
        }
        response.send(200, {trips: trips});
        next()
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

    let followerId = request.header("userId", "");
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

  server.post("/trip/unfollow", function(request, response, next) {
    if (!request.clientId) return response.sendUnauthenticated();

    let tripId = request.params.tripId;
    if (typeof tripId === 'undefined' || tripId == null || !tripId.trim()) {
      response.send(422, `tripId is not associated`);
      next();
      return;
    }

    let followerId = request.header("userId", "");
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
    getIndexedTrip,
    saveTrip
};
