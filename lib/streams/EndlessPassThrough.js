'use strict';

const stream = require('stream');

class EndlessPassThrough extends stream.PassThrough {
    end() {
        console.log('EndlessPassThrough suppressed end');
        // noop
    }

    _end(...args) {
        return super.end(...args);
    }
}

module.exports = EndlessPassThrough;
