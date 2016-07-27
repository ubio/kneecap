'use strict';

const net = require('net');
const createConnection = require('../src/connection.js');

describe('connection', () => {
    describe('parsing icap headers', () => {
        let _server, _client, _connection;
        beforeEach((done) => {
            return getListeningServer()
                .then(server => {
                    _server = server;
                    server.on('connection', socket => {
                        _connection = createConnection(socket);
                        done();
                    });
                    _client = net.createConnection({
                        port: _server.address().port
                    });
                });
        });

        afterEach(() => {
            if (_client) {
                _client.destroy();
            }
            if (_connection) {
                _client.destroy();
            }
            _server.close();
            _server = _client = _connection = null;
        });

        it('should parse requests without bodies', (done) => {
            _client.write(getIcapOPTIONS());
            _connection.events.on('icap-headers', parsedHeaders => {
                parsedHeaders.method.should.equal('OPTIONS');
                parsedHeaders.icapHeaders.get('host').should.equal('127.0.0.1:8001');
                done();
            });
        });

        it('should parse requests with bodies', (done) => {
            _client.write(getIcapREQMOD());
            _connection.events.on('icap-headers', parsedHeaders => {
                parsedHeaders.icapHeaders.size.should.equal(5);
                done();
            });
        });
    });
});

function getListeningServer() {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(() => {
            resolve(server);
        });
    });
}

function getIcapOPTIONS() {
    return 'OPTIONS icap://127.0.0.1:8001/request ICAP/1.0\r\nHost: 127.0.0.1:8001\r\nAllow: 206\r\n\r\n';
}

function getIcapREQMOD() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 07:56:17 GMT',
        'Encapsulated: req-hdr=0, null-body=92',
        'Preview: 0',
        'Allow: 204',
        '',
        'GET http://localhost:58285/ HTTP/1.1',
        'X-Change-Me: my-test-header',
        'Host: localhost:58285',
        '',
        '',
    ]
        .join('\r\n');

}
