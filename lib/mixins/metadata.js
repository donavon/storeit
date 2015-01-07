"use strict";

module.exports = function (target, local, utils) {
    target.metadata = function (key) {
        if (local.has(key)) {
            return {
                set: function (value) {
                    local.setMetadata(key, value);
                },
                get: function () {
                    return local.cache[key].metadata;
                }
            };
        } else {
            throw utils.createError("nonexistentKey");
        }
    };
};
