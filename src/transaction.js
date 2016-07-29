'use strict';

const EventEmitter = require('events').EventEmitter;
const Buffer = require('buffer').Buffer;
const url = require('url');

const createResponse = require('./response.js');

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
    let fullBodyPromise = null;
    let canReceiveMore = false;

    const parsed = {
        icapDetails: undefined,
        encapsulated: new Map() // Map { 'req-hdr': Buffer(), 'req-body': Buffer() }
    };

    events.on('finished', () => {
        socket.removeListener('data', handleSocketData);
    });

    return Object.freeze({
        events,
        hasEncapsulatedSection,
        getFullBody,
        waitForEncapsulatedSection,
        respond,
        dontChange,
        badRequest
    });

    function hasEncapsulatedSection(section) {
        const encapsulated = parsed.icapDetails.encapsulated;
        if (encapsulated) {
            return encapsulated.has(section);
        }
    }

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
                if (received.length === 0) {
                    break;
                }
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
                        const content = parsedPart.content;
                        parsed.encapsulated.set(key, content);
                        events.emit(key, content);
                        received = received.slice(parsedPart.remainingIx);
                    } catch(e) {
                        console.log('try/catch thrown', e, received.toString());
                        return;
                    }
                }
            }
            if (received.length === 0 && parsed.icapDetails.encapsulated.has('null-body')) {
                // When parsing headers, the terminator \r\n\r\n is part of headers (http standard)
                events.emit('end', parsed);
                return;
            }
            if (isPreviewMode()) {
                if (received.equals(BODY_PREVIEW_TERMINATOR)) {
                    // Got preview according to preview header
                    // We can reply with 100 CONTINUE
                    if (canReceiveMore) {
                        canReceiveMore = false;
                    } else {
                        canReceiveMore = true;
                    }
                    events.emit('end', parsed);
                } else if (received.equals(BODY_ZERO_BYTE)) {
                    events.emit('end', parsed);
                } else {
                    // We need more data
                    console.log('more data (preview)', received);
                    return;
                }
            } else {
                // Not preview mode
                events;
                if (received.equals(BODY_PREVIEW_TERMINATOR)) {
                    events.emit('end', parsed);
                } else {
                    // We need more data
                    console.log('more data (no preview)');
                    return;
                }
            }
        } else {
            events.emit('end', parsed);
        }
    }

    function getEncapsulatedSection(name) {
        return parsed.encapsulated.get(name);
    }

    function getFullBody() {
        const section = getEncapsulatedBodyType();
        if ('null-body' === section) {
            return Promise.resolve();
        }
        if (fullBodyPromise) {
            return fullBodyPromise;
        }
        fullBodyPromise = Promise.resolve()
            .then(() => new Promise(resolve => {
                if (canReceiveMore) {
                    events.on('end', onFullBodyRead);
                    return getMore();
                }
                return resolve(waitForEncapsulatedSection(section));

                function onFullBodyRead() {
                    events.removeListener('end', onFullBodyRead);
                    resolve(getEncapsulatedSection(section));
                }

            }));
        return fullBodyPromise;
    }

    function getMore() {
        // TODO: set canReceiveMore to false
        // Maybe check that boolean in here, for sanity?
        console.log('writing to socket 100 continue');
        socket.write('100 CONTINUE\r\n\r\n');
    }

    function dontChange() {
        const allow = parsed.icapDetails.icapHeaders.get('allow') || '';
        if (allow.includes('204')) {
            return respond({
                statusCode: 204,
                statusText: 'No Content'
            });
        }
        const promises = Array.from(parsed.icapDetails.encapsulated.keys())
            .filter(section => section.indexOf('-hdr') > -1)
            .map(section => waitForEncapsulatedSection(section));
        const bodyType = getEncapsulatedBodyType();
        if (bodyType !== 'null-body') {
            promises.push(getFullBody());
        }
        return Promise.all(promises)
            .then(() => {
                return respond({
                    statusCode: 200,
                    statusText: 'OK',
                    payload: parsed.encapsulated
                });
            });
    }

    function badRequest() {
        return respond({
            statusCode: 400,
            statusText: 'Bad Request'
        });
    }

    function respond(spec) {
        const buffer = createResponse(spec).toBuffer();
        socket.write(buffer);
        finish();
    }

    function waitForEncapsulatedSection(section) {
        if (!parsed.icapDetails.encapsulated.has(section)) {
            return Promise.resolve(Buffer.alloc(0));
        }
        const data = getEncapsulatedSection(section);
        if (data) {
            return Promise.resolve(data);
        }
        return new Promise((resolve, reject) => {
            // TODO do not forget about socket-closed
            events.on('close', handleSocketClose);
            events.on(section, handleSection);
            function handleSection(data) {
                cleanup();
                resolve(data);
            }
            function handleSocketClose() {
                cleanup();
                const err = new Error('Socket closed while waiting for section');
                err.details = {
                    section
                };
                reject(err);
            }
            function cleanup() {
                events.removeListener('close', handleSocketClose);
                events.removeListener(section, handleSection);
            }
        });
    }

    function getEncapsulatedBodyType() {
        const keys = Array.from(parsed.icapDetails.encapsulated.keys());
        return keys.find(type => isBody(type));
    }

    function finish() {
        socket.removeListener('data', handleSocketData);
        events.emit('finished');
    }

    function isPreviewMode() {
        return parsed.icapDetails.icapHeaders.has('preview'); // && haveReadBodyPastPreview();
    }

};

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
    if (buffer.length === 0) {
        return {
            chunk: new Buffer(0),
            remaining: buffer
        };
    }
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
