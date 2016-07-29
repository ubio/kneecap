'use strict';

const http = require('http');
const EventEmitter = require('events').EventEmitter;

const noop = () => {};

module.exports = function createHttpRequest(headers, body) {
    const server = new http.Server();

    return new Promise((resolve) => {

        server.on('request', (req/*, res*/) => {
            resolve(req);
        });

        const socket = getSocket();
        socket._handle = {
            readStart: noop
        };
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
