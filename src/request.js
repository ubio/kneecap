'use strict';

module.exports = function createIcapRequest(icapDetails, connection) {
    return Object.freeze({
        hasRequestHeaders,
        hasResponseHeaders,
        hasBody,
        getRequestHeaders,
        getResponseHeaders,
        getRawRequestHeaders,
        getRawResponseHeaders,
        getRawBody
    });

    function hasRequestHeaders() {
        return connection.hasEncapsulated('req-hdr');
    }

    function hasResponseHeaders() {
        return connection.hasEncapsulated('res-hdr');
    }

    function hasBody() {
        return connection.hasEncapsulated('req-body') ||
            connection.hasEncapsulated('res-body');
    }

    function getRequestHeaders() {
        return getHeaders('req-hdr');
    }

    function getResponseHeaders() {
        return getHeaders('res-hdr');
    }

    function getRawRequestHeaders() {
        return getRawHeaders('req-hdr');
    }

    function getRawResponseHeaders() {
        return getRawHeaders('res-hdr');
    }

    function getHeaders(name) {
        return getRawHeaders(name)
            .then(buffer => parseHeaders(buffer));
    }

    function getRawHeaders(section) {
        return connection.waitForEncapsulated(section);
    }

    function getRawBody() {
        return connection.getFullBody();
    }

};

function parseHeaders(buffer) {
    return buffer.toString();
}
