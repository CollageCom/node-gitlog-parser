
var parselog = require('./index').parse;
var exec = require('child_process').exec;
var fs = require('fs');
var readStream = fs.createReadStream('fulloutput.txt');

//var logout = exec('git log').stdout;

function splitSlash(str) {
  var rv = [];
  var splits = str.split(/\//g);
  var curstr = '';
  splits.forEach(function(split) {
    if(curstr.length > 0)
      curstr += '/';
    curstr += split;
    rv.push(curstr);
  });
  return rv;
};

var parseCmd = parselog(readStream);
var dirCounts = {};
var fileCounts = {};
var lastDirCounts = {};
var authorCounts = {};
var total = 0;
var blockedPaths = [
  '.svg',
  '/jslib',
  '/css/',
  '/stylesheets',
  'fixture',
  '.sql',
  '.dump',
  '.html',
  '.log',
  '.csv',
  '.ini',
  '/fonts/',
  '/img/',
  '/sprites/',
  '/script/',
  'node_modules'
];

var extensions = {
  js: 'JS',
  'hbs.html': 'Handlebars',
  scss: 'Styles',
  less: 'Sytles',
  php: 'PHP',
  json: 'JSON',
  // We don't care about these file types because they aren't code
  xml: null,
  svg: null,
}

var prefixes = {
  htdocs: {
    // js modules, legacy php scripts
    _TYPE: 'frontend',
    js: {
      __admin: {
        _TYPE: 'admin',
      },
      modules: {
        // Ignore this one -- it's covered by productinfo.json
        'productinfo.js': null,
      },
      models: {
        _SUBTYPE: 'model',
      },
      pageviews: {
        _SUBTYPE: 'pageview',
      },
      views: {
        _SUBTYPE: 'view',
      },
      'wrappersingle.js': {
        _SUBTYPE: 'pageview',
      }
      // The default
      _SUBTYPE: 'modules',
    },
    admin: {
      _TYPE: 'admin',
    },
    templates: {
      _SUBTYPE: 'templates',
      __admin: {
        _TYPE: 'admin',
      },
      helpers: {
        // These are sitecode becuase they are JS
      },
      pageviews: {
        _SUBTYPE: 'pageview',
      },
      _products: {
        _SUBTYPE: 'pageview',
      },
      _prodcat: {
        _SUBTYPE: 'pageview',
      },
      _deal: {
        _SUBTYPE: 'pageview',
      },
      _dealblocks: {
        _SUBTYPE: 'pageview',
      },
    },
    test: {
      _TYPE: 'test',
      fixtures: null, // Don't count these
    },
    // Exclude all of these
    jslib: null,
    css: null,
    cmcss: null,
    img: null,
    fonts: null,
    script: null,
    sprites: null,
    svg: null,
  },
  includes: {
    
  },
  
  tests: {
    
  },
}

parseCmd.on('commit', function(commit) {
  // Skip commits before July 2015 (past two years)
  if(commit.date < new Date('2015-07-01'))
    return;
  
  if(!(commit.author.name in authorCounts))
    authorCounts[commit.author.name] = 0;
  for(var k in commit.fileMap)
  {
    // Ignore these files, which aren't actually in the repo.
    if(k.slice(0, 2) == '..')
      continue;
    var ct = parseInt(commit.fileMap[k]);
    var dirs = splitSlash(k);
    dirs.pop();
    var lastdir = null;
    dirs.forEach(function(tok) {
      if(!(tok in dirCounts))
        dirCounts[tok] = 0;
      dirCounts[tok] += ct;
      lastdir = tok;
    });
    if(lastdir)
    {
      lastdir += '/*';
      if(!(lastdir in lastDirCounts))
        lastDirCounts[lastdir] = 0;
      lastDirCounts[lastdir] += ct;
    }
    
    var blocked = false;
    blockedPaths.forEach(function(path) {
      if(k.indexOf(path) != -1)
        blocked = true;
    });
    if(!blocked)
    {
      if(!(k in fileCounts))
        fileCounts[k] = 0;
      fileCounts[k] += ct;
    }
    
    authorCounts[commit.author.name] += ct;
  }
  
  total++;
});

parseCmd.on('close', function() {
  //console.log(dirCounts);
  //console.log(authorCounts);
  
  //var outmap = lastDirCounts;
  var outmap = fileCounts;
  
  var dirs = Object.keys(outmap);
  dirs.sort();
  dirs.forEach(function(name) {
    // Dump CSV with all of the directory counts
    console.log(name + ',' + outmap[name]);
  });
});

