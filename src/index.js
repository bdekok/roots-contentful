import RootsContentful from './extension'
import errors from './errors'

/**
 * validates user options before
 * the extension is passed to Roots
 * @param  {Object} opts - user-supplied settings
 * @return {Object} opts - if there are no errors
 *                         opts is returned as-is
 */
function validate (opts) {
  if (!(opts.access_token && opts.space_id)) {
    throw new Error(errors.no_token)
  }
  return opts
}

/**
 * transfers validated user-settings to
 * the extension class
 * @param {Object} opts - user-supplied settings
 * @return {Function} - the extension class
 */
export default function extension (opts) {
  RootsContentful.opts = validate(opts)
  return RootsContentful
}
