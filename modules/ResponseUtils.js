import fs from 'fs'
import etag from 'etag'
import { getContentType, getStats } from './FileUtils'

export const sendText = (res, statusCode, text, jsonpOpts) => {
  text = withJsonp(text, jsonpOpts)

  res.writeHead(statusCode, {
    'Content-Type': 'text/plain',
    'Content-Length': text.length
  })

  res.end(text)
}

function withJsonp(data, jsonpOpts) {
  if (!jsonpOpts) return data
  if (jsonpOpts.encoding && jsonpOpts.encoding!=='utf8')
    data = new Buffer(data).toString(jsonpOpts.encoding)
  data = jsonpOpts.callback+'('+JSON.stringify(typeof data.copy==='function' ? data.toString() : data)+')'
  return data
}

export const sendJSON = (res, json, jsonpOpts, maxAge = 0, statusCode = 200) => {
  const text = withJsonp(JSON.stringify(json), jsonpOpts)

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': text.length,
    'Cache-Control': `public, max-age=${maxAge}`
  })

  res.end(text)
}

export const sendInvalidURLError = (res, url, jsonpOpts) =>
  sendText(res, 403, `Invalid URL: ${url}`, jsonpOpts)

export const sendNotFoundError = (res, what, jsonpOpts) =>
  sendText(res, 404, `Not found: ${what}`, jsonpOpts)

export const sendServerError = (res, error, jsonpOpts) =>
  sendText(res, 500, `Server error: ${error.message || error}`, jsonpOpts)

export const sendHTML = (res, html, jsonpOpts, maxAge = 0, statusCode = 200) => {
  html = withJsonp(html, jsonpOpts)
  res.writeHead(statusCode, {
    'Content-Type': 'text/html',
    'Content-Length': html.length,
    'Cache-Control': `public, max-age=${maxAge}`
  })

  res.end(html)
}

export const sendRedirect = (res, relativeLocation, jsonpOpts, maxAge = 0, statusCode = 302) => {
  let location = res.req && res.req.baseUrl ? res.req.baseUrl + relativeLocation : relativeLocation

  if (jsonpOpts)
    location += '?callback='+jsonpOpts.callback+(jsonpOpts.encoding?'&encoding='+jsonpOpts.encding:'')

  const html = `<p>You are being redirected to <a href="${location}">${location}</a>`

  res.writeHead(statusCode, {
    'Content-Type': 'text/html',
    'Content-Length': html.length,
    'Cache-Control': `public, max-age=${maxAge}`,
    'Location': location
  })

  res.end(html)
}

export const sendFile = (res, file, stats, jsonpOpts, maxAge = 0) =>
  Promise.resolve(stats || getStats(file))
    .then(stats => {
      let contentType = getContentType(file)

      if (contentType === 'text/html')
        contentType = 'text/plain' // We can't serve HTML because bad people :(

      if (jsonpOpts) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': `public, max-age=${maxAge}`,
          'ETag': etag(stats)
        })

        fs.readFile(file, (err, data) => {
          if (err)
            sendServerError(res, err, jsonpOpts)
          else
            res.end(withJsonp(data, jsonpOpts))
        })
      }
      else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stats.size,
          'Cache-Control': `public, max-age=${maxAge}`,
          'ETag': etag(stats)
        })

        const stream = fs.createReadStream(file)

        stream.on('error', (error) => {
          sendServerError(res, error, jsonpOpts)
        })

        stream.pipe(res)
      }
    })
    .catch(error => {
      sendServerError(res, error, jsonpOpts)
    })
