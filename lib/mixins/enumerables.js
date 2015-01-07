"use strict";

module.exports = function (target, local) {

    function getKeys() {
        return Object.keys(local.cache);
    }

    function forEachKey(fn) {
        getKeys().forEach(function (key) {
            fn(local.getValue(key), key, target);
        });
    }

    Object.defineProperty(target, "keys", {
        get: getKeys,
        enumerable: true
    });

    target.forEach = forEachKey;
};
