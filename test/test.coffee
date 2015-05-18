"use strict"

StoreIt = require("..") # load StoreIt!
StoreitError = StoreIt.StoreitError;

describe "StoreIt.StoreitError", ->
    describe "(before calling new)", ->
        it "exists as a static property", ->
            StoreitError.should.not.equal(undefined)
        it "exposes the correct types", ->
            StoreitError.should.have.property("loadUninitialized")
            StoreitError.should.have.property("undefinedValue")
            StoreitError.should.have.property("invalidNamespace")
            StoreitError.should.have.property("nonexistentKey")
            StoreitError.should.have.property("invalidKey")

    describe "(after calling new)", ->
        err = new StoreitError(StoreitError.invalidNamespace)

        it "should be an instance of StoreitError", ->
            (err instanceof StoreitError).should.equal(true)
        it "should expose a `name` property", ->
            err.should.have.property("name")
            err.name.should.equal("StoreitError")
        it "should expose a `type` property", ->
            err.should.have.property("name")
            err.type.should.equal("invalidNamespace")
        it "should expose a `message` property", ->
            err.should.have.property("message")
            err.message.should.equal("namespace can not contain a hash character (#).")
        it "should expose a `stack` property", ->
            err.should.have.property("message")

describe "StoreIt!", ->
    service = null

    beforeEach ->
        @storageProvider = {
            name: "TestProvider"
            metadataSerializer: "TestMetadataSerializer"
            itemSerializer: "TestItemSerializer"
        }
        @getItem = sinon.stub()
        @getItem.withArgs("testns:testkey1").returns("test")
        @getItem.withArgs("testns:testkey2").returns(null)
        @getItem.withArgs("testns:testkey5").returns("test")
        @getItem.withArgs("loadns:testkey5").returns("test")

        @setItem = sinon.stub()
        @removeItem = sinon.stub()

        @setMetadata = sinon.stub()
        @getMetadata = sinon.stub()
        @getMetadata.withArgs("testns").returns(null)
        @getMetadata.withArgs("testns#index:primary").returns([])
        @getMetadata.withArgs("loadns").returns(null)
        @getMetadata.withArgs("loadns#index:primary").returns(["testkey5"])

        @storageProvider.getMetadata = @getMetadata
        @storageProvider.setMetadata = @setMetadata

        @storageProvider.getItem = @getItem
        @storageProvider.setItem = @setItem
        @storageProvider.removeItem = @removeItem


    describe "with no pre-loaded data", ->
        beforeEach ->
            service = new StoreIt("testns", @storageProvider)
            service.load()

        it "implements the correct interface", ->
            service.should.respondTo("has")
            service.should.respondTo("get")
            service.should.respondTo("set")
            service.should.respondTo("metadata")
            service.should.respondTo("delete")
            service.should.respondTo("remove")
            service.should.respondTo("forEach")
            service.should.respondTo("clear")
            service.should.respondTo("load")
            service.should.respondTo("on")
            service.should.respondTo("off")
            service.should.respondTo("once")
            service.delete.should.equal(service.remove)

        it "should have an options property with correct defaults", ->
            service.options.publish.should.equal(true)

        it "should have a keys property with correct defaults", ->
            service.keys.should.be.an("array")
            service.keys.length.should.equal(0)

        it "should have a static enum Action with correct values", ->
            StoreIt.Action["none"].should.equal(0)
            StoreIt.Action["added"].should.equal(1)
            StoreIt.Action["modified"].should.equal(2)
            StoreIt.Action["removed"].should.equal(3)

        it "should have a static enum EventName with correct values", ->
            StoreIt.EventName["added"].should.equal("added")
            StoreIt.EventName["modified"].should.equal("modified")
            StoreIt.EventName["removed"].should.equal("removed")
            StoreIt.EventName["cleared"].should.equal("cleared")

        it "should throw a StoreitError when calling remove", ->
            (=>
                service.remove("key")
            ).should.throw(StoreitError)
