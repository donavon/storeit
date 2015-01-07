"use strict";

module.exports = function (target, local) {
    target.has = local.has;

    target.get = function (key, defaultValue) {
        return local.has(key) ? local.getValue(key) : defaultValue;
    };

    target.set = local.setValue;

    target.remove = local.removeKey;
    target["delete"] = local.removeKey;
};
