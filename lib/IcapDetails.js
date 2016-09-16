'use strict';

const parseUrl = require('url').parse;

class IcapDetails {
    constructor(buffer) {
        const lines = buffer.toString().split('\r\n');
        // lines.forEach(line => console.log(`line->${line}`));
        this.statusLine = parseIcapStatusLine(lines[0]);
        this.headers = parseIcapHeaders(lines.slice(1));
        this.encapsulatedRegions = parseEncapsulatedRegions(this.headers.get('encapsulated'));
        this.bodyType = getBodyType(this.encapsulatedRegions);
    }

    get method() {
        return this.statusLine.method;
    }

    get url() {
        return this.statusLine.url;
    }

    hasEncapsulatedRegion(name) {
        return Boolean(this.encapsulatedRegions.find(region => region.name === name));
    }

    hasPreview() {
        return this.headers.has('preview');
    }
}

module.exports = IcapDetails;

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
        .filter(Boolean)
        .map(entry => {
            const [ name, startOffset ] = entry.split('=');
            return { name, startOffset };
        });
}

function getBodyType(regions) {
    const region = regions.find(region => region.name.indexOf('-body') > -1);
    return region && region.name || 'null-body';
}
