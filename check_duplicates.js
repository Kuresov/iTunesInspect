var streams = require('stream');
fs = require('fs');

function getSongs() {
  fs.readdir('../Music', function (err, files) {
   console.log(files)
  });
}

//getSongs();

function getLibrary() {
  var contents = streams.Writable();
  var splitter = streams.Writable();
  var library_songs = [];
  var library_obj = {};
  var buffer = '';

  contents._write = function (chunk, enc, next) {
    buffer += chunk.toString();

    // Send to Splitter if buffer ends with a complete filename, and empty the buffer
    if (buffer.slice(-4) === '.mp3') {
      return buffer
      buffer = '';
    } else {
      buffer += chunk;
    }
    next();
  }

  splitter._write = function (buffer) {
    var filenameArray = buffer.split('\n');

    // Get the lines that define a file location
    rawLocations = filenameArray.filter(function (val) {
      return val.includes('Location')
    });

    // Remove spaces and tabs, regex and split out the raw path, and remove any empty entries
    splitStr = rawLocations.map(function (val) {
      return val
        .trim()
        .replace(/%20/g, ' ')
        .split(/<\w+>|<\/\w+>|\//g)
        .filter(Boolean);
    });

    splitStr.forEach(function (val) {
      if (val[val.length - 3] !== 'podcast'
          && val[val.length - 2] !== 'Voice Memos'
          && val[val.length - 3] !== '~5') {

        // Map to the artist, album, and track
        var artist = decodeURIComponent(val[val.length - 3]);
        var album = decodeURIComponent(escape(val[val.length - 2]));
        var track = decodeURIComponent(val[val.length - 1]);

        // Create nested artist objects of album objects containing an array of tracks
        if(library_obj[artist] && library_obj[artist][album]) {
          library_obj[artist][album] = library_obj[artist][album].concat(track);
        } else if(library_obj[artist] && !library_obj[artist][album]) {
          library_obj[artist][album] = new Array;
          library_obj[artist][album] = library_obj[artist][album].concat(track);
        } else {
          library_obj[artist] = new Object;
          library_obj[artist][album] = new Array;
          library_obj[artist][album] = library_obj[artist][album].concat(track);
        }
      }
    });
  }

  var stream = fs.createReadStream('Library.xml', {flags: 'r', encoding: 'utf8' }).pipe(contents).pipe(splitter);
  stream.on('finish', function() {
    //splitter(hugeString);
    console.log(library_obj);
  });
}

getLibrary();
