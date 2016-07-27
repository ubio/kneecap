'use strict';

const net = require('net');

const connectionConstructor = require('./lib/connection.js');

const FILETYPE_COMPLETE = ['html'];
const FILETYPE_IGNORE = [
    'bat', 'exe', 'com', 'bin', 'pkg', 'gz', 'zip', 'ogg',
    'asp', 'css', 'swf', 'mp3', 'wav', 'gif', 'jpg', 'jpeg',
];
const FILETYPE_PREVIEW = ['*']; // ['json', 'html', 'js'];
const PREVIEW_BYTES = 10;

// Is there a point in having chainable middleware?
// For now, single request modifier should suffice
let _requestModifier = DONT_MODIFY_REQUEST;

module.exports = function icapServerFactory(port) {
    return Promise.resolve()
        .then(() => {
            const server = net.createServer();
            return new Promise((resolve, reject) => {
                server.on('error', reject);
                server.listen(port, () => {
                    server.removeListener('error', reject);
                    setup(server);
                    resolve(server);
                });
            });
        })
        .then(server => {
            return Object.freeze({
                _server: server,
                _requestModifier,
                setRequestModifier: (requestModifier) => {
                    _requestModifier = requestModifier;
                },
                removeRequestModifier: () => {
                    _requestModifier = DONT_MODIFY_REQUEST;
                }
            });
        });
};

function setup(server) {
    server.on('connection', socket => {
        const connection = connectionConstructor(socket);
        handleConnection(connection);
    });
}

function handleConnection(connection) {
    connection.events.on('OPTIONS', options => {
        const handler = handlers[`OPTIONS${options.path}`];
        if (handler) {
            handler(connection);
        } else {
            handleBadRequest(connection);
        }
    });

    connection.events.on('REQMOD', request => {
        const handler = handlers[`REQMOD${request.path}`];
        if (handler) {
            handler(connection, request)
                .catch(e => console.log('caught', e));
        } else {
            handleBadRequest(connection);
        }
    });
}

function handleBadRequest(connection) {
    connection.respond({
        statusCode: 400,
        statusText: 'Bad request',
    });
}

const handlers = Object.freeze({
    'REQMOD/request': (connection, request) => {
        return Promise.resolve(_requestModifier(request))
            .then(modifiedRequest => {
                if (!modifiedRequest) {
                    return Promise.resolve(connection.respond());
                }
                return Promise.resolve(connection.respond({
                    statusCode: 200,
                    statusText: 'OK',
                    reqHeaders: modifiedRequest.reqHeaders || request.getRequestHeaders(),
                    reqBody: modifiedRequest.reqBody || request.getRequestBody()
                }));
            });
    },
    'OPTIONS/request': connection => {
        const headers = [
            ['Methods', 'REQMOD']
        ];

        /**
         * A list of file extensions that should NOT be sent to the ICAP
         * server.  This header MAY be included in the OPTIONS response.
         * Multiple file extensions should be separated by commas.
         *
         * For example:
         * Transfer-Ignore: html
         */
        if (FILETYPE_IGNORE.length > 0) {
            headers.push(['Transfer-Ignore', FILETYPE_IGNORE.join(', ')]);
        }

        /**
         * A list of file extensions that should be previewed to the ICAP
         * server before sending them in their entirety.  This header MAY be
         * included in the OPTIONS response.  Multiple file extensions values
         * should be separated by commas.  The wildcard value "*" specifies
         * the default behavior for all the file extensions not specified in
         * any other Transfer-* header (see below).
         *
         * For example:
         * Transfer-Preview: *
         */
        if (FILETYPE_PREVIEW.length > 0) {
            headers.push(['Transfer-Preview', FILETYPE_PREVIEW.join(', ')]);
        }

        /**
         * A list of file extensions that should be sent in their entirety
         * (without preview) to the ICAP server.  This header MAY be included
         * in the OPTIONS response.  Multiple file extensions values should
         * be separated by commas.
         *
         * For example:
         * Transfer-Complete: asp, bat, exe, com, ole
         */
        if (FILETYPE_COMPLETE.length > 0) {
            headers.push(['Transfer-Complete', FILETYPE_COMPLETE.join(', ')]);
        }

        /**
         * The number of bytes to be sent by the ICAP client during a
         * preview.  This header MAY be included in the OPTIONS response.
         *
         * For example:
         * Preview: 1024
         */
        if ('undefined' !== typeof PREVIEW_BYTES) {
            headers.push(['Preview', PREVIEW_BYTES]);
        }

        connection.respond({
            statusCode: 200,
            statusText: 'OK',
            icapHeaders: new Map(headers)
        });
    }
});

function DONT_MODIFY_REQUEST() {
    return Promise.resolve();
}
