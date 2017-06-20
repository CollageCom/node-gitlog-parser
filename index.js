
var Writable = require('stream').Writable;
var util = require('util');
var byline = require('byline');

function Gitlog() {
  if (!(this instanceof Gitlog))
    return new Gitlog();

  Writable.call(this, arguments);
  this._current = null;
}
util.inherits(Gitlog, Writable);

var changeRegx = new RegExp(/(\d+) files? changed(, (\d+) insertions?\(\+\))?(, (\d+) deletions?\(\-\))?/i)
var fileRegx = new RegExp(/([^\s]+)\s+\|\s+((Bin.*)|(\d+))/i);

function parseMessage(obj) {
  obj.fileMap = {}; // Map of file name -> number of changed lines
  obj.message.forEach(function(line) {
    // Skip comments, merge strings, etc.
    if(line[0] != ' ' || line[1]  == ' ')
      return;
    line = line.slice(1);
    var match;
    if(match = line.match(changeRegx))
    {
      // We don't care about this
    }
    else if(match = line.match(fileRegx))
    {
      if(match[3])  // Binary file
        return;
      var fname = match[1];
      var count = match[4];
      obj.fileMap[fname] = count;
    }
    else
      throw Error('Failed parsing line ' + line);
  });
}

Gitlog.prototype._write = function(chunk, encoding, callback) {
  if(isFirstLine(chunk))
  {
    if(this._current)
    {
      parseMessage(this._current);
      this.emit('commit', this._current);
    }
    this._current = {
      hash: chunk.slice(7, 47)+'',
      message: []
    };
  }
  else
  {
    var pair = (chunk+'').split(': ');
    if(pair && pair.length >= 2)
    {
      // Author line
      if(pair[0].toLowerCase() === 'author')
      {
        var sp = pair[1].split(' <');
        this._current.author = {
          name: sp[0],
          email: sp[1].slice(0, sp[1].length-1)
        };
      }
      // Date line
      else if(pair[0].toLowerCase() === 'date')
      {
        this._current.date = new Date(pair[1].trim());
      }
      // Commit message
      else
      {
        this._current.message.push(chunk+'');
        //this._current[pair[0]] = pair[1];
      }
    }
    else
    {
      this._current.message.push(chunk+'');
    }
  }
  callback(null);
}

function isFirstLine(chunk) {
  return chunk.length == 47 && chunk.slice(0, 6)+'' === 'commit'
}

exports.parse = function(src) {
  if (!src.pipe) throw new Error('first argument must be Readable');
  var gl = Gitlog();
  gl.on('finish', function() {
    gl.emit('commit', gl._current);
  });
  var bysrc = byline(src);
  // Forward the close event since byline doesn't handle it
  src.on('close', function() {
    gl.emit('commit', gl._current);
    gl.emit('close');
  });
  return bysrc.pipe(gl);
}

