import Ember from 'ember';
import getOwner from 'ember-getowner-polyfill';
import _object from 'lodash/object';
import _collection from 'lodash/collection';

const {
  computed,
  computed: { reads },
  isEmpty,
  typeOf,
  isNone,
  assert
} = Ember;

export default Ember.Service.extend({
  _isFastBoot: reads('_fastBoot.isFastBoot'),

  _fastBoot: computed(function() {
    let owner = getOwner(this);

    return owner.lookup('service:fastboot');
  }),

  _document: computed(function() {
    return document;
  }),

  _documentCookies: computed(function() {
    let all = this.get('_document.cookie').split(';');

    return _collection.reduce(all, (acc, cookie) => {
      if (!isEmpty(cookie)) {
        let [key, value] = cookie.split('=');
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});
  }).volatile(),

  _fastBootCookies: computed(function() {
    let fastBootCookies = this.get('_fastBootCookiesCache');

    if (!fastBootCookies) {
      fastBootCookies = this.get('_fastBoot.request.cookies');
      this.set('_fastBootCookiesCache', fastBootCookies);
    }

    return this._filterCachedFastBootCookies(fastBootCookies);
  }).volatile(),

  read(name) {
    let all;
    if (this.get('_isFastBoot')) {
      all = this.get('_fastBootCookies');
    } else {
      all = this.get('_documentCookies');
    }

    if (name) {
      return this._decodeValue(all[name]);
    } else {
      return _collection.map(all, (value) => this._decodeValue(value));
    }
  },

  write(name, value, options = {}) {
    assert('Cookies cannot be set to be HTTP-only as those cookies would not be accessible by the Ember.js application itself when running in the browser!', !options.httpOnly);
    assert("Cookies cannot be set as signed as signed cookies would not be modifyable in the browser as it has no knowledge of the express server's signing key!", !options.signed);
    assert('Cookies cannot be set with both maxAge and an explicit expiration time!', isEmpty(options.expires) || isEmpty(options.maxAge));
    value = this._encodeValue(value);

    if (this.get('_isFastBoot')) {
      this._writeFastBootCookie(name, value, options);
    } else {
      this._writeDocumentCookie(name, value, options);
    }
  },

  clear(name) {
    this.write(name, null, { expires: new Date('1970-01-01') });
  },

  _writeDocumentCookie(name, value, options = {}) {
    let serializedCookie = this._serializeCookie(name, value, options);
    this.set('_document.cookie', serializedCookie);
  },

  _writeFastBootCookie(name, value, options = {}) {
    let responseHeaders  = this.get('_fastBoot.response.headers');
    let serializedCookie = this._serializeCookie(...arguments);

    if (!isEmpty(options.maxAge)) {
      options.maxAge = options.maxAge * 1000;
    }

    this._cacheFastBootCookie(...arguments);

    responseHeaders.append('set-cookie', serializedCookie);
  },

  _cacheFastBootCookie(name, value, options = {}) {
    let fastBootCache = this.getWithDefault('_fastBootCookiesCache', {});
    let cachedOptions = _object.assign({}, options);

    if (cachedOptions.maxAge) {
      let expires = new Date();
      expires.setSeconds(expires.getSeconds() + options.maxAge);
      cachedOptions.expires = expires;
      delete cachedOptions.maxAge;
    }

    fastBootCache[name] = { value, options: cachedOptions };
    this.set('_fastBootCookiesCache', fastBootCache);
  },

  _filterCachedFastBootCookies(fastBootCookiesCache) {
    let { hostname, path: requestPath, protocol } = this.get('_fastBoot.request');

    return _collection.reduce(fastBootCookiesCache, (acc, cookie, name) => {
      let { value, options } = cookie;
      options = options || {};

      let { path: optionsPath, domain, expires, secure } = options;

      if (optionsPath && requestPath.indexOf(optionsPath) !== 0) {
        return acc;
      }

      if (domain && hostname.indexOf(domain) + domain.length !== hostname.length) {
        return acc;
      }

      if (expires && expires < new Date()) {
        return acc;
      }

      if (secure && protocol !== 'https') {
        return acc;
      }

      acc[name] = value;
      return acc;
    }, {});
  },

  _encodeValue(value) {
    if (isNone(value)) {
      return value;
    } else {
      return encodeURIComponent(value);
    }
  },

  _decodeValue(value) {
    if (isNone(value)) {
      return value;
    } else {
      return decodeURIComponent(value);
    }
  },

  _serializeCookie(name, value, options = {}) {
    let cookie = `${name}=${value}`;

    if (!isEmpty(options.domain)) {
      cookie = `${cookie}; domain=${options.domain}`;
    }
    if (typeOf(options.expires) === 'date') {
      cookie = `${cookie}; expires=${options.expires.toUTCString()}`;
    }
    if (!isEmpty(options.maxAge)) {
      cookie = `${cookie}; max-age=${options.maxAge}`;
    }
    if (!!options.secure) {
      cookie = `${cookie}; secure`;
    }
    if (!isEmpty(options.path)) {
      cookie = `${cookie}; path=${options.path}`;
    }

    return cookie;
  }
});
