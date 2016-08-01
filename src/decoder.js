'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');
const ICAP_PREVIEW_EOF_DELIMITER = Buffer.from('0; ieof\r\n\r\n');
const ICAP_BODY_DELIMITER = Buffer.from('0\r\n\r\n');

const CHUNK_SEPARATOR = Buffer.from('\r\n');

const parser = require('./parser');
const debug = require('debug')('icap:decoder');
const assert = require('assert');

/**
 * Reads socket data and emits `events`:
 *
 * * error — unrecoverable error (socket will be closed)
 * * icap-request — ICAP request headers are read and parsed
 * * end — socket read operation is finished, emitted in three conditions:
 *
 *         1) no preview and all encapsulated body is parsed
 *         2) preview + encapsulated preview is parsed
 *         3) preview + 100 continue sent + rest of body is parsed
 */
module.exports = function createDecoder(socket, events) {

    let state = 'new-request';
    let buffer = Buffer.alloc(0);
    let decoded = null;

    let encRegionIdx = 0;

    socket.on('data', onData);

    return {
        getDecodedMessage,
        getState,
        setState
    };

    function getDecodedMessage() {
        assert(decoded, 'ICAP request not decoded');
        return decoded;
    }

    function getState() {
        return state;
    }

    function setState(newState) {
        state = newState;
    }

    function onData(data) {
        buffer = Buffer.concat([buffer, data]);
        decode();
    }

    function decode() {
        try {
            const returnValue = handleCurrentState();
            if (returnValue === false) {
                // need more data
                return;
            }
            // TODO check that buffer is consumed!
        } catch (e) {
            // Decoder errors are unrecoverable (socket is closed)
            buffer = Buffer.alloc(0);
            events.emit('error', e);
            socket.close();
        }
        // Impl. note: decoders should fully consume buffer
        if (buffer.length) {
            decode();
        }
    }

    function handleCurrentState() {
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
        const icapDetails = parser.parseIcapDetails(consume(idx));
        consume(ICAP_HEADERS_DELIMITER.length);
        decoded = {
            icapDetails,
            encapsulated: {},
            previewMode: icapDetails.headers.has('preview'),
            allowContinue: false
        };
        encRegionIdx = 0;
        debug('new request', icapDetails.method, icapDetails.path);
        setState('read-encapsulated');
        events.emit('icap-request', icapDetails);
    }

    function readEncapsulatedSection() {
        const region = decoded.icapDetails.encapsulatedRegions[encRegionIdx];
        if (!region) {
            return finishRead();
        }

        const nextRegion = decoded.icapDetails.encapsulatedRegions[encRegionIdx + 1];
        if (nextRegion) {
            // case 1: region has explicit length (all -hdr, basically)
            const length = nextRegion.startOffset - region.startOffset;
            if (buffer.length < length) {
                // Read more data
                return false;
            }
            decoded.encapsulated[region.section] = consume(length);
            debug(region.section);
            events.emit(region.section);
            // read next encapsulated part
            encRegionIdx += 1;
            setState('read-encapsulated');
        } else if (region.section === 'null-body') {
            // case 2: null body
            return finishRead();
        } else {
            // case 3: last region (-body) is chunked and ends with terminator
            decoded.encapsulated[region.section] = Buffer.alloc(0);
            encRegionIdx += 1;
            setState('read-chunked-body');
        }
    }

    function readChunkedBody() {
        if (isAt(ICAP_BODY_DELIMITER)) {
            consume(ICAP_BODY_DELIMITER.length);
            // only allow continue if we're in preview mode
            decoded.allowContinue = decoded.previewMode;
            return finish();
        }
        if (isAt(ICAP_PREVIEW_EOF_DELIMITER)) {
            consume(ICAP_PREVIEW_EOF_DELIMITER.length);
            decoded.allowContinue = false;
            return finish();
        }

        // Extract chunk size
        const chunkSeparatorIx = buffer.indexOf(CHUNK_SEPARATOR);
        if (chunkSeparatorIx === -1) {
            return false;
        }
        const chunkSize = parseInt(buffer.slice(0, chunkSeparatorIx).toString(), 16);
        if (chunkSize === 0) {
            // this should be a body terminator, demand more data!
            return false;
        }

        // Extract chunk itself
        const remaining = buffer.slice(chunkSeparatorIx + CHUNK_SEPARATOR.length);
        if (remaining.length < chunkSize) {
            return false;
        }
        appendBodyChunk(remaining.slice(0, chunkSize));

        // Now we can finally shrink our buffer
        consume(chunkSeparatorIx + CHUNK_SEPARATOR.length + chunkSize + CHUNK_SEPARATOR.length);

        // Continue
        setState('read-chunked-body');

        function finish() {
            decoded.previewMode = false;
            const bodyType = decoded.icapDetails.bodyType;
            debug(bodyType);
            events.emit(bodyType);
            return finishRead();
        }
    }

    function appendBodyChunk(chunk) {
        const bodyBuffer = decoded.encapsulated[decoded.icapDetails.bodyType];
        decoded.encapsulated[decoded.icapDetails.bodyType] = Buffer.concat([bodyBuffer, chunk]);
    }

    function finishRead() {
        // By default we accept new request after all encapsulated regions
        // are read. The exception is "100 Continue" which will
        // set a separate state.
        setState('new-request');
        debug('finish read');
        events.emit('end');
    }

    function consume(length) {
        const result = buffer.slice(0, length);
        assert(result.length === length,
            'Insufficient data! Please fix decoder by checking that data is available.');
        buffer = buffer.slice(length);
        return result;
    }

    function isAt(prefix) {
        return buffer.slice(0, prefix.length).equals(prefix);
    }
    
};
