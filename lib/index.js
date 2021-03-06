// Generated by CoffeeScript 1.12.4
(function() {
  var RootsUtil, S, W, _, contentful, errors, fs, hosts, path, pluralize, querystring;

  _ = require('lodash');

  W = require('when');

  S = require('string');

  fs = require('fs');

  path = require('path');

  contentful = require('contentful');

  pluralize = require('pluralize');

  RootsUtil = require('roots-util');

  querystring = require('querystring');

  errors = {
    no_token: 'Missing required options for roots-contentful. Please ensure `access_token` and `space_id` are present.',
    no_type_id: 'One or more of your content types is missing an `id` value',
    sys_conflict: 'One of your content types has `sys` as a field. This is reserved for storing Contentful system metadata, please rename this field to a different value.'
  };

  hosts = {
    develop: 'preview.contentful.com',
    production: 'cdn.contentful.com'
  };

  module.exports = function(opts) {
    var RootsContentful, client;
    if (!(opts.access_token && opts.space_id)) {
      throw new Error(errors.no_token);
    }
    client = contentful.createClient({
      host: hosts[process.env.CONTENTFUL_ENV] || (opts.preview ? hosts.develop : void 0) || hosts.production,
      accessToken: opts.access_token,
      space: opts.space_id
    });
    return RootsContentful = (function() {
      var asset_view_helper, compile_entries, configure_content, fetch_content, fetch_content_from_file, format_content, format_entry, fsExistsSync, get_all_content, reconfigure_alt_type_config, record_content, set_locals, set_urls, sort_entries, transform_entries, write_entries;

      function RootsContentful(roots) {
        var base, base1;
        this.roots = roots;
        this.util = new RootsUtil(this.roots);
        if ((base = this.roots.config).locals == null) {
          base.locals = {};
        }
        if ((base1 = this.roots.config.locals).contentful == null) {
          base1.contentful = {};
        }
        this.roots.config.locals.asset = asset_view_helper;
      }

      RootsContentful.prototype.setup = function() {
        return configure_content(opts.content_types)["with"](this).then(get_all_content).tap(set_urls).then(transform_entries).then(sort_entries).tap(set_locals).tap(compile_entries).tap(write_entries);
      };


      /**
       * Configures content types set in app.coffee. Sets default values if
       * optional config options are missing.
       * @param {Array} types - content_types set in app.coffee extension config
       * @return {Promise} - returns an array of configured content types
       */

      configure_content = function(types) {
        if (_.isPlainObject(types)) {
          types = reconfigure_alt_type_config(types);
        }
        return W.map(types, function(t) {
          if (!t.id) {
            return W.reject(errors.no_type_id);
          }
          if (t.filters == null) {
            t.filters = {};
          }
          if (!t.name || (t.template && !t.path)) {
            return W(client.contentType(t.id).then(function(res) {
              if (t.name == null) {
                t.name = pluralize(S(res.name).toLowerCase().underscore().s);
              }
              if (t.template) {
                if (t.path == null) {
                  t.path = function(e) {
                    return t.name + "/" + (S(e[res.displayField]).slugify().s);
                  };
                }
              }
              return t;
            }));
          }
          return W.resolve(t);
        });
      };


      /**
       * Reconfigures content types set in app.coffee using an object instead of
       * an array. The keys of the object set as the `name` option in the config
       * @param {Object} types - content_types set in app.coffee extension config
       * @return {Promise} - returns an array of content types
       */

      reconfigure_alt_type_config = function(types) {
        return _.reduce(types, function(res, type, k) {
          type.name = k;
          res.push(type);
          return res;
        }, []);
      };


      /**
       * Checks if a file or directory exists
       * @param {String} path - File or directory path
       * @return {Boolean} - returns success/failure
       */

      fsExistsSync = function(path) {
        var e;
        try {
          fs.accessSync(path, fs.F_OK);
          return true;
        } catch (error) {
          e = error;
          return false;
        }
      };


      /**
       * Fetches data from Contentful for content types, and formats the raw data
       * Stores/fetches content locally if requested
       * @param {Array} types - configured content_type objects
       * @return {Promise} - returns formatted locals object with all content
       */

      get_all_content = function(types) {
        if (opts.cache && !fsExistsSync(opts.cache)) {
          fs.mkdirSync(opts.cache);
        }
        return W.map(types, function(t) {
          if (opts.cache && fsExistsSync(opts.cache + "/" + t.id + ".json")) {
            return fetch_content_from_file(t).then(format_content).then(function(c) {
              return t.content = c;
            })["yield"](t);
          } else {
            return fetch_content(t).then(function(c) {
              return record_content(c, t);
            }).then(format_content).then(function(c) {
              return t.content = c;
            })["yield"](t);
          }
        });
      };


      /**
       * Fetch entries for a single content type object
       * @param {Object} type - content type object
       * @return {Promise} - returns response from Contentful API
       */

      fetch_content = function(type) {
        return W(client.entries(_.merge(type.filters, {
          content_type: type.id,
          include: 10
        })));
      };


      /**
       * Fetch entries for a single content type object from a local JSON file
       * @param {Object} type - content type object
       * @return {Promise} - returns response from JSON file
       */

      fetch_content_from_file = function(type) {
        var contents;
        contents = fs.readFileSync(opts.cache + "/" + type.id + ".json");
        return W(JSON.parse(contents));
      };


      /**
       * Records content from Contentful into JSON files
       * @param {Object} content - entries API response for a content type
       * @param {Object} type - content type object
       * @return {Promise} - passes content through
       */

      record_content = function(content, type) {
        if (opts.cache) {
          fs.writeFile(opts.cache + "/" + type.id + ".json", JSON.stringify(content), function(err, data) {
            if (err) {
              throw err;
            }
          });
        }
        return content;
      };


      /**
       * Formats raw response from Contentful
       * @param {Object} content - entries API response for a content type
       * @return {Promise} - returns formatted content type entries object
       */

      format_content = function(content) {
        return W.map(content, format_entry);
      };


      /**
       * Formats a single entry object from Contentful API response
       * @param {Object} e - single entry object from API response
       * @return {Promise} - returns formatted entry object
       */

      format_entry = function(e) {
        if (_.has(e.fields, 'sys')) {
          return W.reject(errors.sys_conflict);
        }
        return _.assign(_.omit(e, 'fields'), e.fields);
      };


      /**
       * Sets `_url` and `_urls` properties on content with single entry views
       * `_url` takes the value `null` if the content type's custom path function
       * returns multiple paths
       * @param {Array} types - content type objects
       * return {Promise} - promise when urls are set
       */

      set_urls = function(types) {
        return W.map(types, function(t) {
          if (t.template) {
            return W.map(t.content, function(entry) {
              var p, paths;
              paths = t.path(entry);
              if (_.isString(paths)) {
                paths = [paths];
              }
              entry._urls = (function() {
                var i, len, results;
                results = [];
                for (i = 0, len = paths.length; i < len; i++) {
                  p = paths[i];
                  results.push("/" + p + ".html");
                }
                return results;
              })();
              return entry._url = entry._urls.length === 1 ? entry._urls[0] : null;
            });
          }
        });
      };


      /**
       * Builds locals object from types objects with content
       * @param {Array} types - populated content type objects
       * @return {Promise} - promise for when complete
       */

      set_locals = function(types) {
        return W.map(types, (function(_this) {
          return function(t) {
            return _this.roots.config.locals.contentful[t.name] = t.content;
          };
        })(this));
      };


      /**
       * Transforms every type with content with the user provided callback
       * @param {Array} types - Populated content type objects
       * @return {Promise} - promise for when compilation is finished
       */

      transform_entries = function(types) {
        return W.map(types, (function(_this) {
          return function(t) {
            if (t.transform) {
              W.map(t.content, function(entry) {
                return W(entry, t.transform);
              });
            }
            return W.resolve(t);
          };
        })(this));
      };


      /**
       * Sort every type content with the user provided callback
       * @param {Array} types - Populated content type objects
       * @return {Promise} - promise for when compilation is finished
       */

      sort_entries = function(types) {
        return W.map(types, (function(_this) {
          return function(t) {
            if (t.sort) {
              W.all(t.content).then(function(data) {
                return t.content = data.sort(t.sort);
              });
            }
            return W.resolve(t);
          };
        })(this));
      };


      /**
       * Compiles single entry views for content types
       * @param {Array} types - Populated content type objects
       * @return {Promise} - promise for when compilation is finished
       */

      compile_entries = function(types) {
        return W.map(types, (function(_this) {
          return function(t) {
            if (!t.template) {
              return W.resolve();
            }
            return W.map(t.content, function(entry) {
              var compiler, template;
              template = path.join(_this.roots.root, t.template);
              compiler = _.find(_this.roots.config.compilers, function(c) {
                return _.includes(c.extensions, path.extname(template).substring(1));
              });
              return W.map(entry._urls, function(url) {
                _this.roots.config.locals.entry = _.assign({}, entry, {
                  _url: url
                });
                return compiler.renderFile(template, _this.roots.config.locals).then(function(res) {
                  return _this.util.write(url, res.result);
                });
              });
            });
          };
        })(this));
      };


      /**
       * Writes all data for type with content as json
       * @param {Array} types - Populated content type objects
       * @return {Promise} - promise for when compilation is finished
       */

      write_entries = function(types) {
        return W.map(types, (function(_this) {
          return function(t) {
            if (!t.write) {
              return W.resolve();
            }
            return _this.util.write(t.write, JSON.stringify(t.content));
          };
        })(this));
      };


      /**
       * View helper for accessing the actual url from a Contentful asset
       * and appends any query string params
       * @param {Object} asset - Asset object returned from Contentful API
       * @param {Object} opts - Query string params to append to the URL
       * @return {String} - URL string for the asset
       */

      asset_view_helper = function(asset, params) {
        var base, url;
        if (asset == null) {
          asset = {};
        }
        if (asset.fields == null) {
          asset.fields = {};
        }
        if ((base = asset.fields).file == null) {
          base.file = {};
        }
        url = asset.fields.file.url;
        if (params) {
          return url + "?" + (querystring.stringify(params));
        } else {
          return url;
        }
      };

      return RootsContentful;

    })();
  };

}).call(this);
