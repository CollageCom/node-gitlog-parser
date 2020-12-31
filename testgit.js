
var parselog = require('./index').parse;
const { exception } = require('console');
var fs = require('fs');
const process = require('process');
const { spawnSync } = require('child_process');
const moment = require('moment');

const csv = require('fast-csv');

var Readable = require('stream').Readable;

// Producted by running git log --stat
var readStream = fs.createReadStream('gitlog.txt');


class CommitCsvManager
{
  constructor(options = {})
  {
    this.filenames = {
      commits: 'commits.csv',
      branchMessages: 'commit_branch_messages.csv',
      fileChanges: 'commit_file_changes.csv',
    };
    this.repository = options.repository;
  }

  /**
   * Loads all of the commits from file
   */
  loadData()
  {
    return new Promise((resolve, reject) => {
      this.lines = [];
      fs.createReadStream(this.filename)
        .pipe(csv.parse({ headers: true }))
        .on('data', data => this.lines.push(data))
        .on('error', error => reject(error))
        .on('end', () => resolve());
    });
  }

  getLatestCommitHash()
  {
    return '31c4d595becc8e4e5c54607f69f9895d6bbf7b43';
  }

  appendCommits(commits)
  {
    // First, sort the commits by time ascending so we are adding newest data to the end of the
    // file.
    commits.sort((a, b) => {
      return a.date > b.date ? 1 : -1;
    });

    // Commits map to three tables:
    //  1. Commits themselves
    //  2. Branch commit messages
    //  3. File changes

    const commitRows = commits.map((commit) => this._flattenCommitRow(commit));
    this._appendRows(commitRows, this.filenames.commits);

    const branchMessageRows = commits.map((commit) => this._extractBranchMessages(commit)).flat();
    this._appendRows(branchMessageRows, this.filenames.branchMessages);

    const fileChangesRows = commits.map((commit) => this._extractfileChanges(commit)).flat();
    this._appendRows(fileChangesRows, this.filenames.fileChanges);
  }

  _appendRows(rows, filename)
  {
    const includeHeaders = !fs.existsSync(filename);
    var writeStream = fs.createWriteStream(filename, { flags: 'a' });
    // Need to write a newline if there are no headers
    if (!includeHeaders) {
      writeStream.write('\n');
    }
    const csvStream = csv.format({ headers: includeHeaders });
    csvStream.pipe(writeStream);
    rows.forEach((row) => {
      csvStream.write(row);
    });
    csvStream.end();
  }

  _flattenCommitRow(commit)
  {
    return {
      commit_message: commit.commitMessage,
      repository: this.repository,
      date: commit.date.toISOString(),
      sha: commit.hash,
      pr_number: commit.prNumber,
      revert_pr_number: commit.revertPrNumber,
      author_name: commit.author.name,
      author_email: commit.author.email,
    };
  }

  _extractfileChanges(commit)
  {
    return Object.entries(commit.fileMap).map(([name, data]) => ({
      parent_sha: commit.hash,
      parent_date: commit.date.toISOString(),
      file_name: name,
      renamed_from: data.renamedFrom,
      total_changes: data.totalChanges,
      num_deletes: data.numDeletes,
      num_inserts: data.numInserts,
    }));
  }

  _extractBranchMessages(commit)
  {
    return commit.branchCommitMessages.map((message, index) => ({
      parent_sha: commit.hash,
      parent_date: commit.date.toISOString(),
      message,
      index,
    }));
  }
}

class CommitReader
{
  /**
   * Options:
   *  - path: change to this working directory for running the command
   *  - afterCommit: only get data fter this commit
   *  - afterDate: only get data after this date (can be combined with commit)
   *
   * Return value: a stream that produces the raw stdout of git log
   */
  constructor(options)
  {
    this.options = options;
    this.commits = [];
  }

  _getRawGitLogStream()
  {
    const options = this.options;
    const args = [];
    if (options.path) {
      args.push('--work-tree');
      args.push(options.path);

      args.push('--git-dir');
      args.push(`${options.path}/.git`);
    }
    args.push('log');
    args.push('--stat=5000');

    // Only read commits that occurred after this date
    if (options.afterDate) {
      args.push(`--after=${options.afterDate}`);
    }

    // Only read commits that occurred after this one
    if (options.afterCommit) {
      const endCommit = options.beforeCommit || 'HEAD';
      args.push(`${options.afterCommit}..${endCommit}`);
    }

    const result = spawnSync('git', args, {maxBuffer: 256 * 1024 * 1024});
    if (result.status == 128 || result.error) {
      throw result.stderr.toString();
    }

    var outStream = new Readable();
    const dataString = result.stdout.toString();
    outStream.push(dataString);
    outStream.push(null);

    return outStream;
  }

  read()
  {
    const rawGitStream = this._getRawGitLogStream();
    const parsedGitStream = parselog(rawGitStream);

    parsedGitStream.on('commit', (commit) => {
      this.commits.push(commit);
    });

    return new Promise((resolve, reject) => {
      parsedGitStream.on('error', reject);
      parsedGitStream.on('close', () => {
        resolve(this.commits);
      });
    });
  }
}

const manager = new CommitCsvManager({repository: 'CollageCom/scrapwalls'});
// Get the latest commit that was already saved
const afterCommit = manager.getLatestCommitHash();

const parser = new CommitReader({
  //afterCommit,
  path: '../swdev'
});
parser.read().then((commits) => {
  manager.appendCommits(commits);
});

/*

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


var dirCounts = {};
var fileCounts = {};
var commitCounts = {};
var lastDirCounts = {};
var authorCounts = {};
var dedupe = {};
var total = 0;
const startDate = '2020-01-01';

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
/*
parseCmd.on('close', async function() {
  //console.log(dirCounts);
  //console.log(authorCounts);

  // body should have full description and Jira ticket link
  // head.ref should have branch name, which may contain jira issue
  // title may contain jira issue
  console.log('a');
  console.log(pulls);
  outputFileCounts(fileCounts, commitCounts);

});
*/
