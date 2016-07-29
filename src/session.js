'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:session');

const createDecoder = require('./decoder');

/**
 * Low-level I/O handler for decoding requests and
 * sending responses.
 */
module.exports = function createSession(socket) {
    debug('new session');

    /**
     * Events:
     * 
     * * error — unrecoverable error (socket will be closed)
     * * icap-request — ICAP request headers are read and parsed
     * * end — socket read operation is finished, emitted in three conditions:
     * 
     *         1) no preview and all encapsulated body is parsed
     *         2) preview + encapsulated preview is parsed
     *         3) preview + 100 continue sent + rest of body is parsed
     */
    const events = new EventEmitter();
    
    const decoder = createDecoder(socket, events);
    
    return {
        events,
        hasEncapsulated,
        waitForEncapsulated
    };
    
    function getDecodedMessage() {
        return decoder.getDecodedMessage();
    }
    
    function hasEncapsulated(section) {
        return getDecodedMessage().icapDetails.encapsulatedRegions
            .some(region => region.section === section);
    }

    function waitForEncapsulated(section) {

        if (!hasEncapsulated(section)) {
            return Promise.resolve(Buffer.alloc(0));
        }

        const data = getDecodedMessage().encapsulated[section];
        if (data) {
            return Promise.resolve(data);
        }

        return new Promise((resolve, reject) => {
            socket.on('close', onSocketClosed);
            events.on(section, onSectionParsed);

            function onSectionParsed() {
                cleanup();
                resolve(getDecodedMessage().encapsulated[section]);
            }

            function onSocketClosed() {
                cleanup();
                reject(new Error('Socket closed while waiting for ' + section));
            }

            function cleanup() {
                socket.removeListener('close', onSocketClosed);
                events.removeListener(section, onSectionParsed);
            }

        });
    }
    
};


