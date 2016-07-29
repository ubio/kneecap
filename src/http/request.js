'use strict';

const http = require('http');
const EventEmitter = require('events').EventEmitter;

const server = new http.Server();
const noop = () => {};

module.exports = function createHttpRequest(headers, body) {
    return new Promise((resolve) => {
        const socket = getSocket();

        server.on('request', handleServerRequest);

        function handleServerRequest(req/*, res*/) {
            if (req.socket === socket) {
                server.removeListener('request', handleServerRequest);
                resolve(req);
            }
        }

        server.emit('connection', socket);
        socket.emit('data', headers);
        socket.emit('data', body);
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
