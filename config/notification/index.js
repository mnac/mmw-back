var config = require('../context_config.js').get(process.env.NODE_ENV);
var admin = require("firebase-admin");

var serviceAccount = require("./" + config.google.apiServiceFileName);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.google.databaseURL
});

// Send a message to the device corresponding to the provided
// registration token.
function sendMessage(token, payload) {
  console.log("token:" + token);
  console.log("payload:");
  console.log(payload);
  admin.messaging().sendToDevice(token, payload)
    .then(function(response) {
      // See the MessagingDevicesResponse reference documentation for
      // the contents of response.
      console.log("Payload " + payload);
      console.log("Successfully sent message:", response);
    })
    .catch(function(error) {
      console.log("Error sending message:", error);
    });
}

module.exports = {
  sendMessage
};