#            ).should.throw(new StoreitError(StoreitError.nonexistentKey))

        describe "when calling has", ->

            it "on a valid key... should return true", ->
                service.set("testkey1", "test")
                @return = service.has("testkey1")
                @return.should.equal(true)
            it "on an invalid key... should return false", ->
                @return = service.has("testkey2")
                @return.should.equal(false)

        describe "when calling get", ->

            it "on a valid key... should return the correct value", ->
                @value = {foo: "foo"}
                service.set("testkey1", @value)
                @return = service.get("testkey1", "fun hater")
                @return.should.deep.equal(@value)
            it "on an invalid key... should return default value", ->
                @return = service.get("testkeyINVALID", "fun hater")
                @return.should.equal("fun hater")

        describe "when calling set", ->
            beforeEach ->
                @value = {foo: "foo"}
                @value2 = {foo: "bar"}
                @publishAdded = sinon.stub()
                service.on("added", @publishAdded)

                @publishModified = sinon.stub()
                service.on("modified", @publishModified)

                @result = service.set("testkey1", @value)
                @result2 = service.set("testkey1", @value2)
                @result3 = service.set("testkey1", @value2)

            afterEach ->
                service.off("added", @publishAdded)
                service.off("modified", @publishModified)

            it "hold call storageProvider.setItem with the object", ->
                @storageProvider.setItem.should.be.calledWith("testns:testkey1", @value)
            it "should publish a 'added' event", ->
                @publishAdded.should.have.been.called
            it "...with a CLONE of value", ->
                spyCall = @publishAdded.getCall(0)
                JSON.stringify(spyCall.args[0]).should.equal(JSON.stringify(@value))
                spyCall.args[0].should.not.equal(@value)
            it "should publish a 'modified' event (if key exists)", ->
                @publishModified.should.have.been.called
            it "should publish a 'modified' event (if key exists) with the proper arguments", ->
                spyCall = @publishModified.getCall(0)
                JSON.stringify(spyCall.args[0]).should.equal(JSON.stringify(@value2))
                spyCall.args[1].should.equal("testkey1")
                JSON.stringify(spyCall.args[2]).should.equal(JSON.stringify(@value))
                spyCall.args[0].should.not.equal(@value)
            it "should NOT publish (if key exists and value is unchanged)", ->
                @publishModified.should.have.been.calledOnce

            it "should return a proper result object", ->
                @result.should.have.property("key")
                @result.key.should.equal("testkey1")
                @result.should.have.property("value")
                @result.value.should.equal(@value)
                @result.should.have.property("action")
                @result.action.should.equal(StoreIt.Action.added)
                @result2.action.should.equal(StoreIt.Action.modified)
                @result3.action.should.equal(StoreIt.Action.none)

            it "should result in the correct value for keys", ->
                service.keys.length.should.equal(1)
                service.keys[0].should.equal("testkey1")

        describe "when calling set on a key that exists (object)", ->
            beforeEach ->
                @key = "testkey1"
                @value = {foo: "foo"}
                @results = service.set("testkey1", @value)

            describe "the returned results.key", ->
                it "should return the key", ->
                    @results.key.should.equal(@key)
                it "should return the value", ->
                    @results.value.should.eql(@value)

            describe "when setting a partial object with a new property", ->
                it "should result in an extended object with both properties", ->
                    service.set("testkey1", {bar: "bar"})
                    service.get("testkey1").should.eql({foo: "foo", bar: "bar"})

            describe "when setting a partial object with the same property, different value", ->
                it "should result in the property changed", ->
                    service.set("testkey1", {foo: "bar"})
                    service.get("testkey1").should.eql({foo: "bar"})

            describe "when setting the new value to a string", ->
                it "should result in the property changed", ->
                    service.set("testkey1", "foo")
                    service.get("testkey1").should.equal("foo")

            describe "when setting the new value to a number", ->
                it "should result in the property changed", ->
                    service.set("testkey1", 123)
                    service.get("testkey1").should.equal(123)

            describe "when setting the new value to an array", ->
                it "should result in the property changed", ->
                    service.set("testkey1", [1, 2, 3])
                    service.get("testkey1").should.eql([1, 2, 3])

        describe "when calling set on a key that exists (string)", ->
            beforeEach ->
                service.set("testkey1", "xxx")

            describe "when setting an object", ->
                it "should result in the setting the new object", ->
                    @value = {foo: "foo"}
                    service.set("testkey1", @value)
                    service.get("testkey1").should.eql(@value)

            describe "when setting the new value to a string", ->
                it "should result in the property changed", ->
                    @value = "foo"
                    service.set("testkey1", @value)
                    service.get("testkey1").should.equal(@value)

            describe "when setting the new value to a number", ->
                it "should result in the property changed", ->
                    @value = 123
                    service.set("testkey1", @value)
                    service.get("testkey1").should.equal(@value)

        describe "when calling set on a key that exists (array)", ->
            beforeEach ->
                service.set("testkey1", [1,2,3])

            describe "when setting an array", ->
                it "should result in the setting the new object", ->
                    @value = [4, 5, 6]
                    service.set("testkey1", @value)
                    service.get("testkey1").should.eql(@value)

            describe "when setting an object", ->
                it "should result in the setting the new object", ->
                    @value = {foo: "foo"}
                    service.set("testkey1", @value)
                    service.get("testkey1").should.eql(@value)

            describe "when setting the new value to a string", ->
                it "should result in the property changed", ->
                    @value = "foo"
                    service.set("testkey1", @value)
                    service.get("testkey1").should.equal(@value)

            describe "when setting the new value to a number", ->
                it "should result in the property changed", ->
                    @value = 123
                    service.set("testkey1", @value)
                    service.get("testkey1").should.equal(@value)

        describe "when calling set with a partial object", ->
            beforeEach ->
                service.set("testkey1", {foo: "foo"})
                @result = service.set("testkey1", {bar: "bar"})

            it "should return the entire object in results.value", ->
                @result.value.should.eql({foo: "foo", bar: "bar"})

            it "should write the serializer name to storageProvider", ->
                spyCall = @storageProvider.setMetadata.getCall(0)
                spyCall.args[0].should.equal("testns")
                JSON.stringify(spyCall.args[1]).should.equal(JSON.stringify({itemSerializer:null}))

            it "should write the index to storageProvider", ->
                # @storageProvider.setItem.should.be.calledWith("testns:testkey1", JSON.stringify({foo: "foo", bar: "bar"}))
                spyCall = @storageProvider.setMetadata.getCall(1)
                spyCall.args[0].should.equal("testns#index:primary")
                JSON.stringify(spyCall.args[1]).should.equal(JSON.stringify(["testkey1"]))

            it "should write the first object to storageProvider", ->
                spyCall = @storageProvider.setItem.getCall(0)
                spyCall.args[0].should.equal("testns:testkey1")
                JSON.stringify(spyCall.args[1]).should.equal(JSON.stringify({foo: "foo"}))

            it "should write the entire extended object to storageProvider", ->
                spyCall = @storageProvider.setItem.getCall(1)
                spyCall.args[0].should.equal("testns:testkey1")
                JSON.stringify(spyCall.args[1]).should.equal(JSON.stringify({foo: "foo", bar: "bar"}))

        describe "when accessing metadata", ->

            describe "on an INVALID key", ->
                it "should thow an exception", ->
                    (-> service.metadata("testkey1002")).should.throw(Error)

            describe "on a valid key", ->
                beforeEach ->
                    service.set("testkey1", "foo")
                    @metadata = service.metadata("testkey1")

                it "should return a proper object", ->
                    @metadata.should.have.property("get")
                    @metadata.should.have.property("set")

                describe "and when calling set with undefined", ->
                    it "should thow an exception", ->
                        (-> @metadata.set(undefined)).should.throw(Error)

                describe "and when calling set with a valid argument", ->
                    beforeEach ->
                        @value = 123
                        @metadata.set(@value)

                    it "should call storageProvider.setItem with JSON.stringified object", ->
                        @storageProvider.setItem.should.be.calledWith("testns#metadata:testkey1", @value)

                    describe "and a call to get", ->
                        it "should return the same value", ->
                            @metadata.get().should.equal(@value)

            describe "using the shorthand `set` syntax", ->
                beforeEach ->
                    @key = "testkey1"
                    @value = "bar"
                    @results = service.set(@key, "foo", @value)

                describe "the returned results.metadata", ->
                    it "should return the same value", ->
                        @results.metadata.should.equal(@value)

                describe "and a call to get", ->
                    it "should return the same value", ->
                        service.metadata(@key).get().should.equal(@value)

        describe "when calling delete", ->
            beforeEach ->
                @value = {foo: "foo"}
                @publishRemoved = sinon.stub()
                service.on("removed", @publishRemoved)

                service.set("testkey1", @value)
                @result = service.delete("testkey1")

            afterEach ->
                service.off("removed", @publishRemoved)

            it "should call storageProvider.removeItem with JSON.stringified object", ->
                @storageProvider.removeItem.should.be.calledWith("testns:testkey1")
                @storageProvider.removeItem.should.be.calledWith("testns#metadata:testkey1")
            it "should thow an exception when called with an invalid key", ->
                (-> service.delete("testkey1002")).should.throw(Error)
            it "should publish an 'removed' event passing the correct value", ->
                spyCall = @publishRemoved.getCall(0)
                JSON.stringify(spyCall.args[0]).should.equal(JSON.stringify(@value))
            it "should return a proper result object", ->
                @result.should.have.property("key")
                @result.key.should.equal("testkey1")
                @result.should.have.property("value")
                @result.value.should.deep.equal(@value)
                @result.should.have.property("action")
                @result.action.should.equal(StoreIt.Action.removed)

        describe "when calling forEach (with nothing set)", ->
            beforeEach ->
                @forEach = sinon.stub()
                service.forEach @forEach

            it "should do nothing when there are no items", ->
                @forEach.should.not.be.called

        describe "when calling forEach (with three items set)", ->
            beforeEach ->
                service.set("testkey1", 1)
                service.set("testkey2", 2)
                service.set("testkey3", 3)
                @forEach = sinon.stub()
                service.forEach @forEach

            it "should call the callback with arguments (value, key, obj)", ->
                spyCall = @forEach.getCall(0)
                spyCall.args[0].should.equal(1)
                spyCall.args[1].should.equal("testkey1")
                spyCall.args[2].should.equal(service)

            it "should call the callback once for each item", ->
                @forEach.should.have.been.calledThrice

        describe "when calling clear", ->
            beforeEach ->
                @publishReady = sinon.stub()
                service.on("ready", @publishReady)
                service.set("testkey1", 1)
                service.set("testkey2", 2)
                service.set("testkey3", 3)
                service.clear()

            afterEach ->
                service.off("ready", @publishReady)

            it "should call storageProvider.getItem for the index", ->
                spyCall = @getMetadata.getCall(0)
                spyCall.args[0].should.equal("testns#index:primary")

            it "should call storageProvider.removeItem for each item/metadata plus the index", ->
                spyCall = @removeItem.getCall(0)
                spyCall.args[0].should.equal("testns#index:primary")

                spyCall = @removeItem.getCall(1)
                spyCall.args[0].should.equal("testns")

                # spyCall = @removeItem.getCall(2)
                # spyCall.args[0].should.equal("testns#metadata:testkey5")

                # spyCall = @removeItem.getCall(3)
                # spyCall.args[0].should.equal("testns:testkey5")

            it "should result in an empty array for keys", ->
                @keys = service.keys
                @keys.length.should.equal(0)

            it "should NOT publish a 'ready' event", ->
                @publishReady.should.not.have.been.called


    describe "with one item of pre-loaded data", ->
        beforeEach ->
            @publishAdded = sinon.stub()
            service = new StoreIt("loadns", @storageProvider)
            service.on("added", @publishAdded)

        afterEach ->
            service.off("added", @publishAdded)

        describe "when calling load", ->
            beforeEach ->
                service.load()
            it "should have a keys property with correct defaults", ->
                service.keys.should.be.an("array")
                service.keys.length.should.equal(1)
            it "it should call storageProvider.getItem for the index and each item", ->
                spyCall = @getMetadata.getCall(0)
                spyCall.args[0].should.equal("loadns#index:primary")
                spyCall = @getItem.getCall(0)
                spyCall.args[0].should.equal("loadns:testkey5")
            it "items loaded should be available with has", ->
                service.has("testkey5").should.equal(true)
            it "items loaded should be available with get", ->
                service.get("testkey5").should.equal("test")
            it "should publish an 'added' event for each item", ->
                @publishAdded.should.be.calledWith("test", "testkey5")
            it "should NOT throw a StoreitError when calling remove", ->
                (=>
                    service.remove("testkey5")
                ).should.not.throw(StoreitError)

        describe "when calling set with options.publish = false", ->
            beforeEach ->
                service.options = {publish:false}
                service.load()

            it "should be publish nothing", ->
                @publishAdded.should.not.be.called

    describe "without calling `load`", ->
        beforeEach ->
            service = new StoreIt("testns", @storageProvider)

        it "should have `isInitialized` set to false", ->
            service.isInitialized.should.equal(false)

        it "should throw a StoreitError when calling has", ->
            (=>
                service.has("key")
            ).should.throw(StoreitError)
        it "should throw a StoreitError when calling get", ->
            (=>
                service.get("key")
            ).should.throw(StoreitError)
        it "should throw a StoreitError when calling set", ->
            (=>
                service.set("key", "value")
            ).should.throw(StoreitError)
        it "should throw a StoreitError when calling remove", ->
            (=>
                service.remove("key")
            ).should.throw(StoreitError)

        describe "then once we call load()", ->
            beforeEach ->
                @publishReady = sinon.stub()
                service.on("ready", @publishReady)
                service.load()

            afterEach ->
                service.off("ready", @publishReady)

            it "should have `isInitialized` set to true", ->
                service.isInitialized.should.equal(true)
            it "should publish a 'ready' event", ->
                @publishReady.should.have.been.called

        describe "then once we call clear()", ->
            beforeEach ->
                @publishReady = sinon.stub()
                service.on("ready", @publishReady)
                service.clear()

            afterEach ->
                service.off("ready", @publishReady)

            it "should have `isInitialized` set to true", ->
                service.isInitialized.should.equal(true)
            it "should publish a 'ready' event", ->
                @publishReady.should.have.been.called
