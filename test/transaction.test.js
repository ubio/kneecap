'use strict';

const net = require('net');
const createConnection = require('../src/transaction.js');

describe('transaction', () => {
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

    describe('parsing icap headers', () => {

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

    describe('parsing encapsulated headers', () => {
        it('should parse headers without body', (done) => {
            _client.write(getIcapREQMOD());
            _connection.events.on('end', parsed => {
                const headers = parsed.encapsulated.get('req-hdr').toString();
                headers.split('\r\n')[0].should.containEql('GET ');
                done();
            });
        });

        it('should parse headers with preview body', (done) => {
            _client.write(getIcapREQMODPreview());
            _connection.events.on('end', parsed => {
                const headers = parsed.encapsulated.get('req-hdr').toString();
                headers.split('\r\n')[0].should.containEql('POST ');
                done();
            });
        });

        it('should parse headers with full preview body', (done) => {
            _client.write(getIcapREQMODPreviewFull());
            _connection.events.on('end', parsed => {
                const headers = parsed.encapsulated.get('req-hdr').toString();
                headers.split('\r\n')[0].should.containEql('POST ');
                done();
            });
        });

        it('should parse headers with full body (no preview)', (done) => {
            _client.write(getIcapREQMODFullBody());
            _connection.events.on('end', parsed => {
                const headers = parsed.encapsulated.get('req-hdr').toString();
                headers.split('\r\n')[0].should.containEql('POST ');
                done();
            });
        });
    });

    describe('parsing encapsulated body', () => {
        it('should parse preview body', (done) => {
            _client.write(getIcapREQMODPreview());
            _connection.events.on('end', parsed => {
                const body = parsed.encapsulated.get('req-body').toString();
                body.should.equal('k0=valueva');
                done();
            });
        });

        it('should parse full preview body', (done) => {
            _client.write(getIcapREQMODPreviewFull());
            _connection.events.on('end', parsed => {
                const body = parsed.encapsulated.get('req-body').toString();
                body.should.equal('testkey=testvalue');
                done();
            });
        });

        it('should parse full body (no preview)', (done) => {
            _client.write(getIcapREQMODFullBody());
            _connection.events.on('end', parsed => {
                const body = parsed.encapsulated.get('req-body').toString();
                body.should.equal('testkey=testvalue');
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

function getIcapREQMODPreview() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:16:43 GMT',
        'Encapsulated: req-hdr=0, req-body=137',
        'Preview: 10',
        '',
        'POST http://localhost:48191/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 494989',
        'Host: localhost:48191',
        '',
        'a',
        'k0=valueva',
        '0',
        '',
        '',
    ]
        .join('\r\n');
}

function getIcapREQMODPreviewFull() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:24:40 GMT',
        'Encapsulated: req-hdr=0, req-body=133',
        'Preview: 17',
        'Allow: 204',
        '',
        'POST http://localhost:42633/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 17',
        'Host: localhost:42633',
        '',
        '11',
        'testkey=testvalue',
        '0; ieof',
        '',
        '',
    ]
        .join('\r\n');
}

function getIcapREQMODFullBody() {
    return [
        'REQMOD icap://127.0.0.1:8001/request ICAP/1.0',
        'Host: 127.0.0.1:8001',
        'Date: Wed, 27 Jul 2016 11:26:22 GMT',
        'Encapsulated: req-hdr=0, req-body=133',
        'Allow: 204',
        '',
        'POST http://localhost:39985/ HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 17',
        'Host: localhost:39985',
        '',
        '11',
        'testkey=testvalue',
        '0',
        '',
        '',
    ]
        .join('\r\n');
}
