var streams = require('stream');
fs = require('fs');

function getSongs() {
  fs.readdir('../Music', function (err, files) {
   console.log(files)
  });
}

//getSongs();

function getLibrary() {
  var contents = streams.Transform( {objectMode: true} );
  var splitter = streams.Writable( {objectMode:true} );
  var library_songs = [];
  var library_obj = {};
  var buffer = [];
  var recordLen = 0;

  function averageArrayLength(arr) {
    var total = 0;
    arr.forEach((record, i) => {
      total += record.length;
    });
    return Math.ceil(total / (arr.length));
  }

  // Remove spaces and tabs, regex and split out the raw path, and remove any empty entries for strings from the Library file.
  function libStringToArray(string) {
    return string.trim()
      .replace(/%20/g, ' ')
      .split(/<\w+>|<\/\w+>|\//g)
      .filter(Boolean);
  }

  contents._transform = function (chunk, enc, next) {
    var filenameArray = chunk.toString().split('\n');

    // If the new array has a filename in the first line, and the last buffer entry has a partial filename, we want to pull the rest of the string out and concat it into the buffer to have a complete record.
    var lastBufferRecord = buffer[buffer.length - 1];
    if (buffer.length > 0
        && filenameArray[0].indexOf('.mp3') > -1
        && lastBufferRecord[lastBufferRecord.length - 1].indexOf('.mp3') === -1
        && buffer[buffer.length - 1].length === recordLen) {
      var filenameParts = libStringToArray(filenameArray[0]);
      var partialFilename = filenameParts.filter( (val) => {
        return val.includes('.mp3');
      });

      buffer[buffer.length - 1][recordLen - 1] = buffer[buffer.length - 1][recordLen - 1].concat(partialFilename);
    }

    // If the last buffer array has too few fields, append the first array of the new chunk to it.
    if (buffer.length > 0
        && buffer[buffer.length - 1].length < recordLen) {
      var remainingFields = libStringToArray(filenameArray[0]);
      buffer[buffer.length - 1] = buffer[buffer.length - 1].concat(remainingFields);
    }

    // Get only the lines that define a file location
    var rawLocations = filenameArray.filter(function (val) {
      return val.includes('Location')
    });

    var splitStr = rawLocations.map(function (val) {
      return libStringToArray(val)
    });

    // Get number of parts for a splitStr record (file path plus file name)
    recordLen = averageArrayLength(splitStr);
    var splitStrLen = splitStr.length;

    //Check if the last filename array is shorter than the rest (and therefore, has been cut off). If so, append this to the buffer variable, and move on.
    if (splitStr[splitStrLen - 1].length !== recordLen
        || splitStr[splitStrLen - 1][recordLen - 1].slice(-4) !== '.mp3') {
      buffer = buffer.concat(splitStr);
      next();
    }

    // Send to Splitter if buffer ends with a complete filename, and empty the buffer
    if (splitStr[splitStrLen - 1].length === recordLen
        && splitStr[splitStrLen - 1][recordLen - 1].slice(-4) === '.mp3') {
      this.push('string');
      //this.push(splitStr);
      buffer = [];
    } else {
      // Again, for debugging
      // console.log(splitStr);
      // console.log('Incomplete! Buffer length: ', buffer.length);
      // console.log('recordLen', recordLen);
      // console.log('Last record len', splitStr[splitStrLen - 1].length);
      // console.log('Last record vs Record Len:', splitStr[splitStrLen - 1].length === recordLen);
      // console.log('Last record Filename Complete:', splitStr[splitStrLen - 1][recordLen - 1].slice(-4) === '.mp3');
        //return;
    }

    next();
  }

  // contents.on('error', (err) => console.log(err))

  contents.on('drain', () => console.log('drain'));
  contents.on('end', () => console.log('end'));
  contents.on('finish', () => console.log('finish'));
  contents.on('close', () => console.log('close'));

  contents._flush = () => { this.push(null); console.log('done') };

  splitter._write = function (filenameArr, enc, next) {
    console.log('splitter');

    filenameArr.forEach(function (val) {
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
    next();
  }

  var stream = fs.createReadStream('Library.xml', {flags: 'r', encoding: 'utf8' })
        .pipe(contents)
        //.pipe(splitter);
        //.pipe(test);

  stream.on('finish', function() {
    console.log('stream end');
    console.log('Library', library_obj);
  });
}

getLibrary();
