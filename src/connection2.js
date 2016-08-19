'use strict';

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const createDecoder = require('./decoder2.js');

module.export = function createIcapConnection(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => connected = false);
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

    const events = new EventEmitter();
    const decoder = createDecoder(socket, events);

    return Object.freeze({
        events
    });
};
