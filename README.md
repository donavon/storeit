Storeit!  [![Build Status](https://travis-ci.org/YuzuJS/storeit.svg)](https://travis-ci.org/YuzuJS/storeit)
=======

Storeit is a key/value storage system that publishes events. You can have multiple "stores". It supports different storage "providers" (ex: WebStorage) by means on dependency injection.

### Get the package
```
npm install storeit --save
```

### Live Demo

You can also see StoreIt in action, live, on the Interwebs! Check out this fiddle. <http://jsfiddle.net/donavon/Ljjxjbaz/>

## API

### Static and Object Definitions

#### `Storeit` (constructor)

**Storeit(namespace:string, storageProvider:Provider):Storeit**

In order to use StoreIt, you must instantiate an instance. It takes two required and one optional parameter as follows:

* **namespace**:string - the namespace for your store. Example: "album" or "grocery".
* **storageProvider**:Provider - Any of the storeit-provider-xxx providers. Currently the only provider is WebStorage.

Example:
````javascript
var Storeit = require("storeit");
var StoreitProvider = require("storeit-provider-webstorage");
var StoreitSerializer = require("storeit-serializer-json");

// Create a JSON serializer.
var jsonSerializer = new StoreitSerializer();

// Create a WebStorage provider that uses sessionStorage. 
var providerOptions = {
    localOrSessionStorage: window.sessionStorage,
    allSerializers: [jsonSerializer],
    metadataSerializerName: "JSONSerializer",
    preferredItemSerializerName: "JSONSerializer"
};
var sessionStorageProvider = new StoreitProvider(providerOptions);

// Create a store.
var groceryStore = new Storeit("grocery", sessionStorageProvider);
````

#### `Storeit.EventName`

Storeit.EventName is an enum containing the following actions:

* added
* modified
* removed

#### `Storeit.Action`

Storeit.Action is an enum containing the following actions. These are part of the `Result` object returned by
`store.set` and `store.delete`.

* none
* added
* modified
* removed

#### `Result`

A `Result` object has the following properties:

* **action:Action** - The action taken as one of the `Action` enum values. `Action` is a property on the static `Storeit`.
ex: `Storeit.Action.modified`.
* **key:string** - The key that was used.
* **value:Any** - The actual value stored (in case of `store.set`) or deleted (in the case of `store.remove`). This may or may not be the same as the `value` passed into `store.set`.
This may occur if you are setting a partial object. This is the value that would be returned on subsequent
calls to `store.get`.
In the case of a `store.remove`, `value` is the value that was deleted.

### `store` Methods

Once you have a store object (calling `new Store` as discussed above), you can use the following methods:

#### `store.has`

**store.has(key:string):Boolean**

Returns `true` if the key is found.


#### `store.set`

**store.set(key:string, value:Object):Result**

This will add (if the key does not exist) or modify (if it exists) an object in the store.

Where:

* **key:string** - The unique key that you wish to set.
* **value:Any** - The value that you wish to set. `value` may be an object, array, number, or a string.
You may pass a "partial" object that will "extend" into any existing object.

To tell if the operation added a new key, or modified an existing key, you can look at the `action` property of the returned `Result` object.

Example (assuming key does not exist):
```javascript
result = store.set("ID123", {foo:""});
// result.action = Storeit.Action.added
// result.key = "ID123"
// result.value is {foo:""}

result = store.set("ID123", {bar:""});
// result.action = Storeit.Action.modified
// result.key = "ID123"
// result.value is {foo:"", bar:""}
```

**Note:** This will also publish either an `EventName.added` or a `EventName.modified` event.

#### `store.get`

**store.get(key:string, defaultValue?:Any):Any**

This will get an object in the store that matches `key`. If no key exists, the `defaultValue` is returned.
If `defaultValue` is not specified, `undefined` is returned.

Where:

* **key:string** - The unique key that you wish to set.
* **defaultValue:Any** - The default value if the key is not found.

Example (assuming key does not exist):
```javascript
value = store.get("ID123"); // value is undefined
value = store.get("ID123", {foo: "bar"}); // value is an object {foo: "bar"}
```

#### `store.getAll`

**store.getAll():Any[]**

Returns an array of all objects in the store.

#### `store.getAllFilteredByProperty`

**store.getAllFilteredByProperty(propName:string, propValue:Any):Any[]**

Returns an array of all objects in the store filters by property. StoreIt will use the propName as the key and if it matches propValue, the value wil be included in the array.

Example:
```javascript
store.set("ID1", {id:"ID1", size:"large", color:"red"});
store.set("ID2", {id:"ID2", size:"small", color:"white"});
store.set("ID3", {id:"ID3", size:"large", color:"blue"});
store.set("ID4", {id:"ID4", size:"large", color:"red"});
var items = store.getAllFilteredByProperty("color", "red");
// [{id:"ID1", size:"large", color:"red"}, {id:"ID4", size:"large", color:"red"}]
```

#### `store.remove`

**store.remove(key:string):Result**

Removes a key from the store. If they key is not found, a "key doesn't exist" exception is thrown.
If the removal was successful, `Result.value` will contain the removed value.

**Note:** This will also publish a `EventName.removed` event.

#### `store.delete`

**store.delete(key:string):Result**

This is an ES5 friendly version of `store.remove`. Use only if your application will be running only on modern browser.

#### `store.forEach`

**store.forEach(callback:Function< key:string, value:Any >):Void**

Storeit will call `callback` once for each item in the store.

Example:
```javascript
store.forEach(function (key, value) {
    console.log('key="%s", value="%s"', key, value);
});
```

#### `store.clear`

**store.clear():Void**

Deletes all keys from the store.

**Note:** This will also publish a `EventName.removed` event for each item removed (you must set `Option.publishRemoveOnClear`) and a `cleared` event upon completion.

#### `store.load`

**store.load():Void**

Loads all keys from the store's data store. You MUST call `load` before using the store object.

**Note:** This will also publish a `EventName.added` event for each item loaded.

#### `store.on`

**store.on(eventName:EventName, callback:Function< value:Any, key:string >):Function**

Listens for published events.

Example:
```javascript
var EventName = Storeit.EventName;

function onModified(value, key) {
    console.log('You modified the key "%s"', key);
}

store.on(EventName.modified, onModified); // onModified will be called whenever any value in the store is modified.
```
The function returned by `on` is an unsubscribe function.

Example:
````javascript
var unsubscribe = store.on(EventName.modified, onModified);

// The following two lines are equivalent.
unsubscribe();
store.off(EventName.modified, onModified);
````

#### `store.once`

**store.once(eventName:EventName, callback:Function< value:Any, key:string >):Function**

Same as `store.on` but automatically removes the listener after the first event.
Just like in `on` above, the function returned by `on` is an unsubscribe function.

#### `store.off`

**store.off(eventName:EventName, callback:Function):Void**

Stops listening to published events.

Example:
```javascript
store.off(EventName.modified, onModified);
```

#### `store.onMatch`

**store.onMatch(pattern:string|RegExp, callback:Function< eventName:string, value:Any, key:string >):Function**

Listens for multiple events. The pattern may be either a wildcard string or a Regular Expression.

Example:
````javascript
store.onMatch("*", function (eventName, value, key) {
    console.log("event=%s, key=%s, value=", eventName, key, value);
});
````

### `store` Properties

#### `store.isInitialized`

**store.isInitialized:Boolean**

Set to `true` if you have called `store.load` or `store.clear`, otherwise `false`.

#### `store.keys`

**store.keys:string[]**

An array representing every key in the store.

#### `store.namespace`

**store.namespace:string**

The namespace that you passed to the constructor.

#### `store.options`

**store.options:Options**

Where `Options` has the following properties:

* **publish:Boolean** - Speified whether this store should publish events. (default = `true`)
* **publishRemoveOnClear:Boolean** - Speified whether `EventName.removed` events are published for each item when calling `store.clear`. (default = `false`)


## License

For use under [MIT license](http://github.com/YuzuJS/storeit/raw/master/LICENSE)
