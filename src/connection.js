'use strict';

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
        hasPreview,
        getPreview,
        waitForEncapsulated,
        isContinueAllowed,
        getFullBody,
        respond,
        dontChange,
        badRequest
    };

    function hasEncapsulated(section) {
        return getIcapDetails().encapsulatedRegions
            .some(region => region.section === section);
    }

    function hasPreview() {
        return getIcapDetails().headers.has('preview');
    }

    function getPreview() {
        const bodyType = getIcapDetails().bodyType;
        if (bodyType === 'null-body') {
            return Promise.resolve();
        }
        if (isReadFinished()) {
            return Promise.resolve(getDecodedEncapsulated(bodyType));
        }
        return waitForEncapsulated(bodyType);
    }

    function waitForEncapsulated(section) {

        if (!hasEncapsulated(section)) {
            return Promise.resolve(Buffer.alloc(0));
        }

        const data = getDecodedEncapsulated(section);
        if (data) {
            return Promise.resolve(data);
        }

        return new Promise((resolve, reject) => {
            socket.on('close', onSocketClosed);
            events.on(section, onSectionParsed);

            function onSectionParsed() {
                cleanup();
                resolve(getDecodedEncapsulated(section));
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

    function getDecodedEncapsulated(section) {
        return decoder.getDecodedMessage().encapsulated[section];
    }

    function getFullBody() {
        const bodyType = getIcapDetails().bodyType;
        if (bodyType === 'null-body') {
            return Promise.resolve();
        }
        return Promise.resolve()
            .then(() => new Promise(resolve => {
                if (isReadFinished()) {
                    if (isContinueAllowed()) {
                        events.on('end', onFullBodyRead);
                        return sendContinue();
                    }
                    return resolve(getDecodedEncapsulated(bodyType));
                }
                return waitAndAskForMore();

                function waitAndAskForMore() {
                    events.once('end', () => {
                        if (isContinueAllowed()) {
                            events.on('end', onFullBodyRead);
                            return sendContinue();
                        }
                        return resolve(getDecodedEncapsulated(bodyType));
                    });
                }

                function onFullBodyRead() {
                    events.removeListener('end', onFullBodyRead);
                    resolve(getDecodedEncapsulated(bodyType));
                }

                function sendContinue() {
                    decoder.setState('read-chunked-body');
                    respond({
                        statusCode: 100,
                        statusText: 'Continue'
                    });
                }

            }));
    }

    function badRequest() {
        return respond({
            statusCode: 400,
            statusText: 'Bad Request'
        });
    }

    function dontChange() {
        const allow = getIcapDetails().headers.get('allow') || '';
        if (allow.includes('204')) {
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
                return respond({
                    statusCode: 200,
                    statusText: 'OK',
                    payload: objectToMap(decoder.getDecodedMessage().encapsulated)
                });
            });
    }

    function respond(spec) {
        const buffer = createResponse(spec).toBuffer();
        socket.write(buffer);
    }

    function getIcapDetails() {
        return decoder.getDecodedMessage().icapDetails;
    }

    function isContinueAllowed() {
        return decoder.getDecodedMessage().allowContinue;
    }

    /**
     * Based on the decoder's state, signifies whether there is more
     * incoming data or not.
     *
     * This will return true if one of:
     * - waiting for a new request (previous session done)
     * - preview done (but haven't sent `100 Continue` or replied)
     */
    function isReadFinished() {
        return decoder.getState() === 'new-request';
    }

};

function objectToMap(obj) {
    return Object.keys(obj).reduce((map, key) => {
        map.set(key, obj[key]);
        return map;
    }, new Map());
}

