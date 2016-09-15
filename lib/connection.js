'use strict';

const stream = require('stream');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const Session = require('./streams/Session.js');

module.exports = function connectionHandler(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => connected = false);
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

    const events = new EventEmitter();
    const sessionHandler = new Session();
    socket.pipe(getPrintStream('incoming')).pipe(sessionHandler).pipe(getPrintStream('outgoing')).pipe(socket);

    sessionHandler.on('session', handleIcapSession);
    sessionHandler.on('error', handleSessionError);

    return Object.freeze({
        events,
        isConnected: () => connected
    });

    function handleIcapSession(icapSession) {
        debug('session');
        events.emit('session', icapSession);
    }

    function handleSessionError(err) {
        debug('session error');
        events.emit('error', err);
    }
};

function getPrintStream(prefix) {
    return new stream.Transform({
        transform: (chunk, encoding, cb) => {
            console.log(`chunk for ${prefix}`);
            chunk.toString().split('\r\n').forEach(line => {
                console.log(`${prefix} ${line}`);
            });
            cb(null, chunk);
        }
    });
}
