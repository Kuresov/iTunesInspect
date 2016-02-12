streams = require('stream');
fs = require('fs');

function getSongs(dir) {
  var libraryObj = {};
  var artists = fs.readdirSync(dir);

  artists.forEach(function (artist) {
    libraryObj[artist] = new Object;
    var albums = fs.readdirSync(dir + '/' + artist);

    albums.forEach(function (album) {
      songlist = fs.readdirSync(dir + '/' + artist + '/' + album);
      libraryObj[artist][album] = songlist;
    });
  });
}

// getSongs('../Music');

function getLibrary() {
  var parseItunesLib = streams.Transform( {objectMode: true} );
  var buildUserLib = streams.Writable( {objectMode:true} );
  var library_songs = [];
  var library_obj = {};
  var buffer = [];
  var recordLen = 0;

  // Compute the length that each filename array should be, to test if the stream chunk cuts it off.
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

  parseItunesLib._transform = function (chunk, enc, next) {
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

    // Ensure that rawLocations actually includes data, as it's possible for it to be empty.
    if (rawLocations.length > 0) {
      var splitStr = rawLocations.map(function (val) {
        return libStringToArray(val)
      });

      // Get number of parts for a splitStr record (file path plus file name)
      recordLen = averageArrayLength(splitStr);
      var splitStrLen = splitStr.length;

      // Check if the last filename array is shorter than the rest (and therefore, has been cut off). If so, append this to the buffer variable, and move on.
      if (splitStr[splitStrLen - 1].length !== recordLen
          || splitStr[splitStrLen - 1][recordLen - 1].slice(-4) !== '.mp3') {
        buffer = buffer.concat(splitStr);
      }

      // Send to buildUserLib if buffer ends with a complete filename, and empty the buffer. Otherwise, send it to the buffer variable, and get the next chunk.
      if (splitStr[splitStrLen - 1].length === recordLen
          && splitStr[splitStrLen - 1][recordLen - 1].slice(-4) === '.mp3') {
        this.push(splitStr);
        buffer = [];
      }
    }

    next();
  }

  buildUserLib._write = function (filenameArr, enc, next) {

    filenameArr.forEach(function (val) {
      // Ignore podcasts (defined by the keyword and ~5) and Voice Memos
      if (val[val.length - 3] !== 'podcast'
          && val[val.length - 3] !== '~5'
          && val[val.length - 2] !== 'Voice Memos') {

        // Map to the artist, album, and track with proper foreign characters
        var artist = decodeURIComponent(val[val.length - 3]);
        var album = decodeURIComponent(val[val.length - 2]);
        var track = decodeURIComponent(val[val.length - 1]);

        // Create nested artist objects of album objects containing an array of tracks
        if (library_obj[artist] && library_obj[artist][album]) {
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
        .pipe(parseItunesLib)
        .pipe(buildUserLib);

  stream.on('finish', function () {
    console.log('Library', library_obj);
  });
}

//getLibrary();


var exLib = {
  Drake: { DrakeAlbum: ['song1', 'song2'] },
  // Bob: {
  //   BobAlbum: ['song1', 'song2'],
  //   BobAlbum2: ['song3', 'song4']
  // }
}

var exDisk = {
  // Bob: {
  //   BobAlbum: ['song1'],
  //   BobAlbum3: ['song3', 'song4']
  // },
  Drake: {
    DrakeAlbum2: ['song3', 'song4'],
    DrakeAlbum: ['song1', 'song2']
  },
  //Alex: { AlexAlbum: ['alexSong'] }
}

function compare(library, disk) {
  var missingFromLib = {};
  var missingFromDisk = {};
  var libraryArtists = Object.keys(disk);

  libraryArtists.forEach(function(artist) {
    //setProp(artist, disk[artist], library, missingFromLib);
    setProp(artist, library, disk);
  });

  function setProp(artist, libraryObj, diskObj) {
    // Compare the Disk object first
    var albums = Object.keys(diskObj[artist]);

    albums.forEach(function(album) {
      // If the album doesn't exist at all, push the whole thing to the missing object list
      if (!libraryObj[artist].hasOwnProperty(album)) {
        if (missingFromLib[artist] === undefined) { missingFromLib[artist] = new Array; }
        missingFromLib[artist].push(album);
      } else {
        // Otherwise, examine the songs in that album...

      }
    });
  }

  console.log('Missing from Lib', missingFromLib);
  // console.log('Missing from Disk', missingFromDisk);




  //function setProp(path, value, compareObj, memo, index) {
  //  var memo = memo || {};
  //  var index = index || 0;
  //  if (!Array.isArray(path)) { path = path.split('/'); };
  //  var nextChild = path[0];
  //  console.log('---');
  //  console.log('memo', memo);
  //  console.log('path', path);
  //  console.log('value', value);

  //  // if object has path[0],
  //  //   recurse to the next child (the first level of value)

  //  // if object does not have path[0],
  //  //   create it (new Object)
  //  //   recurse to next child (the first level of value)

  //  console.log('Compare has path[index]:', compareObj.hasOwnProperty(path[index]));

  //  if (compareObj.hasOwnProperty(path[index])) {
  //    // We have the property, but attributes may be mixed. Recurse further.
  //    console.log('recursing');
  //    setProp(path, value, compareObj[nextChild], memo, index + 1);
  //    return;
  //  } else {
  //    console.log("Adding all attributes");
  //    // We do not have the property, or its attributes. Add them all to the memo.
  //    memo[path[index]] = value;
  //    return;
  //  }
  //}
  
}

compare(exLib, exDisk);
