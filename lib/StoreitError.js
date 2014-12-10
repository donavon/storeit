"use strict";

var errorMessages = require("./errorMessages");

function StoreitError(type) {
    this.name = "StoreitError";
    this.type = type;
    this.message = errorMessages[type];
    this.stack = new Error().stack;
}
StoreitError.prototype = new Error();

Object.keys(errorMessages).forEach(function (type) {
    StoreitError[type] = type;
});

module.exports = StoreitError;
