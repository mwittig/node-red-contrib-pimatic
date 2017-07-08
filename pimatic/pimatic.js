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

var util = require('util');
var io = require('socket.io-client');

module.exports = function(RED) {

  //
  // Pimatic Contoller Node
  //

  function pimaticControllerNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.pimaticVariables = {};
    node.pimaticSubscribedVariables = {};
    node.log(JSON.stringify(config));

    function hasConfigValue(value, trimIt) {
      try {
        return (value != undefined) && (!trimIt || value.trim().length != 0)
      }
      catch (e) {
        return false
      }
    }

    function getConnectorURL() {
      var url = hasConfigValue(config.protocol, true) ? config.protocol.trim() : 'http';
      url += "://";
      url += hasConfigValue(config.host, true) ? config.host.trim() : 'localhost';

      if (hasConfigValue(config.port, true)) {
        url += util.format(':%s', config.port.trim())
      }
      if (hasConfigValue(config.path, true)) {
        var path = config.path;
        path = path.trim().replace(/^[\/]+|[\/]+$/g, '');
        url += util.format('/%s', path)
      }
      if (hasConfigValue(config.username, true) && hasConfigValue(config.password)) {
        var u = encodeURIComponent(config.username.trim());
        var p = encodeURIComponent(config.password);
        url += util.format('/?username=%s&password=%s', u, p)
      }
      node.log(url);
      return url;
    }

    function addVariableHandler(variable) {
      node.pimaticVariables[variable.name] = variable;

      // check subscriptions
      if (node.pimaticVariables.hasOwnProperty(variable.name)) {
        var subscribers = node.pimaticSubscribedVariables[variable.name];
        for (var x = 0; x < subscribers.length; ++x) {
          subscribers[x].emit('pimatic-variable-changed', {
            variableName: variable.name,
            variableType: variable.type,
            variableValue: variable.value,
            time: Date().now()
          })
        }
      }
    }

    function removeVariableHandler(variable) {
      delete node.pimaticVariables[variable.name]

      // check subscriptions
      if (node.pimaticVariables.hasOwnProperty(variable.name)) {
        var subscribers = node.pimaticSubscribedVariables[variable.name];
        for (var x = 0; x < subscribers.length; ++x) {
          subscribers[x].emit('pimatic-variable-removed', variable.name)
        }
      }
    }

    function startWebSocket() {

      node.pimatic = io(getConnectorURL(), {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 3000,
        timeout: 20000,
        forceNew: true
      });

      node.pimatic.on('variableAdded', addVariableHandler);
      node.pimatic.on('variableChanged', addVariableHandler);
      node.pimatic.on('variableRemoved', removeVariableHandler);

      node.pimatic.on('variableValueChanged', function(varEvent) {
        node.log('variableValueChanged', varEvent.variableName);

        if (node.pimaticSubscribedVariables.hasOwnProperty(varEvent.variableName)) {
          var subscribers = node.pimaticSubscribedVariables[varEvent.variableName];
          for (var x = 0; x < subscribers.length; ++x) {
            subscribers[x].emit('pimatic-variable-changed', varEvent);
          }
        }
      });

      node.pimatic.on('variables', function(variables){
        for (var x = 0; x < variables.length; ++x) {
          addVariableHandler(variables[x]);
        }
      });
    }

    node.registerVariable = function (variableName, subscriber) {
      if (node.pimaticSubscribedVariables.hasOwnProperty(variableName)) {
        node.pimaticSubscribedVariables[variableName].push(subscriber)
      }
      else {
        node.pimaticSubscribedVariables[variableName] = [subscriber];
      }
      if (node.pimaticVariables.hasOwnProperty(variableName)) {
        var variable = node.pimaticVariables[variableName];
        subscriber.emit('pimatic-variable-changed', {
          variableName: variable.name,
          variableType: variable.type,
          variableValue: variable.value,
          time: Date().now()
        });
      }
    };

    node.deregisterVariable = function (variableName, subscriber) {
      if (node.pimaticSubscribedVariables.hasOwnProperty(variableName)) {
        var subscribers = node.pimaticSubscribedVariables[variableName];
        var x = subscribers.length;
        while (x--) {
          if (subscribers[x] == subscriber) {
            delete subscribers[x];
          }
        }
      }
    };

    startWebSocket();
  }

  //
  // Pimatic Variable Input
  //

  function pimaticVariableInputNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    var pimaticController = RED.nodes.getNode(config.controller);
    pimaticController.registerVariable(config.variable, node)

    node.on('pimatic-variable-changed', function(varEvent) {
      node.status({fill: "green", shape: "ring", text: "ok"});

      if (varEvent.variableName == config.variable) {
        var context = node.context();
        if (context.get('value') != varEvent.variableValue || !node.filter) {
          context.set('value', value);
          var msg = {
            payload: varEvent.variableValue,
            variable: varEvent.variableName
          };
          node.send(msg);
        }
      }
    });

    node.on('pimatic-variable-removed', function(variableName) {
      node.status({fill: "red", shape: "ring", text: "variable not found"});
    });

    node.on('close', function(msg) {
      pimaticController.deregisterVariable(config.variable, node)
    });
  }

  //
  // Register Node Types
  //
  RED.nodes.registerType("pimatic-controller", pimaticControllerNode);
  RED.nodes.registerType("pimatic-variable-input", pimaticVariableInputNode);
};
