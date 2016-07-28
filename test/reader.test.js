'use strict';

const EventEmitter = require('events').EventEmitter;

const createReader = require('../src/reader');

describe('Socket reader', () => {

    let socket = null;

    beforeEach(() => {
        socket = createFakeSocket();
    });

    afterEach(() => {
        socket.close();
    });

    it('should read buffered data', () => {
        const reader = createReader(socket, 200);
        socket.emit('data', Buffer.from('Hello world!\n'));
        return reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')))
            .then(msg => msg.toString().should.equal('Hello world!\n'));
    });

    it('should read chunked data', () => {
        const reader = createReader(socket, 200);
        socket.emit('data', Buffer.from('Hello'));
        setTimeout(() => socket.emit('data', Buffer.from(' world')), 10);
        setTimeout(() => socket.emit('data', Buffer.from('!\n')), 50);
        return reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')))
            .then(msg => msg.toString().should.equal('Hello world!\n'));
    });

    it('should read multiple messages', () => {
        const reader = createReader(socket, 200);
        socket.emit('data', Buffer.from('Hello\nWorld'));
        setTimeout(() => socket.emit('data', Buffer.from('\nPeace\n')), 50);
        return Promise.resolve()
            .then(() => read())
            .then(msg => msg.toString().should.equal('Hello\n'))
            .then(() => read())
            .then(msg => msg.toString().should.equal('World\n'))
            .then(() => read())
            .then(msg => msg.toString().should.equal('Peace\n'));

        function read() {
            return reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')));
        }
    });

    it('should reject concurrent read attempts', done => {
        const reader = createReader(socket, 200);
        const firstRead = reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')));
        reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')));
        socket.emit('data', Buffer.from('Hello\nWorld'));
        firstRead.then(() => {
            done(new Error('Unexpected'));
        }, () => done());
    });

});

function createFakeSocket() {
    const socket = new EventEmitter();
    socket.close = function() {
        socket.emit('close');
    };
    return socket;
}
