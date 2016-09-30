'use strict';

const expect = require('expect');
const Dechunk = require('../../lib/streams/Dechunk.js');

// String from nodejs/node tests
const UTF8_COMPONENTS = [
    '南越国是前203年至前111年存在于岭南地区的一个国家，',
    '国都位于番禺，疆域包括今天中国的广东、广西两省区的大部份地区，福建省、湖南、',
    '贵州、云南的一小部份地区和越南的北部。南越国是秦朝灭亡后，',
    '由南海郡尉赵佗于前203年起兵兼并桂林郡和象郡后建立。前196年和前179年，',
    '南越国曾先后两次名义上臣属于西汉，成为西汉的“外臣”。前112年，',
    '南越国末代君主赵建德与西汉发生战争，被汉武帝于前111年所灭。',
    '南越国共存在93年，历经五代君主。南越国是岭南地区的第一个有记载的政权国家，',
    '采用封建制和郡县制并存的制度，它的建立保证了秦末乱世岭南地区社会秩序的稳定，',
    '有效的改善了岭南地区落后的政治、经济现状。'
];

describe('streams.Dechunk', () => {
    const NL = Buffer.from('\n');

    it('should dechunk single piece', done => {
        const stream = new Dechunk(NL);
        const string = '12345';
        const chunk = Buffer.from(`${string.length}${NL}${string}${NL}`);
        stream.once('data', data => {
            expect(data.toString()).toBe(string);
            done();
        });
        stream.write(chunk);
    });

    it('should dechunk multiple pieces in a single chunk', done => {
        const stream = new Dechunk(NL);
        const string = '12345';
        const chunk = Buffer.from(`2${NL}12${NL}3${NL}345${NL}`);
        stream.once('data', data => {
            expect(data.toString()).toBe(string);
            done();
        });
        stream.write(chunk);
    });

    it('should dechunk multiple UTF8 pieces in a single chunk', done => {
        const stream = new Dechunk(NL);
        const chunk = UTF8_COMPONENTS.reduce((chunk, string) => {
            const payload = Buffer.from(string);
            const piece = Buffer.concat([Buffer.from(`${payload.length.toString(16)}${NL}`), payload, Buffer.from(NL)]);
            return Buffer.concat([chunk, piece]);
        }, new Buffer(0));
        stream.once('data', data => {
            expect(data.toString()).toBe(UTF8_COMPONENTS.join(''));
            done();
        });
        stream.write(chunk);
    });

    it('should dechunk pieces ending with NL', () => {
        const stream = new Dechunk(NL);

        for (let i = 0; i < UTF8_COMPONENTS.length; ++i) {
            const buffer = Buffer.from(UTF8_COMPONENTS[i]);
            const chunk = Buffer.from(`${buffer.length.toString(16)}${NL}${buffer}${NL}`);
            stream.once('data', data => {
                expect(data.toString()).toBe(UTF8_COMPONENTS[i]);
            });
            stream.write(chunk);
        }
    });

    it('should dechunk multiple pieces in multiple chunks', done => {
        const stream = new Dechunk(NL);
        const components = ['123456', '789012', 'asdqq', '123', '!@#$%^&*()'];
        const chunk = components.reduce((chunk, string) => {
            const payload = Buffer.from(string);
            const piece = Buffer.concat([Buffer.from(`${payload.length.toString(16)}${NL}`), payload, Buffer.from(NL)]);
            return Buffer.concat([chunk, piece]);
        }, new Buffer(0));
        const received = [];
        stream.on('data', data => {
            received.push(data);
        });
        const step = 30;
        for (let i = 0; i < chunk.length; i += step) {
            stream.write(chunk.slice(i, i + step));
        }
        expect(Buffer.concat(received).toString()).toBe(components.join(''));
        done();
    });

    it('should work when intermediate chunk starts with NL', done => {
        const stream = new Dechunk(NL);
        const components = ['01234', 'abcde', 'ABCDE', 'fghij', 'FGHIJ'];
        const chunk = components.reduce((chunk, string) => {
            const payload = Buffer.from(string);
            const piece = Buffer.concat([Buffer.from(`${payload.length.toString(16)}${NL}`), payload, Buffer.from(NL)]);
            return Buffer.concat([chunk, piece]);
        }, new Buffer(0));
        const received = [];
        stream.on('data', data => {
            received.push(data);
        });
        const step = components[0].length + NL.length - 1;
        for (let i = 0; i < chunk.length; i += step) {
            stream.write(chunk.slice(i, i + step));
        }
        expect(Buffer.concat(received).toString()).toBe(components.join(''));
        done();
    });

    it('should dechunk multiple UTF8 pieces in multiple chunks', done => {
        const stream = new Dechunk(NL);
        const chunk = UTF8_COMPONENTS.reduce((chunk, string) => {
            const payload = Buffer.from(string);
            const piece = Buffer.concat([Buffer.from(`${payload.length.toString(16)}${NL}`), payload, Buffer.from(NL)]);
            return Buffer.concat([chunk, piece]);
        }, new Buffer(0));
        const received = [];
        stream.on('data', data => {
            received.push(data);
        });
        const step = 30;
        for (let i = 0; i < chunk.length; i += step) {
            stream.write(chunk.slice(i, i + step));
        }
        expect(Buffer.concat(received).toString()).toBe(UTF8_COMPONENTS.join(''));
        done();
    });

    it('should work with 0 length chunks', done => {
        const stream = new Dechunk(NL);
        const string = '12345';
        const chunk = Buffer.from(`2${NL}12${NL}0${NL}3${NL}345${NL}`);
        stream.once('data', data => {
            expect(data.toString()).toBe(string);
            done();
        });
        stream.write(chunk);
    });

    it('should emit error when chunk header is invalid', done => {
        const stream = new Dechunk(NL);
        const chunk = Buffer.from(`2${NL}12${NL}3invalid${NL}345${NL}`);
        stream.on('data', data => {
            console.log('data', data.toString());
        });
        stream.on('error', err => {
            expect(err).toBeAn(Error);
            done();
        });
        stream.write(chunk);
    });

    it('should emit error when chunk is longer', done => {
        const stream = new Dechunk(NL);
        const chunk = Buffer.from(`2${NL}12extra${NL}3${NL}345${NL}`);
        stream.on('data', data => {
            console.log('data', data.toString());
        });
        stream.on('error', err => {
            expect(err).toBeAn(Error);
            done();
        });
        stream.write(chunk);
    });

    it('should save unconsumed buffer when error occurs', done => {
        const stream = new Dechunk(NL);
        const string = `2invalid${NL}12${NL}3${NL}345${NL}`;
        const chunk = Buffer.from(string);
        stream.on('data', data => {
            console.log('data', data.toString());
        });
        stream.on('error', () => {
            expect(stream.unconsumed.toString()).toBe(string);
            done();
        });
        stream.write(chunk);
    });
});
