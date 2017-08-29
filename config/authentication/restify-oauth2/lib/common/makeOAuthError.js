"use strict";

var errors = require("restify-errors");

module.exports = function makeOAuthError(errorClass, errorType, errorDescription) {
    var body = { error: errorType, error_description: errorDescription };
    return new errors[errorClass + "Error"]({ message: errorDescription, body: body });
};
