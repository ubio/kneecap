'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const createDecoder = require('./decoder');
const createResponse = require('./response.js');

/**
 * Low-level I/O handler for decoding requests and
 * sending responses.
 */
module.exports = function createConnection(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => {
        connected = false;
    });
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

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
        isClosed,
        hasEncapsulated,
        hasPreview,
        getPreview,
        waitForEncapsulated,
        isContinueAllowed,
        getFullBody,
        respond,
        dontChange,
        badRequest
    };

    function isClosed() {
        return connected === false;
    }

    function hasEncapsulated(section) {
        assertConnected();
        return getIcapDetails().encapsulatedRegions
            .some(region => region.section === section);
    }

    function hasPreview() {
        assertConnected();
        return getIcapDetails().headers.has('preview');
    }

    function getPreview() {
        assertConnected();
        const bodyType = getIcapDetails().bodyType;
        if (bodyType === 'null-body') {
            return Promise.resolve();
        }
        return waitForEncapsulated(bodyType);
    }

    function waitForEncapsulated(section) {
        assertConnected();

        if (!hasEncapsulated(section)) {
            return Promise.resolve(Buffer.alloc(0));
        }

        const data = getDecodedEncapsulated(section);
        if (data) {
            return Promise.resolve(data);
        }

        return new Promise((resolve, reject) => {
            socket.on('close', onSocketClosed);
            events.on('error', onSocketError);
            events.on(section, onSectionParsed);

            function onSectionParsed() {
                cleanup();
                resolve(getDecodedEncapsulated(section));
            }

            function onSocketClosed() {
                cleanup();
                reject(new Error('Socket closed while waiting for ' + section));
            }

            function onSocketError() {
                cleanup();
                reject(new Error('Socket emitted error while waiting for ' + section));
            }

            function cleanup() {
                socket.removeListener('close', onSocketClosed);
                events.removeListener('error', onSocketError);
                events.removeListener(section, onSectionParsed);
            }

        });
    }

    function getDecodedEncapsulated(section) {
        assertConnected();
        return decoder.getDecodedMessage().encapsulated[section];
    }

    function getFullBody() {
        assertConnected();
        const bodyType = getIcapDetails().bodyType;
        if (bodyType === 'null-body') {
            return Promise.resolve();
        }
        return waitForEncapsulated(bodyType)
            .then(parsedBody => isContinueAllowed() ? continueAndWait() : parsedBody);

        function continueAndWait() {
            return new Promise((resolve, reject) => {
                assertConnected();
                // 100 Continue
                respond({
                    statusCode: 100,
                    statusText: 'Continue'
                });
                // set decoder to append to current body
                decoder.acceptBody();
                events.on('end', onFullBodyRead);
                socket.on('close', onSocketClosed);
                events.on('error', onSocketError);

                function onFullBodyRead() {
                    cleanup();
                    // set decoder back to accept new requests
                    decoder.acceptNewRequest();
                    resolve(getDecodedEncapsulated(bodyType));
                }

                function onSocketClosed() {
                    cleanup();
                    reject(new Error('Socket closed while waiting for full body'));
                }

                function onSocketError() {
                    cleanup();
                    reject(new Error('Socket emitted error while waiting for full body'));
                }

                function cleanup() {
                    events.removeListener('end', onFullBodyRead);
                    socket.removeListener('close', onSocketClosed);
                    events.removeListener('error', onSocketError);
                }

            });
        }
    }

    function badRequest() {
        assertConnected();
        return respond({
            statusCode: 400,
            statusText: 'Bad Request'
        });
    }

    function dontChange() {
        assertConnected();
        const allow = getIcapDetails().headers.get('allow') || '';
        if (allow.includes('204') || hasPreview()) {
            return respond({
                statusCode: 204,
                statusText: 'No Content'
            });
        }
        const promises = Object.keys(decoder.getDecodedMessage().encapsulated)
            .filter(section => section.indexOf('-hdr') > -1)
            .map(section => waitForEncapsulated(section));
        const bodyType = getIcapDetails().bodyType;
        if (bodyType !== 'null-body') {
            promises.push(getFullBody());
        }
        return Promise.all(promises)
            .then(() => {
                const response = objectToMap(decoder.getDecodedMessage().encapsulated);
                if (response.has('res-hdr')) {
                    response.delete('req-hdr');
                    response.delete('req-body');
                }
                return respond({
                    statusCode: 200,
                    statusText: 'OK',
                    payload: response
                });
            });
    }

    function respond(spec) {
        assertConnected();
        const buffer = createResponse(spec).toBuffer();
        socket.write(buffer);
    }

    function getIcapDetails() {
        assertConnected();
        return decoder.getDecodedMessage().icapDetails;
    }

    function isContinueAllowed() {
        assertConnected();
        return decoder.getDecodedMessage().allowContinue;
    }

    function assertConnected() {
        assert(connected, 'Connection already closed.');
    }

};

function objectToMap(obj) {
    return Object.keys(obj).reduce((map, key) => {
        map.set(key, obj[key]);
        return map;
    }, new Map());
}

