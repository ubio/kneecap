'use strict';

const EventEmitter = require('events').EventEmitter;
const Buffer = require('buffer').Buffer;
const url = require('url');

const SINGLE_BLANK = new Buffer('\r\n\r\n');

module.exports = function(socket) {
    // socket.on('close', handleSocketClose);
    socket.on('data', handleSocketData);

    const events = new EventEmitter();
    let received = new Buffer(0);

    const parsed = {
        icapDetails: undefined,
        encapsulated: undefined // Map { 'req-hdr': Buffer(), 'req-body': Buffer() }
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
            // {
            //     'req-hdr': new Buffer(100),
            //     'res-hdr': new Buffer(200),
            //     'res-body': new Buffer(17)
            // }
            parsed.icapDetails.encapsulated.forEach((value, key) => {
                if (!parsed.encapsulated.has(key)) {
                    if (value.length === 2) {
                    }
                    let parsedPart;
                    try {
                        parsedPart = parseEncapsulatedData(key, value, received);
                    } catch(e) {
                    }
                }
            });
        } else {
            events.emit('end');
        }
    }
};

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
