var streams = require('stream');
fs = require('fs');

function getSongs() {
  fs.readdir(__dirname + '/iPhone Music', function (err, files) {
   console.log(files)
  });
}

//getSongs();

function getLibrary() {
  var library_songs = [];
  var library_obj = {};
  var contents = streams.Writable();
  var hugeString;

  contents._write = function (chunk, enc, next) {
    hugeString += chunk
    next();
  }

  var splitter = function (dict) {
    var dict = dict.toString().split('\n');

    // Get the lines that define a file location
    raw_locations = dict.filter(function (val) {
      return val.includes('Location')
    });

    // Remove tabs, regex and split out the raw path, and remove any empty entries
    splitstr = raw_locations.map(function (val) {
      return val
        .trim()
        .replace(/%20/g, ' ')
        .split(/<\w+>|<\/\w+>|\//g)
        .filter(Boolean);
    });

    splitstr.forEach(function (val) {
      if (val[val.length - 3] !== 'podcast'
          && val[val.length - 2] !== 'Voice Memos'
          && val[val.length - 3] !== '~5') {

        // Map to the artist, album, and track
        var artist = decodeURIComponent(val[val.length - 3]);
        var album = decodeURIComponent(escape(val[val.length - 2]));
        console.log(val[val.length - 1]);
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

  var stream = fs.createReadStream(__dirname + '/Library.xml', {flags: 'r', encoding: 'utf8' }).pipe(contents);
  stream.on('finish', function() {
    splitter(hugeString);
    console.log(library_obj);
  });
}

getLibrary();
