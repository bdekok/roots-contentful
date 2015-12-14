import _ from 'lodash'
import S from 'string'
import path from 'path'
import contentful from 'contentful'
import pluralize from 'pluralize'
import RootsUtil from 'roots-util'
import querystring from 'querystring'
import errors from './errors'
import hosts from './hosts'

let client = null // init contentful client

/**
 * @class RootsContentful
 */
export default class RootsContentful {

  opts = {
    /* defaults */

    /* user-provided */
    ...RootsContentful.opts
  }

  /**
   * @constructs RootsContentful
   * @param  {Object} roots - the roots instance
   * @return {Object} - an instance of the extension
   */
  constructor (roots) {
    // set default locals
    this.roots = roots || { config: {} }
    this.util = new RootsUtil(this.roots)
    this.roots.config.locals = this.roots.config.locals || {}
    this.roots.config.locals.contentful = this.roots.config.locals.contentful || {}
    this.roots.config.locals.asset = asset_view_helper

    // grab host info
    let host = hosts[process.env.CONTENTFUL_ENV] || this.opts.preview
        ? hosts.develop
        : hosts.production

    // set contenful client
    client = contentful.createClient({
      host,
      accessToken: this.opts.access_token,
      space: this.opts.space_id
    })
  }

  /**
   * Performs asynchronous setup tasks required
   * for the extension to work
   * @return {Promise} an array for the sorted contentful data
   */
  async setup () {
    let configuration = await configure_content(this.opts.content_types)
    let content = await get_all_content(configuration)
    await set_urls(content)
    let entries = await transform_entries(content)
    let sorted = await sort_entries(entries)
    await this::set_locals(sorted)
    await this::compile_entries(sorted)
    await this::write_entries(sorted)
    return sorted
  }

}

/**
 * Configures content types set in app.coffee. Sets default values if
 * optional config options are missing.
 * @param {Array} types - content_types set in app.coffee extension config
 * @return {Promise} - returns an array of configured content types
 */
async function configure_content (types) {
  // check if `types` is a plain object - if so, convert to array
  if (types != null && !Array.isArray(types) && typeof types === 'object') {
    types = reconfigure_alt_type_config(types)
  }
  types = await Promise.all(types)
  return types.map(async type => {
    if (!type.id) throw new Error(errors.no_type_id)
    type.filters = type.filters || {}
    if (!type.name || (type.template && !type.path)) {
      let content_type = await client.contentType(type.id)
      type.name = type.name || pluralize(S(content_type.name).toLowerCase().underscore().s)
      if (type.template) {
        type.path = type.path || (e => `${type.name}/${S(e[content_type.displayField]).slugify().s}`)
      }
    }
    return type
  })
}

/**
 * Reconfigures content types set in app.coffee using an object instead of
 * an array. The keys of the object set as the `name` option in the config
 * @param {Object} types - content_types set in app.coffee extension config
 * @return {Promise} - returns an array of content types
 */
function reconfigure_alt_type_config (types) {
  return _.reduce(types, (results, type, key) => {
    type.name = key
    results.push(type)
    return results
  }, [])
}

/**
 * Fetches data from Contentful for content types, and formats the raw data
 * @param {Array} types - configured content_type objects
 * @return {Promise} - returns formatted locals object with all content
 */
async function get_all_content (types) {
  types = await Promise.all(types)
  return types.map(async type => {
    let content = await fetch_content(type)
    type.content = await format_content(content)
    return type
  })
}

/**
 * Fetch entries for a single content type object
 * @param {Object} type - content type object
 * @return {Promise} - returns response from Contentful API
 */
async function fetch_content (type) {
  let entries = await client.entries({
    ...type.filters,
    content_type: type.id,
    include: 10
  })
  return entries
}

/**
 * Formats raw response from Contentful
 * @param {Object} content - entries API response for a content type
 * @return {Promise} - returns formatted content type entries object
 */
async function format_content (content) {
  content = await Promise.all(content)
  return content.map(format_entry)
}

/**
 * Formats a single entry object from Contentful API response
 * @param {Object} entry - single entry object from API response
 * @return {Promise} - returns formatted entry object
 */
function format_entry (entry) {
  if (entry.fields.sys != null) {
    throw new Error(errors.sys_conflict)
  }
  let formatted = { ...entry, ...entry.fields }
  delete formatted.fields
  return formatted
}

/**
 * Sets `_url` and `_urls` properties on content with single entry views
 * `_url` takes the value `null` if the content type's custom path function
 * returns multiple paths
 * @param {Array} types - content type objects
 * @return {Promise} - promise when urls are set
 */
async function set_urls (types) {
  types = await Promise.all(types)
  return types.map(type => {
    if (type.template) {
      return type.content.map(entry => {
        let paths = type.path(entry)
        if (typeof paths === 'string') {
          paths = [paths]
        }
        entry._urls = paths.map(path => `/${path}.html`)
        entry._url = entry._urls.length === 1 ? entry._urls[0] : null
        return entry._url
      })
    }
  })
}

/**
 * Builds locals object from types objects with content
 * @param {Array} types - populated content type objects
 * @return {Promise} - promise for when complete
 */
async function set_locals (types) {
  types = await Promise.all(types)
  return types.map(type => {
    this.roots.config.locals.contentful[type.name] = type.content
    return this.roots.config.locals.contentful[type.name]
  })
}

/**
 * Transforms every type with content with the user provided callback
 * @param {Array} types - Populated content type objects
 * @return {Promise} - promise for when compilation is finished
 */
async function transform_entries (types) {
  types = await Promise.all(types)
  return types.map(type => {
    if (type.transform) {
      type.content.map(entry => type.transform(entry))
    }
    return type
  })
}

/**
 * Sort every type content with the user provided callback
 * @param {Array} types - Populated content type objects
 * @return {Promise} - promise for when compilation is finished
 */
async function sort_entries (types) {
  types = await Promise.all(types)
  return types.map(type => {
    if (type.sort) {
      type.content = type.content.sort(type.sort)
    }
    return type
  })
}

/**
 * Compiles single entry views for content types
 * @param {Array} types - Populated content type objects
 * @return {Promise} - promise for when compilation is finished
 */
async function compile_entries (types) {
  types = await Promise.all(types)
  return types.map(type => {
    if (!type.template) return
    return type.content.map(entry => {
      let template = path.join(this.roots.root, type.template)
      let compiler = _.find(this.roots.config.compilers, compiler => {
        return compiler.extensions.includes(path.extname(template).substring(1))
      })
      return entry._urls.map(url => {
        this.roots.config.locals.entry = { ...entry, _url: url }
        return compiler.renderFile(template, this.roots.config.locals)
          .then(compiled => {
            this.roots.config.locals.entry = null
            return this.util.write(url, compiled.result)
          })
      })
    })
  })
}

/**
 * Writes all data for type with content as json
 * @param {Array} types - Populated content type objects
 * @return {Promise} - promise for when compilation is finished
 */
async function write_entries (types) {
  types = await Promise.all(types)
  return types.map(type => {
    if (!type.write) return
    return this.util.write(type.write, JSON.stringify(type.content))
  })
}

/**
 * View helper for accessing the actual url from a Contentful asset
 * and appends any query string params
 * @param {Object} asset - Asset object returned from Contentful API
 * @param {Object} params - Query string params to append to the URL
 * @return {String} - URL string for the asset
 */
function asset_view_helper (asset = {}, params) {
  asset = { fields: { file: {} }, ...asset }
  let url = asset.fields.file.url
  if (params) {
    return `${url}?${querystring.stringify(params)}`
  }
  return url
}