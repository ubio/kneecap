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
            if (!returnValue) {
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
        const icapDetails = parser.parseIcapDetails(buffer.slice(0, idx));
        decoded = {
            icapDetails,
            encapsulated: {},
            previewMode: !!icapDetails.headers['preview'],
            allowContinue: false
        };
        encRegionIdx = 0;
        debug('new request', icapDetails.method, icapDetails.path);
        events.emit('icap-request', icapDetails);
        buffer = buffer.slice(idx + ICAP_HEADERS_DELIMITER.length);
        setState('read-encapsulated');
    }

    function readEncapsulatedSection() {
        const region = decoded.icapDetails.encapsulatedRegions[encRegionIdx];
        if (!region) {
            // NB: no region == no buffer!
            assert(buffer.length === 0, 'Unexpected buffer on read end');
            return finishRead();
        }

        const nextRegion = decoded.icapDetails.encapsulatedRegions[encRegionIdx + 1];
        if (nextRegion) {
            // case 1: region has explicit length (all -hdr should have this)
            const length = nextRegion.startOffset - region.startOffset;
            if (buffer.length < length) {
                // Read more data
                return false;
            }
            decoded.encapsulated[region.section] = buffer.slice(0, length);
            buffer = buffer.slice(length);
            debug(region.section);
            events.emit(region.section);
            // Read next encapsulated part
            encRegionIdx += 1;
            setState('read-encapsulated');
        } else {
            // case 2: last region (-body) is chunked and ends with terminator
            decoded.encapsulated[region.section] = Buffer.alloc(0);
            encRegionIdx += 1;
            setState('read-chunked-body');
        }
    }

    function readChunkedBody() {
        if (buffer.equals(ICAP_BODY_DELIMITER)) {
            // only allow continue if we're in preview mode
            decoded.allowContinue = decoded.previewMode;
            decoded.previewMode = false;
            buffer = Buffer.alloc(0);
            return finishRead();
        }
        if (buffer.equals(ICAP_PREVIEW_EOF_DELIMITER)) {
            decoded.previewMode = false;
            decoded.allowContinue = false;
            buffer = Buffer.alloc(0);
            return finishRead();
        }
        const chunkSeparatorIx = buffer.indexOf(CHUNK_SEPARATOR);
        if (chunkSeparatorIx === -1) {
            return false;
        }
        const chunkSize = parseInt(buffer.slice(0, chunkSeparatorIx).toString(), 16);
        if (chunkSize === 0) {
            // this should be a body terminator, demand more data!
            return false;
        }
        const chunkStartIx = chunkSeparatorIx + CHUNK_SEPARATOR.length;
        if (buffer.length < chunkStartIx + chunkSize) {
            return false;
        }
        const chunk = buffer.slice(chunkStartIx, chunkStartIx + chunkSize);
        appendBodyChunk(chunk);
        buffer = buffer.slice(chunkStartIx + chunk.length + CHUNK_SEPARATOR.length);
        setState('read-chunked-body');
    }

    function appendBodyChunk(chunk) {
        const bodyBuffer = decoded.encapsulated[decoded.icapDetails.bodyType];
        decoded.encapsulated[decoded.icapDetails.bodyType] = Buffer.concat([bodyBuffer, chunk]);
    }

    function finishRead() {
        debug('finish read');
        events.emit('end');
        // By default we accept new request after all encapsulated regions
        // are read. The exception is "100 Continue" which will
        // set a separate state.
        setState('new-request');
    }

};
