import 'isomorphic-fetch'
import { parse as parseURL } from 'url'
import gunzip from 'gunzip-maybe'
import mkdirp from 'mkdirp'
import tar from 'tar-fs'

const URLFormat = /^\/((?:@[^\/@]+\/)?[^\/@]+)(?:@([^\/]+))?(\/.*)?$/

const decodeParam = (param) =>
  param && decodeURIComponent(param)

const ValidQueryKeys = {
  main: true,
  json: true,
  jsonp: true,
  callback: true,
  encoding: true
}

const queryIsValid = (query) =>
  Object.keys(query).every(key => ValidQueryKeys[key])

export const parsePackageURL = (url) => {
  const { pathname, search, query } = parseURL(url, true)

  if (!queryIsValid(query))
    return null

  const match = URLFormat.exec(pathname)

  if (match == null)
    return null

  const packageName = match[1]
  const version = decodeParam(match[2]) || 'latest'
  const filename = decodeParam(match[3])

  const jsonpOpts = query.callback || query.jsonp ? {
    callback: query.callback || query.jsonp,
    encoding: query.encoding
  } : null

  return {        // If the URL is /@scope/name@version/path.js?main=browser&callback=cb&encoding=utf8:
    pathname,     // /@scope/name@version/path.js
    search,       // ?main=browser
    query,        // { main: 'browser' }
    jsonpOpts,        // { callback: 'cb', encoding: 'uf8' }
    packageName,  // @scope/name
    version,      // version
    filename      // /path.js
  }
}

export const createPackageURL = (packageName, version, filename, search) => {
  let pathname = `/${packageName}`

  if (version != null)
    pathname += `@${version}`

  if (filename != null)
    pathname += filename

  if (search)
    pathname += search

  return pathname
}

const normalizeTarHeader = (header) => {
  // Most packages have header names that look like "package/index.js"
  // so we shorten that to just "index.js" here. A few packages use a
  // prefix other than "package/". e.g. the firebase package uses the
  // "firebase_npm/" prefix. So we just strip the first dir name.
  header.name = header.name.replace(/^[^\/]+\//, '')
  return header
}

export const getPackage = (tarballURL, outputDir, callback) => {
  mkdirp(outputDir, (error) => {
    if (error) {
      callback(error)
    } else {
      let callbackWasCalled = false

      fetch(tarballURL).then(response => {
        response.body
          .pipe(gunzip())
          .pipe(
            tar.extract(outputDir, {
              dmode: 0o666, // All dirs should be writable
              fmode: 0o444, // All files should be readable
              map: normalizeTarHeader
            })
          )
          .on('finish', callback)
          .on('error', (error) => {
            if (callbackWasCalled) // LOL node streams
              return

            callbackWasCalled = true
            callback(error)
          })
      })
    }
  })
}
