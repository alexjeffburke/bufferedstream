var assert = require('assert');
var Stream = require('stream');
var BufferedStream = require('../buffered-stream');

describe('A BufferedStream', function () {
  describe('when newly created', function () {
    var stream = new BufferedStream;

    it('is an instance of Stream', function () {
      assert.ok(stream instanceof Stream);
    });

    it('is empty', function () {
      assert.ok(stream.empty);
    });

    it('is not full', function () {
      assert.ok(!stream.full);
    });

    it('is readable', function () {
      assert.ok(stream.readable);
    });

    it('is writable', function () {
      assert.ok(stream.writable);
    });

    it('is not paused', function () {
      assert.ok(!stream.paused);
    });

    it('is not ended', function () {
      assert.ok(!stream.ended);
    });

    it('does not have an encoding', function () {
      assert.ok(!stream.encoding);
    });
  });

  describe('with a maxSize of 0', function () {
    it('is not full', function () {
      var stream = new BufferedStream(0);
      assert.ok(!stream.full);
    });
  });

  describe('setEncoding', function () {
    it('sets the encoding of the stream', function () {
      var stream = new BufferedStream;
      stream.setEncoding('utf8');
      assert.equal(stream.encoding, 'utf8');
    });
  });

  describe('that is paused', function () {
    var stream;
    beforeEach(function () {
      stream = new BufferedStream;
      stream.pause();
    });

    it('only emits "end" after it is resumed', function (done) {
      var endWasCalled = false;
      stream.on('end', function () {
        endWasCalled = true;
      });

      stream.end();
      assert.equal(endWasCalled, false);

      setTimeout(function () {
        stream.resume();
        setTimeout(function () {
          assert.equal(endWasCalled, true);
          done();
        }, 5);
      }, 0);
    });
  });

  describe('when paused and resumed multiple times', function () {
    var count;
    beforeEach(function (callback) {
      count = 0;

      var stream = new BufferedStream('Hello world');
      stream.pause();
      stream.resume();
      stream.pause();
      stream.resume();

      stream.on('end', function () {
        count += 1;
        callback(null);
      });
    });

    it('emits end only once', function () {
      assert.equal(count, 1);
    });
  });

  describe('pipe', function () {
    it('does not throw if a stream error occurs', function (callback) {
      var error = new Error('BOOM');

      // create a source stream which errors on read
      var source = new Stream.Readable();
      source._read = function () {
        this.emit('error', error);
      };

      var stream = new BufferedStream();
      stream.on('error', function (e) {
        // ensure errors pass into the buffered stream
        try {
          assert.strictEqual(e, error);

          callback(null);
        } catch (e) {
          callback(e);
        }
      });

      // connect an error handler (this is before for old streams compatibility)
      source.on('error', stream.emit.bind(stream, 'error'));
      // now connect them to trigger the erroring write
      source.pipe(stream);
    });

    describe('when piping into another stream', function () {
      it('does not throw if a stream error occurs', function (callback) {
        var error = new Error('BOOM');

        var stream = new BufferedStream;
        stream.on('error', function (e) {
          try {
            assert.strictEqual(e, error);

            callback(null);
          } catch (e) {
            callback(e);
          }
        });

        // create a target stream which errors on write
        var target = new Stream.Writable();
        target._write = function (chunk, encoding, callback) {
          callback(error);
        };
        // now connect them to trigger the erroring write
        stream.pipe(target);
        // connect an error handler
        target.on('error', stream.emit.bind(stream, 'error'));

        // cause data to pass into the target
        stream.write('foo');
      });
    });
  });

  describe('unshift', function () {
    it('throws when a stream is not writable', function () {
      var stream = new BufferedStream;
      stream.writable = false;
      assert.throws(function () {
        stream.write('test');
      }, /not writable/);
    });

    it('throws when a stream is already ended', function () {
      var stream = new BufferedStream;
      stream.end();
      assert.throws(function () {
        stream.unshift('test');
      }, /already ended/);
    });

    it('should add the chunk as the first buffer and increment the size', function () {
      var stream = new BufferedStream;
      stream.write('stuff', 'utf8');
      stream.unshift('some', 'utf8');
      assert.strictEqual(stringifyData(stream._buffer), 'somestuff');
      assert.strictEqual(stream.size, 9);
    });
  });

  describe('write', function () {
    it('throws when a stream is not writable', function () {
      var stream = new BufferedStream;
      stream.writable = false;
      assert.throws(function () {
        stream.write('test');
      }, /not writable/);
    });

    it('throws when a stream is already ended', function () {
      var stream = new BufferedStream;
      stream.end();
      assert.throws(function () {
        stream.write('test');
      }, /already ended/);
    });

    describe('when called with a string in base64 encoding', function () {
      it('uses the proper encoding', function (callback) {
        var content = 'hello';
        var stream = new BufferedStream;
        stream.write(new Buffer(content).toString('base64'), 'base64');
        stream.end();

        collectDataInString(stream, function (string) {
          assert.equal(string, content);
          callback(null);
        });
      });
    });
  });

  describe('end', function () {
    var stream;
    beforeEach(function () {
      stream = new BufferedStream;
      stream.end();
    });

    it('makes a stream ended', function () {
      assert.ok(stream.ended);
    });

    it('throws an error when end is called', function () {
      assert.throws(function () {
        stream.end();
      }, /already ended/);
    });
  });

  testSourceType('String', String);
  testSourceType('Buffer', Buffer);
  testSourceType('BufferedStream', BufferedStream);
});

