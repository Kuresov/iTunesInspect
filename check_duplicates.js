streams = require('stream');
fs = require('fs');

// Compute the length that each filename array should be, to test if the stream chunk cuts it off.
function averageArrayLength(arr) {
  var total = 0;
  arr.forEach((record, i) => {
    total += record.length;
  });
  return Math.ceil(total / (arr.length));
}

// Remove spaces and tabs, regex and split out the raw path, and remove any empty
// entries for strings from the Library file.
function libStringToArray(string) {
  return string.trim()
    .replace(/%20/g, ' ') // Add proper whitespacing
    .replace(/&#(\d{0,4});/g, function(fullStr, str) { return String.fromCharCode(str); }) // Fix HTML codes
    .split(/<\w+>|<\/\w+>|<\w+|\w+>|\//g) // Remove '<thing>', '</thing>' blocks, and partials
    .filter(Boolean); // Remove anything with a length of 0
}

// Simple check to see if a filename ends with a '.' + 3 characters
function filenameCheck(string) {
  return /\.([A-Za-z0-9]{3})$/.test(string.slice(-4));
}

// Currently not implemented. Would like to delete any items that are not of the type we're 
// looking for here, rather than in 'if' statments of the the other functions
function sanitizeBuffer(arr) {
  newArr = [];

  arr.forEach(function(item, i) {
    if (item.indexOf('Voice Memos') === -1) {
      newArr.push(arr[i]);
    } else {
      console.log('memo found');
    }
  });

  return newArr;
}

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
  return libraryObj;
}

function getLibrary() {
  var parseItunesLib = streams.Transform( {objectMode: true} );
  var buildUserLib = streams.Writable( {objectMode: true} );
  var librarySongs = [];
  var libraryObj = {};
  var buffer = [];
  var recordLen = 0;

  parseItunesLib._transform = function (chunk, enc, next) {
    var filenameArray = chunk.toString().split('\n');

    // If the new array has a partial filename in the first line, and the last buffer
    // entry has a partial filename, we want to pull the rest of the string out and
    // concat it into the buffer to have a complete record.
    var lastBufferRecord = buffer[buffer.length - 1];
    if (buffer.length > 0 &&
        !filenameCheck(filenameArray[0]) &&
        !filenameCheck(lastBufferRecord[lastBufferRecord.length - 1]) &&
        buffer[buffer.length - 1].length === recordLen) {

      var dirtyFilename = buffer[buffer.length - 1][recordLen - 1].concat(filenameArray[0]);
      var cleanFilename = libStringToArray(dirtyFilename).filter(function(val) {
        return filenameCheck(val);
      });

      if (cleanFilename.length === 0) { return; };

      buffer[buffer.length - 1][recordLen - 1] = cleanFilename.join('');
    };

    // If the last buffer array has too few fields, append fields from the new
    // array until it's the correct length
    //
    // Problem- we can't tell if the last array is actually complete or not, so sometimes we're 
    // appending the end of an artist name as the next field.
    if (buffer.length > 0 &&
      buffer[buffer.length - 1].length < recordLen - 1) {

      var nextFields = libStringToArray(filenameArray[0]);

      //if (buffer[buffer.length - 1].length < recordLen - 1) {
      //}

      if (buffer[buffer.length - 1].length + nextFields.length > recordLen) {
        // This looks disgusting. I'm sure there's a way to pass
        // this by reference or some equivalent.
        var lastBufferSubArrayItem = buffer[buffer.length - 1][buffer[buffer.length - 1].length - 1];

        buffer[buffer.length - 1][buffer[buffer.length - 1].length - 1] = lastBufferSubArrayItem.concat(nextFields.shift());
      }

      buffer[buffer.length - 1] = buffer[buffer.length - 1].concat(nextFields);
    }

    // Get only the lines that define a file location
    var rawLocations = filenameArray.filter(function (val) {
      return val.includes('Location')
    });

    // Ensure that rawLocations actually includes data, as it's possible for it to be empty.
    if (rawLocations.length > 0) {
      var filePathArray = rawLocations.map(function (val) {
        return libStringToArray(val)
      });

      // Get number of parts for a filePathArray record (file path plus file name)
      recordLen = averageArrayLength(filePathArray);
      var filePathArrayLen = filePathArray.length;

      // Check if the last filename array is shorter than the rest (and therefore,
      // has been cut off), or the last entry isn't a filename. If so, append
      // this to the buffer variable.
      if (filePathArray[filePathArrayLen - 1].length !== recordLen
          || !filenameCheck(filePathArray[filePathArrayLen - 1][recordLen - 1])) {

        buffer = buffer.concat(filePathArray);
      }

      // Send to buildUserLib if buffer ends with a complete filename, and empty
      // the buffer. Otherwise, send it to the buffer variable, and get the next chunk.
      if (filePathArray[filePathArrayLen - 1].length === recordLen
          && filenameCheck(filePathArray[filePathArrayLen - 1][recordLen - 1])) {

        if (buffer.length > 0
            && buffer[buffer.length - 1].length === recordLen
            && filenameCheck(buffer[buffer.length - 1][recordLen - 1])) {

          // We aren't getting to this point, so the last filename isn't being completed
          filePathArray = filePathArray.concat(buffer);
          buffer = [];
        }

        this.push(filePathArray);
      }
    }

    next();
  }

  buildUserLib._write = function (filenameArr, enc, next) {

    filenameArr.forEach(function (val) {
      // Ignore podcasts (defined by the keyword and ~5) and Voice Memos
      if (val[val.length - 3] !== 'Podcast'
          && val[val.length - 3] !== '~5'
          && val[val.length - 2] !== 'Voice Memos') {

        // Map to the artist, album, and track with proper foreign characters
        var artist = decodeURIComponent(val[val.length - 3]);
        var album = decodeURIComponent(val[val.length - 2]);
        // Remove song numbers from front of track name
        var track = decodeURIComponent(val[val.length - 1]).replace(/[\d]\w+\s/, '');

        // Create nested artist objects of album objects containing an array of tracks
        if (libraryObj[artist] && libraryObj[artist][album]) {
          libraryObj[artist][album] = libraryObj[artist][album].concat(track);
        } else if(libraryObj[artist] && !libraryObj[artist][album]) {
          libraryObj[artist][album] = new Array;
          libraryObj[artist][album] = libraryObj[artist][album].concat(track);
        } else {
          libraryObj[artist] = new Object;
          libraryObj[artist][album] = new Array;
          libraryObj[artist][album] = libraryObj[artist][album].concat(track);
        }
      }
    });
    next();
  }

  var stream = fs.createReadStream('Library.xml', {flags: 'r', encoding: 'utf8' })
        .pipe(parseItunesLib)
        .pipe(buildUserLib);

  var promise = new Promise(function(fulfill, reject) {
    stream.on('finish', function() {
      fulfill(libraryObj);
    });
  });
  return promise;
}

function buildMissingItems(first, second) {
  var missingFromLib = {};

  function compare(baseObj, compareObj, path) {
    path = path || [];
    var baseObjects;

    if (baseObj.constructor === Object) {
      baseObjects = Object.keys(baseObj);

      baseObjects.forEach(function(object) {
        if (compareObj[object] === undefined) {

          buildDeepObj(missingFromLib, path.concat([object]));

          getPathString(path.concat([object]), function(pathString) {
            eval('missingFromLib' + pathString + '= baseObj[object]');
          });
        } else {
          // The object is present, so check items within it
          compare(baseObj[object], compareObj[object], path.concat([object]));
        }
      });
    } else {
      var baseArray = baseObj;
      var compareArray = compareObj;
      var returnArray = [];
      var arraysEqual = true;

      baseArray.forEach(function(val) {
        if (compareArray.indexOf(val) === -1) {
          arraysEqual = false;
          returnArray.push(val)
        }
      });

      if (arraysEqual === false) {
        buildDeepObj(missingFromLib, path);
        getPathString(path, function(pathString) {
          eval('missingFromLib' + pathString + '= returnArray');
        });
      }
    }
  }

  // Build an object based on the path array given. If we're on the last
  // item, create an array instead (for this use-case). I would like to
  // find a solution that doesn't involve the use of eval().
  function buildDeepObj(obj, path, next) {
    var next = next || 0;
    var current = '';

    for (i = 0; i <= next; i++) {
      current += '["' + path[i] + '"]';
    }

    // This will currently break if there are any backslashes
    // in the path name- escaped characters become unescaped
    // when they are eval'd
    var currentLocation = 'missingFromLib' + current;

    if (next === path.length - 1) {
      eval(currentLocation + '= []');
    } else {
      if (eval(currentLocation) === undefined) {
        eval(currentLocation + '= {}');
      }
      next++;
      buildDeepObj(obj, path, next);
    }
  }

  function getPathString(pathArr, callback) {
    var pathString = '["' + pathArr.join('"]["') + '"]';
    callback(pathString);
  }

  compare(first, second);
  return missingFromLib;
}

function comparisonManager() {
  var musicOnDisk = getSongs('../Music');
  var library = getLibrary();


  library.then(function(musicInLib) {

    console.log('Items in Disk:', Object.keys(musicOnDisk).length)
    console.log('Items in Library:', Object.keys(musicInLib).length)

    fs.writeFile('musicInLib.json', JSON.stringify(musicInLib, null, 2));
    fs.writeFile('musicOnDisk.json', JSON.stringify(musicOnDisk, null, 2));

    // The second argument is the one that items will be listed as missing from.
    //var missingItems = JSON.stringify(buildMissingItems(musicInLib, musicOnDisk), null, 2);
    var missingItems = JSON.stringify(buildMissingItems(musicOnDisk, musicInLib), null, 2);

    console.log('Disk Baseobj - items missing from Library');
    fs.writeFile('output.json', missingItems, 'utf-8');
  })
  .catch(function(err) {
    console.log(err);
  });
}

comparisonManager();
