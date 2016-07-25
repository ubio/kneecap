'use strict';

const EventEmitter = require('events').EventEmitter;
const Buffer = require('buffer').Buffer;

const requestConstructor = require('./request.js');
const responseConstructor = require('./response.js');

module.exports = function constructor(socket) {
    socket.on('close', handleSocketClose);
    socket.on('data', handleSocketData);

    const connectionId = Math.random();
    const HEADER_ISTAG = `"istag-${connectionId}"`;
    const events = new EventEmitter();
    let received = new Buffer(0);
    let _lastDecodedRequest = null;

    return Object.freeze({
        events,
        respond
    });

    function handleSocketClose(hadError) {
        console.log(`socket closed${hadError ? ' with error ' + hadError : ''}`);
        socket.removeListener('data', handleSocketData);
        socket.removeListener('close', handleSocketClose);
        received = null;
        socket.destroy();
    }

    function handleSocketData(data) {
        received = Buffer.concat([received, data]);

        const request = requestConstructor(received);
        if (request.done) {
            _lastDecodedRequest = request;
            events.emit(request.method, request);
        }
    }

    function respond(responseData) {
        const response = {
            statusCode: undefined,
            statusText: undefined,
            icapHeaders: new Map([['ISTag', HEADER_ISTAG], ['Date', new Date().toGMTString()]]),
            payload: new Map()
        };
        if (!responseData) {
            if (_lastDecodedRequest.is204Allowed) {
                response.statusCode = 204;
                response.statusText = 'No Content';
            } else {
                // Send the whole response back
                response.statusCode = 200;
                response.statusText = 'OK';
                response.payload = _lastDecodedRequest.encapsulated;
            }
        } else {
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
        }
        const responseString = responseConstructor(response).toString();
        console.log('responseString', responseString);
        socket.end(responseString);
    }
};
