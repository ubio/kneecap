'use strict';

const SEPARATOR = Buffer.from('\r\n\r\n');
const BODY_PREVIEW_TERMINATOR = Buffer.from('0\r\n\r\n');
// const BODY_PREVIEW_SEPARATOR = Buffer.from('0\r\n');
// const BODY_ZERO_BYTE = Buffer.from('0; ieof\r\n\r\n');
const CHUNK_SEPARATOR = Buffer.from('\r\n');

const url = require('url');

module.exports = function requestConstructor(received, connection) {
    const request = {
        done: false,
        method: null,
        path: null,
        version: null,
        icapHeaders: null,
        encapsulated: null,
        is204Allowed: false,
        getRequestHeaders: () => {return undefined;}, // sync
        getRequestBody: () => {return Promise.resolve(undefined);}, // async
    };

    if (hasIcapHeaders(received)) {
        const icapData = getIcapData(received);
        request.method = icapData.method;
        request.path = icapData.path;
        request.version = icapData.version;
        request.icapHeaders = icapData.icapHeaders;
    }

    if (hasEncapsulation(request.icapHeaders)) {
        request.encapsulated = extractEncaptulatedData(received, extractEncapsulationDetails(request.icapHeaders.get('encapsulated')));
        if (request.encapsulated.has('req-hdr')) {
            request.getRequestHeaders = () => {
                return request.encapsulated.get('req-hdr').toString();
            };
        }
        if (request.encapsulated.has('req-body')) {
            request.getRequestBody = () => {
                console.log('asdqq getRequestBody');
                return Promise.resolve()
                    .then(() => {
                        const preview = request.encapsulated.get('req-body');
                        console.log('headers', request.icapHeaders);
                        if (request.icapHeaders.has('preview')) {
                            if (endsWith(preview, BODY_PREVIEW_TERMINATOR)) {
                                return connection.getFullBody();
                            }
                        }
                        if (endsWith(preview, BODY_PREVIEW_TERMINATOR)) {
                            const chunks = preview.slice(0, preview.length - BODY_PREVIEW_TERMINATOR.length);
                            const body = dechunk(chunks);
                            return body.toString();
                        }
                        throw new Error('Implement me!!1`');
                    });
            };
        }
    }

    if (hasAllowedOptions(request.icapHeaders)) {
        request.is204Allowed = is204Allowed(request.icapHeaders.get('allow'));
    }

    request.done = doneReceiving(request);
    return request;
};

function hasIcapHeaders(received) {
    return received.includes(SEPARATOR);
}

function hasEncapsulation(icapHeaders) {
    return icapHeaders && icapHeaders.has('encapsulated');
}

function hasAllowedOptions(icapHeaders) {
    return icapHeaders && icapHeaders.has('allow');
}

function is204Allowed(headerAllow) {
    return headerAllow.includes('204');
}

function getIcapData(received) {
    const headersEndIx = received.indexOf(SEPARATOR);
    const headerBuffer = received.slice(0, headersEndIx);
    const lines = headerBuffer.toString().split('\r\n');
    const first = parseFirstLine(lines[0]);
    const icapHeaders = new Map(lines.slice(1, lines.length).map(parseLine));

    return {
        method: first.method,
        path: first.path,
        version: first.version,
        icapHeaders
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

function parseLine(str) {
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

function extractEncaptulatedData(received, encapsulationDetails) {
    const payloadIx = received.indexOf(SEPARATOR) + SEPARATOR.length;
    const payload = received.slice(payloadIx);
    const extractedPayload = new Map();
    encapsulationDetails.forEach(extractedPayloadFragmentTo(payload, extractedPayload));
    return extractedPayload;
}

function extractedPayloadFragmentTo(input, output) {
    return (value, key) => {
        output.set(key, input.slice(value[0], value[1]));
    };
}

function doneReceiving(request) {
    if (!request.encapsulated/* && firstLineHasIcap() && endsWith(new Buffer('\r\n\r\n'))*/) {
        return true;
    }
    const bodyType = Array.from(request.encapsulated.keys()).find(key => key.indexOf('-body') === 3);
    if (!bodyType) {
        return true;
    }
    const bodyContents = request.encapsulated.get(bodyType);
    if (
        // endsWith(bodyContents, BODY_PREVIEW_SEPARATOR) ||
        endsWith(bodyContents, BODY_PREVIEW_TERMINATOR)
    ) {
        return true;
    }

    return false;
}

function endsWith(buffer, terminator) {
    if (buffer.length >= terminator.length) {
        return buffer.compare(terminator, 0, terminator.length, buffer.length - terminator.length, buffer.length) === 0;
    }
    return false;
}

function dechunk(buffer) {
    const chunkSeparatorIx = buffer.indexOf(CHUNK_SEPARATOR);
    const chunkSize = parseInt(buffer.slice(0, chunkSeparatorIx).toString(), 16);
    const chunkStartIx = chunkSeparatorIx + CHUNK_SEPARATOR.length;
    const chunk = buffer.slice(chunkStartIx, chunkStartIx + chunkSize);
    const remaining = buffer.slice(chunkStartIx + chunk.length + CHUNK_SEPARATOR.length);
    if (remaining.length > 0) {
        return Buffer.concat([chunk, dechunk(remaining)]);
    }
    return chunk;
}
