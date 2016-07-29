'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');
const ICAP_PREVIEW_EOF_DELIMITER = Buffer.from('0; ieof\r\n\r\n');
const ICAP_BODY_DELIMITER = Buffer.from('0\r\n\r\n');

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:session');

const parser = require('./parser');

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
    
    // decoder state
    let state = 'new-request';
    let buffer = Buffer.alloc(0);
    let parsed = null;
    let encRegionIdx = 0;

    socket.on('data', decode);
    
    return {
        events,
        hasEncapsulated,
        waitForEncapsulated
    };

    function assertParsed() {
        assert(parsed, 'Illegal state: ICAP request not parsed');
    }
    
    function hasEncapsulated(section) {
        assertParsed();
        return parsed.icapDetails.encapsulatedRegions
            .some(region => region.section === section);
    }

    function waitForEncapsulated(section) {
        assertParsed();

        if (!hasEncapsulated(section)) {
            return Promise.resolve(Buffer.alloc(0));
        }

        const data = parsed.encapsulated[section];
        if (data) {
            return Promise.resolve(data);
        }

        return new Promise((resolve, reject) => {
            socket.on('close', onSocketClosed);
            events.on(section, onSectionParsed);

            function onSectionParsed(data) {
                cleanup();
                resolve(data);
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
    
    function decode(newData) {
        buffer = Buffer.concat([buffer, newData]);
        try {
            const newState = handleCurrentState();
            if (!newState) {
                // need more data
                return;
            }
            state = newState;
        } catch (e) {
            // Decoder errors are unrecoverable (socket is closed)
            buffer = Buffer.alloc(0);
            events.emit('error', e);
            socket.close();
            return;
        }
        // Impl. note: decoders should fully consume buffer
        if (buffer.length) {
            decode(newData);
        }
    }
    
    function handleCurrentState() {
        debug('decode: ' + state);
        switch (state) {
            case 'new-request':
                return readIcapDetails();
            case 'read-encapsulated':
                return readEncapsulatedSection();
            case 'read-chunked-body':
                return readChunkedBody();
            default:
                throw new Error('Illegal state: ' + state);
        }
    }
    
    function readIcapDetails() {
        const idx = buffer.indexOf(ICAP_HEADERS_DELIMITER);
        if (idx === -1) {
            return false;
        }
        parsed = {
            icapDetails: parser.parseIcapDetails(buffer.slice(0, idx)),
            encapsulated: {}
        };
        events.emit('icap-request', parsed.icapDetails);
        buffer = buffer.slice(idx + ICAP_HEADERS_DELIMITER.length);
        encRegionIdx = 0;
        return 'read-encapsulated';
    }

    function readEncapsulatedSection() {
        assertParsed();

        const region = parsed.icapDetails.encapsulatedRegions[encRegionIdx];
        if (!region) {
            // NB: no region == no buffer!
            assert(buffer.length === 0, 'Unexpected buffer on read end');
            finishRead();
            // By default we accept new request after all encapsulated regions
            // are read. The exception is "100 Continue" which will
            // set a separate state.
            return 'new-request';
        }
        
        const nextRegion = parsed.icapDetails.encapsulatedRegions[encRegionIdx + 1];
        if (nextRegion) {
            // case 1: region has explicit length (all -hdr should have this)
            const length = nextRegion.startOffset - region.startOffset;
            if (buffer.length < length) {
                // Read more data
                return false;
            }
            parsed.encapsulated[region.section] = buffer.slice(0, length);
            buffer = buffer.slice(length);
            // Read next encapsulated part
            encRegionIdx += 1;
            return 'read-encapsulated';
        }
        // case 2: last region (-body) is chunked and ends with terminator
        encRegionIdx += 1;
        return 'read-chunked-body';
    }
    
    function readChunkedBody() {
        assertParsed();

        throw new Error('Not implemented');
    }

    function finishRead() {
        debug('finish read');
        events.emit('end');
    }
    
};


