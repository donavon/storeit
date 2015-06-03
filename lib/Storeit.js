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
        publishRemoveOnClear: false
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

    function removeKey(key) {
        if (has(key)) {
            var removedValue = removeKeyFromCache(key);
            storageProvider.removeItem(nskey(key));
            storageProvider.removeItem(mkey(key));
            publish(EventName.removed, removedValue, key);

            setIndex();
            return {
                action: Action.removed,
                key: key,
                value: removedValue
            };
        } else {
            throw new StoreitError(StoreitError.nonexistentKey);
        }
    }

    function setMetadata(key, value) {
        throwIfUndefined(value);
        cache[key].metadata = value;
        storageProvider.setItem(mkey(key), value);
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
                cache[key].value = value;
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

    function setValue(key, value, metadata) {
        throwIfUndefined(value);
        var results = setCache(key, value, metadata);
        if (results.action === Action.added) {
            setSerializerName();
            setIndex();
        }
        if (results.action !== Action.none) {
            storageProvider.setItem(nskey(key), results.value);
        }
        if (metadata !== undefined) {
            setMetadata(key, metadata);
            results.metadata = metadata;
        }
        return results;
    }

    function getIndex() {
        return storageProvider.getMetadata(ikey("primary")) || [];
    }

    function setIndex() {
        var keys = Object.keys(cache);
        storageProvider.setMetadata(ikey("primary"), keys);
    }

    // Read in the base namespace key.
    function initializeItemSerializer(hasItems) {
        // Is there is a itemSerializer specified, we MUST use it.
        // If existing data and no itemSerializer specified, this is an old JSON database,
        // so "fake" the compatible JSON serializer
        var providerInfo = storageProvider.getMetadata(namespace); // TODO I hate this!
        var itemSerializerName = providerInfo ? providerInfo.itemSerializer :
            hasItems ? "JSONSerializer" : null;
        storageProvider.itemSerializer = itemSerializerName;
    }

    function setSerializerName() {
        var data = {
            itemSerializer: storageProvider.itemSerializer
        };
        storageProvider.setMetadata(namespace, data);
    }

    function publishProxy() {
        publish.apply(null, arguments);
    }

    // Here are a few built-in methods and properties.
    that.clear = function () {
        var publishReady = initialize(); // Initialize only if needed and return true if initalization was performed.
        getIndex().forEach(function (key) { // Remove everything from provider, loaded or not.
            storageProvider.removeItem(nskey(key));
            storageProvider.removeItem(mkey(key));
        });
        // Publish and remove (or simply remove) each value from cache.
        Object.keys(cache).reverse().forEach(options.publishRemoveOnClear ? removeKey : removeKeyFromCache);
        storageProvider.removeItem(ikey("primary"));
        storageProvider.removeItem(namespace); // Remove the storageMetadata for the namespace.
        publish(EventName.cleared);
        if (publishReady) {
            originalPublish(EventName.ready);
        }
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
        var index = getIndex();
        initializeItemSerializer(!!index.length);
        index.forEach(function (key) { // For each key in "namespace#index:primary"...
            var value = storageProvider.getItem(nskey(key));
            setCache(key, value); // Build cache and publish an "added" events.
        });
        originalPublish(EventName.ready); // Publish even if options.publish is false.
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
