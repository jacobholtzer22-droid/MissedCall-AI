(function () {
  'use strict'
  var script = document.currentScript
  if (!script) return
  var business = script.getAttribute('data-business')
  if (!business) return
  var src = script.src
  var baseUrl = src ? src.replace(/\/embed\.js(\?.*)?$/, '') : ''
  if (!baseUrl) return
  var embedUrl = baseUrl + '/book/' + encodeURIComponent(business) + '/embed'

  var container = document.getElementById('booking-widget') || script.parentElement
  if (!container) {
    container = document.createElement('div')
    container.id = 'booking-widget'
    script.parentNode.insertBefore(container, script.nextSibling)
  }

  var iframe = document.createElement('iframe')
  iframe.src = embedUrl
  iframe.width = '100%'
  iframe.style.border = 'none'
  iframe.style.minHeight = '600px'
  iframe.style.display = 'block'
  container.appendChild(iframe)

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'booking-embed-height' && typeof e.data.height === 'number') {
      iframe.style.height = e.data.height + 'px'
    }
  })
})()
