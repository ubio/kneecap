'use strict';

const http = require('http');
// const util = require('util');

const ClientRequest = http.ClientRequest;
const OutgoingMessage = http.OutgoingMessage;

module.exports = function createHttpResponse(req, socket) {
    const firstLine = req.firstLine;
    const headers = req.headers;
    const res = getRes(socket);
    res._storeHeader(firstLine, headers);

    return res;
};

function getRes(socket) {
    const res = new OutgoingMessage();
    Object.assign(res, ClientRequest.prototype);
    res.socket = res.connection = socket;
    res._headerNames = {};
    res._removedHeader = {};
    return res;
}
