'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');
const ICAP_PREVIEW_EOF = Buffer.from('0; ieof');
const ICAP_BODY_EOF = Buffer.from('0');

const NEWLINE = Buffer.from('\r\n');

const debug = require('debug');
const Decoder = require('dec0de');

const parser = require('./parser.js');
const BodyStream = require('./body.js');

module.exports = function createDecoder(socket, events) {
    let decoded = null;
    const decoder = new Decoder(handleNewRequest);

    socket.on('data', data => {
        decoder.decode(data);
    });

    function* handleNewRequest() {
        const icapDetails = parser.parseIcapDetails(yield getIndexOf(ICAP_HEADERS_DELIMITER));
        yield ICAP_HEADERS_DELIMITER; // the delimiter must also be consumed
        decoded = {
            icapDetails,
            encapsulated: {},
            previewMode: icapDetails.headers.has('preview'),
            allowContinue: false,
            // bodyStream
        };
        debug('new request', icapDetails.method, icapDetails.path);
        events.emit('icap-request', icapDetails);
        yield* handleEncapsulatedSections();
    }

    function* handleEncapsulatedSections() {
        for (let i = 0; i < decoded.icapDetails.encapsulatedRegions.length; ++i) {
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
                decoded.bodyStream = new BodyStream();
                yield* decoded.bodyStream.waitForReadStart();
            }
        }
    }

    function* handleChunkedBody() {
        while (true) {
            const delimBuf = yield getIndexOf(NEWLINE);
            yield NEWLINE; // the delimiter must also be consumed
            // Check terminators
            if (delimBuf.equals(ICAP_PREVIEW_EOF)) {
                decoded.allowContinue = false;
                break;
            } else if (delimBuf.equals(ICAP_BODY_EOF)) {
                // only allow continue if we're in preview mode
                decoded.allowContinue = decoded.previewMode;
                break;
            }
            yield* handleBodyChunk(delimBuf);
            yield NEWLINE;
        }
    }

    function* handleBodyChunk(delimBuf) {
        const len = parseInt(delimBuf.toString(), 16);
        let total = 0;
        if (!len) {
            throw new Error('Expected chunk length or terminator, ' +
                'got: ' + delimBuf.toString());
        }
        return function*(buffer) {
            if (buffer.length + total < len) {
                // decoded.bodyStream
                return buffer.length;
            }
        };
    }

    // Utilities

    function sectionParseDone(section, buffer) {
        decoded.encapsulated[section] = buffer;
        debug(section);
        events.emit(section, buffer);
    }

    function finishRead() {
        debug('finish read');
        events.emit('end');
    }
};

function getIndexOf(value) {
    return function(buffer) {
        return buffer.indexOf(value);
    };
}
