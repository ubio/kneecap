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

    const decoder = new Decoder(handleNewRequest);

    socket.on('data', data => {
        // console.log('\n\n\n=====\n' + data + '\n=====\n\n\n');
        decoder.decode(data);
    });

    return {
        getDecodedMessage,
        acceptNewRequest,
        acceptBody
    };

    function getDecodedMessage() {
        assert(decoded, 'ICAP request not decoded');
        return decoded;
    }

    function acceptNewRequest() {
        decoder.use(handleNewRequest);
    }

    function acceptBody() {
        delete decoded.encapsulated[decoded.icapDetails.bodyType];
        decoder.use(handleChunkedBody);
    }

    // Protocol handlers

    function* handleNewRequest() {
        const icapDetails = parser.parseIcapDetails(
            yield buf => buf.indexOf(ICAP_HEADERS_DELIMITER));
        yield ICAP_HEADERS_DELIMITER;
        decoded = {
            icapDetails,
            encapsulated: {},
            previewMode: icapDetails.headers.has('preview'),
            allowContinue: false,
            bodyBuffer: Buffer.alloc(0)
        };
        debug('new request', icapDetails.method, icapDetails.path, icapDetails.headers);
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
                sectionParseDone(region.section, yield length);
            } else if (region.section === 'null-body') {
                // case 2: null body
                return finishRead();
            } else {
                // case 3: last region (-body) is chunked and ends with terminator
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
        sectionParseDone(bodyType, decoded.bodyBuffer);
        finishRead();
    }

    // Utilities

    function sectionParseDone(section, buffer) {
        decoded.encapsulated[section] = buffer;
        debug(section);
        events.emit(section, buffer);
    }

    function appendBodyChunk(chunk) {
        decoded.bodyBuffer = Buffer.concat([decoded.bodyBuffer, chunk]);
    }

    function finishRead() {
        debug('finish read');
        events.emit('end');
    }

};
