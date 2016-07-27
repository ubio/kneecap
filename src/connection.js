'use strict';

const EventEmitter = require('events').EventEmitter;
const Buffer = require('buffer').Buffer;
const url = require('url');

const SINGLE_BLANK = new Buffer('\r\n\r\n');
const CHUNK_SEPARATOR = Buffer.from('\r\n');
const BODY_PREVIEW_TERMINATOR = Buffer.from('0\r\n\r\n');
// const BODY_PREVIEW_SEPARATOR = Buffer.from('0\r\n');
const BODY_ZERO_BYTE = Buffer.from('0; ieof\r\n\r\n');

module.exports = function(socket) {
    // socket.on('close', handleSocketClose);
    socket.on('data', handleSocketData);

    const events = new EventEmitter();
    let received = new Buffer(0);

    const parsed = {
        icapDetails: undefined,
        encapsulated: new Map() // Map { 'req-hdr': Buffer(), 'req-body': Buffer() }
    };

    return Object.freeze({
        events
    });

    function handleSocketData(data) {
        received = Buffer.concat([received, data]);

        if (!parsed.icapDetails) {
            if (!containsIcapHeaders(received)) {
                return;
            }
            parsed.icapDetails = parseIcapHeaders(received);
            received = received.slice(parsed.icapDetails.payloadIx);
            events.emit('icap-headers', parsed.icapDetails);
        }

        if (parsed.icapDetails.encapsulated) {
            // Map { 'req-hdr' => [0, 412], 'res-hdr' => [412, 1024], res-body => [1024] }
            // Map { 'req-hdr' => [0, 412], 'null-body' => [412] }
            // {
            //     'req-hdr': new Buffer(100),
            //     'res-hdr': new Buffer(200),
            //     'res-body': new Buffer(17)
            // }
            for (const entry of parsed.icapDetails.encapsulated) {
                const key = entry[0];
                if ('null-body' === key) {
                    break;
                }
                const value = entry[1];
                if (!parsed.encapsulated.has(key)) {
                    if (value.length === 2) {
                        if (received.length < value[1]) {
                            // Wait for more data
                            return;
                            break;
                        }
                    }
                    let parsedPart;
                    try {
                        parsedPart = parseEncapsulatedData(key, value, received);
                        // {
                        //     content: Buffer,
                        //     remainingIx: Number
                        // }
                        parsed.encapsulated.set(key, parsedPart.content);
                        received = received.slice(parsedPart.remainingIx);
                    } catch(e) {
                        console.log('thrown', e);
                        return;
                    }
                }
            }
            console.log('asdqq remaining received', received);
            if (received.length === 0 && parsed.icapDetails.encapsulated.has('null-body')) {
                // When parsing headers, the terminator \r\n\r\n is part of headers (http standard)
                events.emit('end', parsed);
            }
            if (isPreviewMode(parsed.icapDetails.icapHeaders) && received.equals(BODY_PREVIEW_TERMINATOR)) {
                // Got preview according to preview header
                events.emit('end', parsed);
            }


            if (isPreviewMode(parsed.icapDetails.icapHeaders) && received.equals(BODY_ZERO_BYTE)) {
                events.emit('end', parsed);
            }
            if (!isPreviewMode(parsed.icapDetails.icapHeaders) && received.equals(BODY_PREVIEW_TERMINATOR)) {
                events.emit('end', parsed);
            }
        } else {
            events.emit('end', parsed);
        }
    }
};

function isPreviewMode(icapHeaders) {
    return icapHeaders.has('preview'); // && haveReadBodyPastPreview();
}

function parseEncapsulatedData(type, indexes, received) {
    if (isBody(type)) {
        return parseEncapsulatedBody(received);
    }
    return parseEncapsulatedHeaders(indexes, received);
}

function parseEncapsulatedBody(received) {
    const dechunked = dechunk(received);
    const remaining = dechunked.remaining;
    if (!isTerminator(remaining)) {
        return insufficientData();
    }
    return Object.freeze({
        content: dechunked.chunk,
        remainingIx: received.length - remaining.length
    });
}

