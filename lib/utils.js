"use strict";

var _ = require("underscore");

exports.publishLogger = function publishLogger(publish, logger, message) {
    return function() {
        var args = Array.prototype.slice.call(arguments, 0);
        logger(message, args);
        publish.apply(null, args);
    };
};

function isObject(object) {
    return !!object && typeof object === "object" && !(object instanceof Array) && !(object instanceof Date);
}
exports.isObject = isObject;

// from http://blog.vjeux.com/2011/javascript/object-difference.html
function difference(template, override) {
    var ret = {};
    for (var name in template) {
        if (name in override) {
            if (isObject(override[name])) {
                var diff = difference(template[name], override[name]);
                if (!_.isEmpty(diff)) {
                    ret[name] = diff;
                }
            } else if (!_.isEqual(template[name], override[name])) {
                ret[name] = override[name];
            }
        }
    }
    return ret;
}
function newProperties(template, override) {
    var ret = {};
    for (var name in override) {
        if (!(name in template)) {
            ret[name] = override[name];
        }
    }
    return ret;
}

// We ask the question "what is new/different about the overide object"?
// {a:1, b:1, c:1}, {a:2, b:1, d:1} => {a:2, d:1}
exports.whatsDifferent = function (template, override) {
    var diff = difference(template, override); // {a:2}
    var newProps = newProperties(template, override); // {d:1}
    return _.extend(diff, newProps); // {a:2, d:1}
};

exports.cloneObject = function (source) {
    return JSON.parse(JSON.stringify(source));
};

// Determines equality by value not by reference.
exports.isEqual = function (a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
};
