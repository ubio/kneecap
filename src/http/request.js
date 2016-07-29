'use strict';

const http = require('http');
const EventEmitter = require('events').EventEmitter;

// const createHttpResponse = require('./response.js');

const server = new http.Server();
const noop = () => {};

module.exports = function createHttpRequest(headers, body) {
    return new Promise((resolve) => {
        server.on('request', handleServerRequest);

        const socket = getSocket();
        server.emit('connection', socket);
        socket.emit('data', headers);
        socket.emit('data', body);

        function handleServerRequest(req/*, res*/) {
            if (req.socket === socket) {
                server.removeListener('request', handleServerRequest);
                // const res = createHttpResponse(req, socket);
                resolve(req);
            }
        }
    });
};

function getSocket() {
    const socket = {
        setTimeout: noop,
        _writableState: {},
        _handle: {
            readStart: noop
        }
    };
    Object.assign(socket, EventEmitter.prototype);
    EventEmitter.call(socket);
    return socket;
}
