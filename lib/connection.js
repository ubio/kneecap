'use strict';

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const Session = require('./decoder.js');

module.exports = function createIcapConnection(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => connected = false);
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

    const events = new EventEmitter();
    const decoder = new Session(socket);
    socket.pipe(decoder);

    return Object.freeze({
        events,
        isConnected: () => connected
    });
};

