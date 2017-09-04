var config = require('../config/context_config.js').get(process.env.NODE_ENV);
var algoliasearch = require('algoliasearch');

var client = algoliasearch(config.algolia.account, config.algolia.key);
var index = client.initIndex('trip');

function saveNewTrip(trip) {
  var object = {}
  object["objectID"] = trip.id;
  object["trip"] = trip;

  var objects = [];
  objects.push(object)

  index.addObjects(objects, function(err, content){
    console.log(content);
  });
}

function updateTrip(trip) {
  var object = {}
  console.log("Trip to update: ");
  console.log(trip);
  object["objectID"] = trip.id;
  object["trip"] = trip;
  index.partialUpdateObject(object, function(err, content) {
      console.log(content);
  });
}

function searchTrip(search, result) {
  index.search(
    {
      'query': search,
      'ignorePlurals': true
    },
    result
  );
}

module.exports = {
  saveNewTrip,
  updateTrip,
  searchTrip
};
