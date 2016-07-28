'use strict';

const ICAP_HEADERS_DELIMITER = Buffer.from('\r\n\r\n');
const ICAP_PREVIEW_EOF_DELIMITER = Buffer.from('0; ieof\r\n\r\n');
const ICAP_BODY_DELIMITER = Buffer.from('0\r\n\r\n');

const parseUrl = require('url');

const requestDecoder = {
    'new-request': (buffer) => {
        const idx = buffer.indexOf(ICAP_HEADERS_DELIMITER);
        if (idx === -1) {
            return false;
        }
        const request = {
            icapDetails: parseIcapDetails(buffer.slice(0, idx)),
            encapsulated: {}
        };
        const remaining = buffer.slice(idx + ICAP_HEADERS_DELIMITER.length);
        const nextState = '???';
        // then see what's in encapsulated
        // req-hdr: length => parse w/ fixed length
        // res-hdr: length => parse w/ fixed length
        // null-body: ? => 'new-request'
        return {
            state: '',
            payload: request,
            remaining
        };
    },
    'req-hdr': (buffer, request) => {

    },
    'res-hdr': (buffer, request) => {

    },
    'null-body': (buffer, request) => {

    },
    'req-body': (buffer, request) => {

    },
    'res-body': (buffer, request) => {

    }
};

function parseIcapDetails(buffer) {
    const lines = buffer.toString().split('\r\n');
    const statusLine = parseIcapStatusLine(lines[0]);
    const headers = parseIcapHeaders(lines.slice(1));
    const encapsulated = parseEncapsulatedRegions(headers.get('encapsulated'));

    return {
        method: statusLine.method,
        url: statusLine.url,
        path: statusLine.path,
        version: statusLine.version,
        headers,
        encapsulated
    };
}

function parseIcapStatusLine(str) {
    const [
        method,
        url,
        version
    ] = str.split(' ');
    return {
        method,
        url,
        path: parseUrl(url).path,
        version
    };
}

function parseIcapHeaders(lines) {
    return lines.reduce((str, headers) => {
        const sep = ': ';
        const i = str.indexOf(sep);
        const name = str.substring(0, i).toLowerCase();
        headers[name] = str.substring(i + sep.length);
        return headers;
    }, {});
}

function parseEncapsulatedRegions(data) {
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
