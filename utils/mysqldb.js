var mysql = require("mysql");
var Promise = require("es6-promise").Promise;

var dbConfig = require("../config/dbConfig");

var pool;
function getPool() {
  return pool;
}

module.exports.getPool = getPool;
function createPool(config) {
  return new Promise(function(resolve, reject) {
    // create connection pool
    console.log("---------------------------");
    console.log("creating connection pool...");

    config["typeCast"] = function(field, next) {
      // handle only BIT(1)
      if (field.type == "BIT" && field.length == 1) {
        var bit = field.string();

        return bit === null ? null : bit.charCodeAt(0);
      }

      // handle everything else as default
      return next();
    };

    pool = mysql.createPool(dbConfig.mysql);

    // test connection
    console.log("testing connection...");
    pool.query("select now() from dual", function(error, results, fields) {
      if (error) return reject(error);

      console.log("db connection fine.");
      console.log("---------------------------");

      resolve(pool);
    });
  });
}

module.exports.createPool = createPool;

function terminatePool() {
  return new Promise(function(resolve, reject) {
    if (pool) {
      pool.end(function(err) {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports.terminatePool = terminatePool;

function getConnection() {
  return new Promise(function(resolve, reject) {
    pool.getConnection(function(err, connection) {
      if (err) {
        console.error("ERR1: " + err);
        return reject(err);
      }

      resolve(connection);
    });
  });
}

module.exports.getConnection = getConnection;

function releaseConnection(connection) {
  connection.release();
}

module.exports.releaseConnection = releaseConnection;

function execute(sql, bindParams, connection, options) {
  return new Promise(function(resolve, reject) {
    var data = {
      sql: updateDatabase(sql),
      values: bindParams
    };
    if (options) {
      for (var option in options) {
        data[option] = options[option];
      }
    }

    connection.query(data, function(err, results, fields) {
      if (err) {
        return reject(err);
      }

      resolve(results);
    });
  });
}

module.exports.execute = execute;

function simpleExecute(sql, bindParams) {
  console.log(`b`, bindParams)
  return new Promise(function(resolve, reject) {
    getConnection()
      .then(function(connection) {
        execute(sql, bindParams, connection, {})
          .then(function(results) {
            resolve(JSON.parse(JSON.stringify(results)));

            process.nextTick(function() {
              releaseConnection(connection);
            });
          })
          .catch(function(err) {
            reject(err);

            process.nextTick(function() {
              releaseConnection(connection);
            });
          });
      })
      .catch(function(err) {
        reject(err);
      });
  });
}

module.exports.simpleExecute = simpleExecute;

function paginateSql(sql, pageNo, pSize) {

  if(pSize === undefined) {
      pageSize = dbConfig.oracle.pageSize;
  } else {
      pageSize = parseInt(pSize);
  }

  var start = pageSize * (pageNo-1);
  var stop = start + pageSize;

  var sql =
      'SELECT x.* ' +
      '   FROM (SELECT ' +
      '   a.* ' +
      '       FROM ( ' + sql + ' ) a )x' +        
      '  limit ' + start+',' + stop ;

  return sql;
}

module.exports.paginateSql = paginateSql; 
function begin(connection) {
  return new Promise(function(resolve, reject) {
    connection.beginTransaction(function(err) {
      if (err) return reject(err);

      resolve(connection);
    });
  });
}

module.exports.begin = begin;

function commit(connection) {
  return new Promise(function(resolve, reject) {
    connection.commit(function(err) {
      if (err) return reject(err);

      resolve(connection);

      process.nextTick(function() {
        releaseConnection(connection);
      });
    });
  });
}

module.exports.commit = commit;

function rollback(connection) {
  return new Promise(function(resolve, reject) {
    connection.rollback(function() {
      resolve(connection);
      process.nextTick(function() {
        releaseConnection(connection);
      });
    });
  });
}

module.exports.rollback = rollback;

function updateDatabase(sql) {
  for (var database in dbConfig.config.databases) {
    console.log(database);
    if (dbConfig.config.databases[database].length == 0) {
      sql = replaceAll(sql, "[!" + database + "!].", "");
    } else {
      sql = replaceAll(
        sql,
        "[!" + database + "!]",
        dbConfig.config.databases[database]
      );
    }
  }
  console.log(sql);
  if (dbConfig.config.logSql) {
    console.log(sql);
  }

  return sql;
}

function replaceAll(str, find, replace) {
  return str.split(find).join(replace);
}
