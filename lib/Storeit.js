"use strict";

var Q = require("q");
var _ = require("underscore");
var pubit = require("pubit-as-promised");
var whatsDifferent = require("./utils").whatsDifferent;
var previously = require("./utils").previously;
var isObject = require("./utils").isObject;
var cloneObject = require("./utils").cloneObject;
var isEqual = require("./utils").isEqual;
var Action = require("./Action");
var StoreitError = require("./StoreitError");

// Built-in mixins.
var mixins = [
    require("./mixins/map"),
    require("./mixins/enumerables"),
    require("./mixins/metadata")
];

var NS_SEPARATOR_CHAR = "#";

var events = ["added", "modified", "removed", "cleared", "ready"];
var EventName = _.object(events, events);

function throwUninitializedError() {
    throw new StoreitError(StoreitError.loadUninitialized);
}

function throwIfUndefined(value) {
    if (value === undefined) {
        throw new StoreitError(StoreitError.undefinedValue);
    }
}

function fakePublish() {}
fakePublish.when = function () {
    return Q.resolve([]);
};

function Storeit(namespace, storageProvider) {
    var that = this;
    var cache = {};

    if (namespace.indexOf(NS_SEPARATOR_CHAR) !== -1) {
        throw new StoreitError(StoreitError.invalidNamespace);
    }

    var options = { // Defaut options.
        publish: true,
        publishRemoveOnClear: false,
        primaryKey: "id"
    };

    var publish = pubit.makeEmitter(that, events); // Mixin `on`, `off`, `once`.
    var originalPublish = publish;

    var throwIfUninitialized = throwUninitializedError; // Default until `load` is called.

    function isInitialized() {
        return throwIfUninitialized !== throwUninitializedError;
    }

    function initialize() {
        var needsInitialization = !isInitialized();
        if (needsInitialization) {
            throwIfUninitialized = _.noop; // Allow other methods to work without throwing.
        }
        return needsInitialization;
    }

    function addEvent(eventName) {
        if (!Storeit.EventName[eventName]) {
            events.push(eventName);
            Storeit.EventName[eventName] = eventName;
        }
    }

    function typeCheckKey(key) {
        throwIfUninitialized();
        if (typeof key !== "string") {
            throw new StoreitError(StoreitError.invalidKey);
        }
    }

    function nskey(key, modifier) {
        return namespace + (modifier ? NS_SEPARATOR_CHAR + modifier : "") + ":" + key;
    }

    function ikey(key) {
        return nskey(key, "index"); // ex: mynamespace#index:primary
    }

    function mkey(key) {
        return nskey(key, "metadata"); // ex: mynamespace#metadata:123
    }

    function has(key) {
        typeCheckKey(key);
        return key in cache;
    }

    function getValue(key) {
        return cloneObject(cache[key].value);
    }

    function removeKeyFromCache(key) {
        var value = getValue(key);
        delete cache[key];
        return value;
    }

    function setIndex() {
        var keys = Object.keys(cache);
        return storageProvider.setMetadata(ikey("primary"), keys);
    }

    function removeKey(key) {
        if (has(key)) {
            var removedValue = removeKeyFromCache(key);

            var promise = storageProvider.removeItem(nskey(key));
            promise = promise.then(function () {
                storageProvider.removeItem(mkey(key));
            }).then(function () {
                return setIndex();
            });
            publish(EventName.removed, removedValue, key);

            return {
                action: Action.removed,
                key: key,
                value: removedValue,
                promise: promise
            };
        } else {
            throw new StoreitError(StoreitError.nonexistentKey);
        }
    }

    function setMetadata(key, value) {
        throwIfUndefined(value);
        cache[key].metadata = value;
        return storageProvider.setItem(mkey(key), value);
    }

    function setCache(key, value) {
        var results = {};
        if (has(key)) {
            var previousPartial;
            var partial;
            var currentValue = getValue(key);
            if (isObject(value) && isObject(currentValue)) {
                value = _.extend(cloneObject(currentValue), value); // Allow "patching" with partial value.
                partial = whatsDifferent(currentValue, value);
                previousPartial = previously(currentValue, partial);
            } else {
                partial = value;
                previousPartial = currentValue;
            }
            if (isEqual(currentValue, value)) {
                results.action = Action.none;
            } else {
                cache[key].value = cloneObject(value);
                publish(EventName.modified, partial, key, previousPartial);
                results.previousValue = previousPartial;
                results.action = Action.modified;
            }
        } else {
            cache[key] = {
                value: cloneObject(value),
                metadata: null
            };
            publish(EventName.added, cloneObject(value), key);
            results.action = Action.added;
        }
        results.key = key;
        results.value = value;
        return results;
    }

    function setSerializerName() {
        var data = {
            itemSerializer: storageProvider.itemSerializer
        };
        return storageProvider.setMetadata(namespace, data);
    }

    function setValue(key, value, metadata) {
        if (typeof key !== "string" && isObject(key)) {
            metadata = value;
            value = key;
            key = value[options.primaryKey];
        }
        throwIfUndefined(value);
        var results = setCache(key, value, metadata);
        var promise = Q.resolve();
        if (results.action === Action.added) {
            promise = setSerializerName().then(setIndex);
        }
        if (results.action !== Action.none) {
            promise = promise.then(function () {
                return storageProvider.setItem(nskey(key), results.value);
            });
        }
        if (metadata !== undefined) {
            promise = promise.then(function () {
                return setMetadata(key, metadata);
            });
            results.metadata = metadata;
        }

        results.promise = promise;

        promise.fail(function (err) { // Instead of `catch` for ES3 browsers.
            console.warn(err.message);
        });
        return results;
    }

    function getIndex() {
        return storageProvider.getMetadata(ikey("primary")).then(function (index) {
            return index || [];
        });
    }

    // Read in the base namespace key.
    function initializeItemSerializer(hasItems) {
        // If there is a itemSerializer specified, we MUST use it.
        // If existing data and no itemSerializer specified, this is an old JSON database,
        // so "fake" the compatible JSON serializer
        return storageProvider.getMetadata(namespace).then(function (providerInfo) { // TODO I hate this!
            var itemSerializerName = providerInfo ? providerInfo.itemSerializer :
                hasItems ? "JSONSerializer" : null;
            storageProvider.itemSerializer = itemSerializerName;
        });
    }

    function publishProxy() {
        publish.apply(null, arguments);
    }

    // Here are a few built-in methods and properties.
    that.clear = function () {
        var publishReady = initialize(); // Initialize only if needed and return true if initalization was performed.
        return getIndex().then(function (index) {
            var promises = [];
            index.forEach(function (key) { // Remove everything from provider, loaded or not.
                promises.push(storageProvider.removeItem(nskey(key)));
                promises.push(storageProvider.removeItem(mkey(key)));
            });

            return Q.all(promises).then(function () {
                // Publish and remove (or simply remove) each value from cache.
                Object.keys(cache).reverse().forEach(options.publishRemoveOnClear ? removeKey : removeKeyFromCache);
                return storageProvider.removeItem(ikey("primary")).then(function () {
                    storageProvider.removeItem(namespace).then(function () {
                        publish(EventName.cleared);
                        if (publishReady) {
                            originalPublish(EventName.ready);
                        }
                    }); // Remove the storageMetadata for the namespace.
                });
            });
        });
    };

    Object.defineProperty(that, "options", {
        get: function () {
            return options;
        },
        set: function (value) {
            _.extend(options, value);
            publish = options.publish ? originalPublish : fakePublish;
            publishProxy.when = publish.when; // So that mixins can use publish.when if they so desire.
        },
        enumerable: true
    });

    Object.defineProperty(that, "isInitialized", {
        get: isInitialized,
        enumerable: true
    });

    Object.defineProperty(that, "namespace", {
        value: namespace,
        enumerable: true
    });

    that.load = function () {
        throwIfUninitialized = _.noop; // Allow other methods to work without throwing.
        return getIndex().then(function (index) {
            return initializeItemSerializer(!!index.length).then(function () {
                var promises = [];
                index.forEach(function (key) { // For each key in "namespace#index:primary"...
                    promises.push(storageProvider.getItem(nskey(key)).then(function (value) {
                        setCache(key, value); // Build cache and publish an "added" events.
                    }));
                });
                return Q.all(promises).then(function () {
                    originalPublish(EventName.ready); // Publish even if options.publish is false.
                });
            });
        });
    };

    // Expose these internal functions to the mixins.
    var local = {
        has: has,
        getValue: getValue,
        setValue: setValue,
        setMetadata: setMetadata,
        removeKey: removeKey,
        publish: publishProxy,
        addEvent: addEvent
    };

    // Expose these internal properties.
    Object.defineProperty(local, "cache", {
        get: function () {
            throwIfUninitialized();
            return cache;
        },
        enumerable: true
    });

    // Mixin the rest of the methods.
    mixins.forEach(function (mixin) {
        mixin(that, local, Storeit);
    });

}

Storeit.Action = Action;
Storeit.EventName = EventName;
Storeit.StoreitError = StoreitError;

Storeit.createError = function (type) {
    return new StoreitError(StoreitError[type]);
};

Storeit.use = function (mixin) { // Allow third parties to write mixins for StoreIt!
    mixins.push(mixin);
};

module.exports = Storeit;
