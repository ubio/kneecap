'use strict';

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const Session = require('./Session.js');

module.exports = function createIcapConnection(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => connected = false);
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

    const events = new EventEmitter();
    const sessionDecoder = new Session(socket);
    socket.pipe(sessionDecoder);

    sessionDecoder.on('request', handleSession);

    return Object.freeze({
        events,
        isConnected: () => connected
    });

    function handleSession(decoded) {
    }
};