function dechunk(buffer) {
    console.log('dechunk', buffer.toString());
    const chunkSeparatorIx = buffer.indexOf(CHUNK_SEPARATOR);
    const chunkSize = parseInt(buffer.slice(0, chunkSeparatorIx).toString(), 16);
    if (chunkSize === 0) {
        return {
            chunk: new Buffer(0),
            remaining: buffer
        };
    }
    const chunkStartIx = chunkSeparatorIx + CHUNK_SEPARATOR.length;
    if (buffer.length < chunkStartIx + chunkSize) {
        return insufficientData();
    }
    const chunk = buffer.slice(chunkStartIx, chunkStartIx + chunkSize);
    if (chunk.length !== chunkSize) {
        return insufficientData();
    }
    const remaining = buffer.slice(chunkStartIx + chunk.length + CHUNK_SEPARATOR.length);
    if (remaining.length > 0 && !isTerminator(remaining)) {
        const remainingDechunked = dechunk(remaining);
        return {
            chunk: Buffer.concat([chunk, remainingDechunked]),
            remaining: remainingDechunked.remaining
        };
    }
    return {
        chunk,
        remaining
    };
}

function isTerminator(buffer) {
    return buffer.equals(BODY_PREVIEW_TERMINATOR) || buffer.equals(BODY_ZERO_BYTE);
}

function insufficientData() {
    const err = new Error('Insufficient data');
    throw err;
}

function parseEncapsulatedHeaders(indexes, received) {
    const headersLength = indexes[1] - indexes[0];
    if (received.length < headersLength) {
        return insufficientData();
    }
    const endIx = headersLength;
    const content = received.slice(0, endIx);
    const remainingIx = endIx;
    return Object.freeze({
        content,
        remainingIx
    });
}

function isBody(type) {
    return type.indexOf('-body') > 0;
}

function containsIcapHeaders(received) {
    return received.indexOf(SINGLE_BLANK) > -1;
}

function parseIcapHeaders(received) {
    const headersEndIx = received.indexOf(SINGLE_BLANK);
    const headerBuffer = received.slice(0, headersEndIx);
    const lines = headerBuffer.toString().split('\r\n');
    const first = parseFirstLine(lines[0]);
    const icapHeaders = new Map(lines.slice(1, lines.length).map(parseHeaderLine));
    let encapsulated;
    if (icapHeaders.has('encapsulated')) {
        encapsulated = extractEncapsulationDetails(icapHeaders.get('encapsulated'));
    }

    return {
        method: first.method,
        path: first.path,
        version: first.version,
        icapHeaders,
        encapsulated,
        payloadIx: headersEndIx + SINGLE_BLANK.length
    };
}

function parseFirstLine(str) {
    const split = str.split(' ');
    const parsedUrl = url.parse(split[1]);
    return {
        method: split[0],
        path: parsedUrl.path,
        version: split[2]
    };
}

function parseHeaderLine(str) {
    const separator = ': ';
    const separatorIx = str.indexOf(separator);
    return [str.substring(0, separatorIx).toLowerCase(), str.substring(separatorIx + separator.length)];
}

function extractEncapsulationDetails(data) {
    /**
     * The order in which the encapsulated parts
     * appear in the encapsulating message-body MUST be the same as the
     * order in which the parts are named in the Encapsulated header.
     */
    const kv = data.split(', ') // ['req-hdr=0', 'null-body=412']
        .map(item => { // [['req-hdr', 0], ['null-body', 412]]
            const split = item.split('=');
            return [split[0], Number(split[1])];
        });
    const encapsulation = new Map([[kv[0][0], [kv[0][1]]]]);
    kv.reduce((prev, curr) => { // Map { 'req-hdr' => [0, 412], 'res-hdr' => [412, 1024], res-body => [1024] }
        encapsulation.set(prev[0], [prev[1], curr[1]]);
        encapsulation.set(curr[0], [curr[1]]);
    });
    return encapsulation;
}
