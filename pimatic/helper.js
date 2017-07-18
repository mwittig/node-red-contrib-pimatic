/**
 * Copyright (C) 2017 Marcus Wittig
 *
 * This file is part of node-red-contrib-pimatic.
 *
 * node-red-contrib-pimatic is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation, either version 2 of
 * the License, or(at your option) any later version.
 *
 * node-red-contrib-pimatic is distributed in the hope that it will
 * be useful, but WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
"use strict";

var util = require('util');
var Promise = require('bluebird');
var _ = {

  hasStringValue: function hasStringValue(value, checkEmptyString) {
    try {
      return (value != null) && (typeof value == 'string') && (!checkEmptyString || value.trim().length != 0)
    }
    catch (e) {
      return false
    }
  },

  debugInit: function debugInit(node) {
    try {
      if (process.env.hasOwnProperty('PIMATIC_DEBUG')) {
        return node.log;
      }
    }
    catch (e) {
      console.error(e)
    }
   return function() {};
  },

  getConnectorURL: function getConnectorURL(config) {
    var url = _.hasStringValue(config.protocol, true) ? config.protocol.trim() : 'http';
    url += '://';
    url += _.hasStringValue(config.host, true) ? config.host.trim() : 'localhost';

    if (_.hasStringValue(config.port, true)) {
      url += util.format(':%s', config.port.trim())
    }
    if (_.hasStringValue(config.path, true)) {
      var path = config.path;
      path = path.trim().replace(/^[\/]+|[\/]+$/g, '');
      url += util.format('/%s', path)
    }
    if (_.hasStringValue(config.username, true) && _.hasStringValue(config.password)) {
      var u = encodeURIComponent(config.username.trim());
      var p = encodeURIComponent(config.password);
      url += util.format('/?username=%s&password=%s', u, p)
    }
    return url;
  },

  hasProperties: function hasProperties(object) {
    try {
      if (Object.keys(object).length > 0) {
        return true;
      }
    }
    catch (e) {} // ignored
    return false;
  },

  transformExpression: function transformExpression(stringExpression, params) {
    function checkPath(obj, path) {
      var args = path.split('.');

      for (var i = 0; i < args.length; i++) {
        if (!obj || !obj.hasOwnProperty(args[i])) {
          return false;
        }
        obj = obj[args[i]];
      }
      return true;
    }

    var re = /\${\s*([^\s}]+)\s*}/g;
    var match;
    var generateTemplate = (function(){
      var cache = {};

      function generate(template){
        var fn = cache[template];

        if (! fn) {
          var sanitized = template
            .replace(re, function(_, match){
              return `\${transform.${match}}`;
            })
            .replace(/(\${(?!transform\.)[^}]+\})/g, '');

          fn = Function('transform', `return \`${sanitized}\``);
          cache[template] = fn
        }
        return fn;
      }
      return generate;
    })();

    try {
      while ((match = re.exec(stringExpression)) !== null) {
        if (! checkPath(params, match[1])) {
          throw ReferenceError('variable "' + match[1] + '" is not defined')
        }
      }
      var expression = generateTemplate(stringExpression);
      return Promise.resolve(expression(params))
    }
    catch (error) {
      return Promise.reject(error)
    }
  },

  assign: function(target, vArgs) {
    if (target == null) {
      // TypeError if undefined or null
      throw new TypeError('Cannot convert undefined or null to object');
    }
    var to = Object(target);

    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];
      // Skip over nextSource if undefined or null
      if (nextSource != null) {
        for (var nextKey in nextSource) {
          // Avoid bugs when hasOwnProperty is shadowed
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey) && nextSource[nextKey] != null) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  }

};

module.exports = _;

