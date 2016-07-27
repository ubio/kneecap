'use strict';

const EventEmitter = require('events').EventEmitter;
const Buffer = require('buffer').Buffer;

const requestConstructor = require('./request.js');
const responseConstructor = require('./response.js');

module.exports = function constructor(socket) {
    socket.on('close', handleSocketClose);
    socket.on('data', handleSocketData);

    const id = Math.random();
    const HEADER_ISTAG = `"istag-${id}"`;
    const events = new EventEmitter();
    let internalRequestPending = false;
    let received = new Buffer(0);
    let _lastDecodedRequest = null;

    const connection = Object.freeze({
        events,
        respond,
        getFullBody,
        id
    });
    return connection;

    function resetConnection() {
        received = new Buffer(0);
        _lastDecodedRequest = null;
        internalRequestPending = false;
    }

    function handleSocketClose(hadError) {
        console.log(`socket closed ${hadError ? 'with error' : 'gracefully'}`);
        socket.removeListener('data', handleSocketData);
        socket.removeListener('close', handleSocketClose);
        received = null;
        socket.destroy();
    }

    function handleSocketData(data) {
        received = Buffer.concat([received, data]);

        const request = requestConstructor(received, connection);
        if (request.done) {
            _lastDecodedRequest = request;
            if (internalRequestPending) {
                console.log(data.toString());
                events.emit('_internal', request);
            } else {
                events.emit(request.method, request);
            }
        }
    }

    function getFullBody() {
        internalRequestPending = true;
        return Promise.resolve()
            .then(() => {
                respond({
                    statusCode: 100,
                    statusText: 'Continue'
                });
                return new Promise(resolve => {
                    events.on('_internal', resolve);
                });
            })
            .then(() => {
                console.log('after _internal', _lastDecodedRequest);
                resetConnection();
            });
    }

    function respond(responseData) {
        if (!responseData) {
            if (_lastDecodedRequest.is204Allowed) {
                const response = getResponseTemplate();
                response.statusCode = 204;
                response.statusText = 'No Content';

                const responseString = responseConstructor(response).toString();
                if (!internalRequestPending) {
                    resetConnection();
                }
                return socket.write(responseString);
            }
            // Send the whole response back
            responseData = {
                statusCode: 200,
                statusText: 'OK',
                reqHeaders: _lastDecodedRequest.getRequestHeaders(),
                reqBody: _lastDecodedRequest.getRequestBody()
            };
        }
        return resolveObjectProps(responseData)
            .then(responseData => {
                const response = getResponseTemplate();
                response.statusCode = responseData.statusCode;
                response.statusText = responseData.statusText;
                if ('undefined' !== typeof responseData.icapHeaders) {
                    responseData.icapHeaders.forEach((value, key) => {
                        response.icapHeaders.set(key, value);
                    });
                }
                if ('undefined' !== typeof responseData.optBody) {
                    response.payload.set('opt-body', responseData.optBody);
                }
                if ('undefined' !== typeof responseData.reqHeaders) {
                    response.payload.set('req-hdr', responseData.reqHeaders);
                }
                if ('undefined' !== typeof responseData.reqBody) {
                    response.payload.set('req-body', responseData.reqBody);
                }
                if ('undefined' !== typeof responseData.resHeaders) {
                    response.payload.set('res-hdr', responseData.resHeaders);
                }
                if ('undefined' !== typeof responseData.resBody) {
                    response.payload.set('res-body', responseData.resBody);
                }
                // TODO(me): determine if this is the final response.
                if (!internalRequestPending) {
                    resetConnection();
                }
                const responseString = responseConstructor(response).toString();
                socket.write(responseString);
            });
    }

    function getResponseTemplate() {
        return {
            statusCode: undefined,
            statusText: undefined,
            icapHeaders: new Map([['ISTag', HEADER_ISTAG], ['Date', new Date().toGMTString()]]),
            payload: new Map()
        };
    }
};

/**
 * Resolve each pending promise property
 *
 * @param {Object} obj - object containing pending promises as props
 * @returns {Promise}
 */
function resolveObjectProps(obj) {
    if (!obj) {
        return Promise.resolve(obj);
    }
    return Promise.all(Object.keys(obj)
        .map(key => Promise.resolve(obj[key])
            .then(val => [key, val]))
    )
        .then(all => all.reduce((prev, curr) => (prev[curr[0]] = curr[1], prev), {}));
}
