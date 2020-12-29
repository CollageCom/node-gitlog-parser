
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
  'html': 'HTML',
  scss: 'Styles',
  less: 'Sytles',
  php: 'PHP',
  json: 'JSON',
  // We don't care about these file types because they aren't code
  xml: null,
  svg: null,
  dump: null,
  ini: null,
  csv: null,
  log: null,
  sq: null,
};

var prefixes = {
  prerender: {
    _TYPE: 'frontend',
  },
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
      },
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
        // These are JS
        _SUBTYPE: 'modules',
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
      _SUBTYPE: 'karma',
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
    stylesheets: null,
    'rdata_output_blanket45.json': null,
    'rdata_pricemap_blanket45.json': null,
    'rdata_raw_blanket45.json': null,
  },
  smarty: {
    _TYPE: 'backend',
    _SUBTYPE: 'templates',
  },
  includes: {
    _TYPE: 'backend',
    obj: {
      _SUBTYPE: 'rest',
    },
    'simplepage.php': {
      _TYPE: 'frontend',
    },
    vendor: null,
    lib: null,
  },
  tests: {
    _TYPE: 'test',
    _SUBTYPE: 'ghost',
    phpunit: {
      _SUBTYPE: 'phpunit',
    },
    nightwatch: null,
    data: null
  },
  util: {
    groupon: null,
  },
  node_modules: null,
  sql: null,
};

var parseCmd = parselog(readStream);
var dirCounts = {};
var fileCounts = {};
var commitCounts = {};
var lastDirCounts = {};
var authorCounts = {};
var dedupe = {};
var total = 0;

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
    if(!(k in fileCounts))
    {
      fileCounts[k] = 0;
      commitCounts[k] = 0;
    }
    fileCounts[k] += ct;
    var deDupeKey = k + commit.author.name +
        commit.date.toDateString();
    if(!(deDupeKey in dedupe))
    {
      dedupe[deDupeKey] = true;
      commitCounts[k] += 1;
    }
    
    /*
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
    */
    
    authorCounts[commit.author.name] += ct;
  }
  
  total++;
});

function outputFileCounts(fileCounts, commitCounts) {
  console.log('type,subtype,filetype,filename,linechanges,commits');
  
  var names = Object.keys(fileCounts);
  names.sort();
  names.forEach(function(name) {
    // Compute the file type based on the extension
    var dotsplit = name.split(/\./g);
    var ftype = 'other';
    if(dotsplit.length > 1)
    {
      var ext = dotsplit[dotsplit.length-1];
      var extname = extensions[ext];
      if(extname === null)
        return; // Skip
      else if(extname)
        ftype = extname;
    }
    
    // Find the file in the extension map
    var curPrefixes = prefixes;
    var type = 'other';
    var subtype = '';
    var slashes = name.split(/\//g);
    var curidx = 0;
    while(1)
    {
      var part = slashes[curidx++];
      curPrefixes = curPrefixes[part];
      if(curPrefixes === null)
        return; // blocked
      else if(!curPrefixes)
        break;
      
      if(curPrefixes._TYPE)
        type = curPrefixes._TYPE;
      
      if(curPrefixes._SUBTYPE)
        subtype = curPrefixes._SUBTYPE;
    }
    
    // Dump CSV with all of the directory counts
    console.log([type, subtype, ftype, name, fileCounts[name],
        commitCounts[name]].join());
  });
}

parseCmd.on('close', function() {
  //console.log(dirCounts);
  //console.log(authorCounts);
  
  outputFileCounts(fileCounts, commitCounts);
});