function collectData(stream, callback) {
  var data = [];

  stream.on('data', function (chunk) {
    data.push(chunk);
  });

  stream.on('end', function () {
    callback(data);
  });
}

function stringifyData(data) {
  return data.map(function (chunk) {
    return chunk.toString();
  }).join('');
}

function collectDataInString(stream, callback) {
  collectData(stream, function (data) {
    callback(stringifyData(data));
  });
}

function collectDataFromSource(source, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  var stream = new BufferedStream(source);
  stream.encoding = encoding;
  collectData(stream, callback);

  if (typeof source.resume === 'function') {
    source.resume();
  }

  return stream;
}

function temporarilyPauseThenCollectDataFromSource(source, encoding, callback) {
  var stream = collectDataFromSource(source, encoding, callback);
  stream.pause();
  setTimeout(function () {
    stream.resume();
  }, 1);
}

function testSourceType(sourceTypeName, sourceType) {
  describe('when sourced from a ' + sourceTypeName, function () {
    var content = 'Hello world';
    var source;
    beforeEach(function () {
      source = sourceType(content);
      if (typeof source.pause === 'function') {
        source.pause();
      }
    });

    it('emits its content as Buffers', function (callback) {
      collectDataFromSource(source, function (data) {
        data.forEach(function (chunk) {
          assert.ok(chunk instanceof Buffer);
        });
        assert.equal(stringifyData(data), content);
        callback(null);
      });
    });

    describe('and an encoding is set', function () {
      it('emits its content as strings', function (callback) {
        collectDataFromSource(source, 'utf8', function (data) {
          data.forEach(function (chunk) {
            assert.equal(typeof chunk, 'string');
          });
          assert.equal(stringifyData(data), content);
          callback(null);
        });
      });
    });

    describe('and temporarily paused', function () {
      it('emits its content as Buffers', function (callback) {
        temporarilyPauseThenCollectDataFromSource(source, function (data) {
          data.forEach(function (chunk) {
            assert.ok(chunk instanceof Buffer);
          });
          assert.equal(stringifyData(data), content);
          callback(null);
        });
      });

      describe('and an encoding is set', function () {
        it('emits its content as strings', function (callback) {
          temporarilyPauseThenCollectDataFromSource(source, 'utf8', function (data) {
            data.forEach(function (chunk) {
              assert.equal(typeof chunk, 'string');
            });
            assert.equal(stringifyData(data), content);
            callback(null);
          });
        });
      });
    });
  });
}
