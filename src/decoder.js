'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');
const ICAP_PREVIEW_EOF = Buffer.from('0; ieof');
const ICAP_BODY_EOF = Buffer.from('0');

const NEWLINE = Buffer.from('\r\n');

const parser = require('./parser');
const debug = require('debug')('icap:decoder');
const assert = require('assert');

const Decoder = require('dec0de');

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

    let decoded = null;
    let reading = false;

    const decoder = new Decoder(handleNewRequest);

    socket.on('data', data => {
        // console.log('\n\n\n=====\n' + data + '\n=====\n\n\n');
        decoder.decode(data);
    });

    function* handleNewRequest() {
        reading = true;
        const icapDetails = parser.parseIcapDetails(
            yield buf => buf.indexOf(ICAP_HEADERS_DELIMITER));
        yield ICAP_HEADERS_DELIMITER;
        decoded = {
            icapDetails,
            encapsulated: {},
            previewMode: icapDetails.headers.has('preview'),
            allowContinue: false
        };
        debug('new request', icapDetails.method, icapDetails.path);
        events.emit('icap-request', icapDetails);
        yield* handleEncapsulatedSections();
    }

    function* handleEncapsulatedSections() {
        for (let i = 0; i < decoded.icapDetails.encapsulatedRegions.length; i++) {
            const region = decoded.icapDetails.encapsulatedRegions[i];
            const nextRegion = decoded.icapDetails.encapsulatedRegions[i + 1];
            if (nextRegion) {
                // case 1: region has explicit length (all -hdr, basically)
                const length = nextRegion.startOffset - region.startOffset;
                decoded.encapsulated[region.section] = yield length;
                debug(region.section);
                events.emit(region.section);
            } else if (region.section === 'null-body') {
                // case 2: null body
                return finishRead();
            } else {
                // case 3: last region (-body) is chunked and ends with terminator
                decoded.encapsulated[region.section] = Buffer.alloc(0);
                yield* handleChunkedBody();
            }
        }
    }

    function* handleChunkedBody() {
        while (true) {
            const delimBuf = yield buf => buf.indexOf(NEWLINE);
            yield NEWLINE;
            // Check terminators
            if (delimBuf.equals(ICAP_PREVIEW_EOF)) {
                decoded.allowContinue = false;
                break;
            } else if (delimBuf.equals(ICAP_BODY_EOF)) {
                // only allow continue if we're in preview mode
                decoded.allowContinue = decoded.previewMode;
                break;
            }
            const len = parseInt(delimBuf.toString(), 16);
            if (!len) {
                throw new Error('Expected chunk length or terminator, ' +
                    'got: ' + delimBuf.toString());
            }
            appendBodyChunk(yield len);
            yield NEWLINE;
        }
        // Finish read body
        yield NEWLINE;
        decoded.previewMode = false;
        const bodyType = decoded.icapDetails.bodyType;
        debug(bodyType);
        events.emit(bodyType);
        finishRead();
    }

    return {
        getDecodedMessage,
        acceptNewRequest,
        acceptBody,
        isReadFinished
    };

    function getDecodedMessage() {
        assert(decoded, 'ICAP request not decoded');
        return decoded;
    }

    function appendBodyChunk(chunk) {
        const bodyBuffer = decoded.encapsulated[decoded.icapDetails.bodyType];
        decoded.encapsulated[decoded.icapDetails.bodyType] = Buffer.concat([bodyBuffer, chunk]);
    }

    function finishRead() {
        debug('finish read');
        events.emit('end');
        reading = false;
        acceptNewRequest();
    }

    function acceptNewRequest() {
        decoder.use(handleNewRequest);
    }

    function acceptBody() {
        decoder.use(handleChunkedBody);
    }

    function isReadFinished() {
        return !reading;
    }

};
