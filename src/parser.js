'use strict';

const parseUrl = require('url').parse;

module.exports = {
    parseIcapDetails
};

function parseIcapDetails(buffer) {
    const lines = buffer.toString().split('\r\n');
    const statusLine = parseIcapStatusLine(lines[0]);
    const headers = parseIcapHeaders(lines.slice(1));
    const encapsulatedRegions = parseEncapsulatedRegions(headers.get('encapsulated'));

    return {
        method: statusLine.method,
        url: statusLine.url,
        path: statusLine.path,
        version: statusLine.version,
        headers,
        encapsulatedRegions
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
    return lines.reduce((headers, str) => {
        const sep = ': ';
        const i = str.indexOf(sep);
        const name = str.substring(0, i).toLowerCase();
        headers.set(name, str.substring(i + sep.length));
        return headers;
    }, new Map());
}

function parseEncapsulatedRegions(str) {
    return (str || '').split(', ')
        .map(entry => {
            const [ section, startOffset ] = entry.split('=');
            return { section, startOffset };
        });
}
