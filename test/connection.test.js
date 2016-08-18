'use strict';

const net = require('net');
const createConnection = require('../src/connection.js');

const samples = require('./samples');

describe.only('connection', () => {

    let server = null;
    let client = null;
    let connection = null;

    beforeEach(done => {
        server = net.createServer();
        server.listen(() => {
            client = net.createConnection({
                port: server.address().port
            });
            server.on('connection', socket => {
                connection = createConnection(socket);
                done();
            });
        });
    });

    afterEach(done => {
        if (!client.destroyed) {
            client.on('close', done);
            client.destroy();
            client = null;
            connection = null;
        } else {
            done();
        }
    });

    afterEach(done => {
        server.close(done);
        server = null;
    });

    describe('new request', () => {

        it('should parse requests without bodies', done => {
            client.write(samples.OPTIONS);
            connection.events.on('icap-request', icapDetails => {
                icapDetails.method.should.equal('OPTIONS');
                icapDetails.headers.get('host').should.equal('127.0.0.1:8001');
                icapDetails.version.should.equal('ICAP/1.0');
                done();
            });
        });

        it('should parse requests when client sends fragments', done => {
            client.setNoDelay(true);
            connection.events.on('icap-request', icapDetails => {
                icapDetails.method.should.equal('OPTIONS');
                icapDetails.headers.get('host').should.equal('127.0.0.1:8001');
                icapDetails.version.should.equal('ICAP/1.0');
                done();
            });
            const lines = samples.OPTIONS.split('\r\n');
            lines.reduce((flow, line) => {
                return flow
                    .then(() => client.write(line))
                    .then(() => new Promise(resolve => setTimeout(resolve, 10)))
                    .then(() => client.write('\r'))
                    .then(() => new Promise(resolve => setTimeout(resolve, 10)))
                    .then(() => client.write('\n'));
            }, Promise.resolve());
        });

        it('should parse requests with encapsulated headers', done => {
            client.write(samples.REQMOD.noBody);
            connection.events.on('icap-request', icapDetails => {
                icapDetails.headers.size.should.equal(5);
                done();
            });
        });

    });

    describe('encapsulated headers', () => {

        it('should parse HTTP headers without body', done => {
            client.write(samples.REQMOD.noBody);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-hdr')
                    .then(buffer => {
                        const lines = buffer.toString().split('\r\n');
                        lines[0].should.containEql('GET');
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse headers with preview body', done => {
            client.write(samples.REQMOD.preview);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-hdr')
                    .then(buffer => {
                        const lines = buffer.toString().split('\r\n');
                        lines[0].should.containEql('POST ');
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse headers with full preview body', done => {
            client.write(samples.REQMOD.previewFull);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-hdr')
                    .then(buffer => {
                        const lines = buffer.toString().split('\r\n');
                        lines[0].should.containEql('POST ');
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse headers with full body (no preview)', done => {
            client.write(samples.REQMOD.noPreview);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-hdr')
                    .then(buffer => {
                        const lines = buffer.toString().split('\r\n');
                        lines[0].should.containEql('POST ');
                        done();
                    })
                    .catch(done);
            });
        });

    });

    describe('parsing encapsulated body', () => {

        it('should parse preview body', done => {
            client.write(samples.REQMOD.preview);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-body')
                    .then(buffer => {
                        buffer.toString().should.equal('k0=valueva');
                        connection.isContinueAllowed().should.equal(true);
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse full preview body', done => {
            client.write(samples.REQMOD.previewFull);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-body')
                    .then(buffer => {
                        buffer.toString().should.equal('testkey=testvalue');
                        connection.isContinueAllowed().should.equal(false);
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse full body (no preview)', done => {
            client.write(samples.REQMOD.noPreview);
            connection.events.on('icap-request', () => {
                connection.waitForEncapsulated('req-body')
                    .then(buffer => {
                        buffer.toString().should.equal('testkey=testvalue');
                        connection.isContinueAllowed().should.equal(false);
                        done();
                    })
                    .catch(done);
            });
        });

        it('should parse full body (preview + continue)', done => {
            client.write(samples.REQMOD.preview);
            connection.events.on('icap-request', () => {
                connection.getFullBody()
                    .then(body => {
                        const pairs = body.toString().split('&')
                            .map(pair => {
                                const [ key, value ] = pair.split('=');
                                return { key, value };
                            });
                        pairs.length.should.equal(2);
                        pairs[0].key.should.equal('k0');
                        pairs[0].value.length.should.equal(5 * 99);
                        pairs[1].key.should.equal('k1');
                        pairs[1].value.length.should.equal(5 * 99);
                        done();
                    })
                    .catch(done);
                setTimeout(() => client.write(samples.REQMOD.previewContinue), 50);
            });
        });

    });

    describe('multiple requests', () => {

        it('should handle multiple requests via one socket', done => {
            const methods = [];
            client.write(samples.OPTIONS);
            client.write(samples.REQMOD.noBody);
            connection.events.on('icap-request', icapDetails => {
                methods.push(icapDetails.method);
            });
            setTimeout(() => {
                methods.should.eql(['OPTIONS', 'REQMOD']);
                done();
            }, 100);
        });

        it('should handle loads of them', done => {
            const methods = [];
            client.write(samples.REQMOD.noBody);
            client.write(samples.REQMOD.previewFull);
            client.write(samples.REQMOD.preview);
            client.write(samples.REQMOD.previewFull);
            client.write(samples.OPTIONS);
            connection.events.on('icap-request', icapDetails => {
                methods.push(icapDetails.method);
            });
            setTimeout(() => {
                methods.should.eql([
                    'REQMOD',
                    'REQMOD',
                    'REQMOD',
                    'REQMOD',
                    'OPTIONS'
                ]);
                done();
            }, 100);
        });

    });

    describe('connection closed', () => {

        it('should throw', done => {
            client.write(samples.REQMOD.preview);
            setTimeout(() => {
                try {
                    connection.dontChange();
                    done(new Error('Should throw'));
                } catch (e) {
                    done();
                }
            }, 50);
            client.destroy();
        });

    });

});

