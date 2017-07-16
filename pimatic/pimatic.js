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
module.exports = function(RED) {
  "use strict";

  var util = require('util');
  var io = require('socket.io-client');
  var uuidv4 = require('uuid/v4');
  var _ = require('./helper');
  var packageFile = require('../package.json');

  //
  // Pimatic Controller Node
  //

  function pimaticControllerNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.pimaticDebug = _.debugInit(node);
    node.pimaticVariables = {};
    node.pimaticSubscribedVariables = {};
    node.pimaticSocket = null;
    node.pimaticReady = false;
    node.pimaticDebug('Started' + JSON.stringify(config));

    function addVariableHandler(variable) {
      var value = {
        name: variable.name,
        unit: variable.unit,
        type: variable.type,
        value: variable.value,
        readonly: variable.readonly,
        time: Date.now()
      };

      node.pimaticVariables[variable.name] = value;

      // check subscriptions - notify subscribers the new value
      if (node.pimaticSubscribedVariables.hasOwnProperty(variable.name)) {
        var subscribers = node.pimaticSubscribedVariables[variable.name];
        for (var x = 0; x < subscribers.length; ++x) {
          subscribers[x].emit('pimatic-variable-value-changed', value)
        }
      }
    }

    function removeVariableHandler(variable) {
      node.pimaticDebug('variable removed: ' + variable.name);
      if (node.pimaticVariables.hasOwnProperty(variable.name)) {
        delete node.pimaticVariables[variable.name];
      }

      // check subscriptions - notify subscribers the variable no longer exists
      if (node.pimaticSubscribedVariables.hasOwnProperty(variable.name)) {
        var subscribers = node.pimaticSubscribedVariables[variable.name];
        for (var x = 0; x < subscribers.length; ++x) {
          subscribers[x].emit('pimatic-variable-not-found', variable.name)
        }
      }
    }

    function stopWebSocket() {
      if (node.pimaticSocket != null) {
        node.pimaticSocket.close();
        node.pimaticSocket = null;
        node.pimaticDebug('closed web socket');
      }
    }

    function startWebSocket() {

      function socketConnectedHandler() {
        for (var key in node.pimaticSubscribedVariables) {
          if (node.pimaticSubscribedVariables.hasOwnProperty(key)) {
            var subscribers = node.pimaticSubscribedVariables[key];
            for (var x = 0; x < subscribers.length; ++x) {
              subscribers[x].emit('pimatic-connected');
            }
          }
        }
      }

      function socketErrorHandler(errorMessage) {
        node.pimaticReady = false;
        if (errorMessage.hasOwnProperty('message')) {
          errorMessage = 'connection error: ' + errorMessage.message
        }
        else {
          errorMessage = 'connection error: ' + errorMessage;
        }
        node.error(errorMessage);
        for (var key in node.pimaticSubscribedVariables) {
          if (node.pimaticSubscribedVariables.hasOwnProperty(key)) {
            var subscribers = node.pimaticSubscribedVariables[key];
            for (var x = 0; x < subscribers.length; ++x) {
              subscribers[x].emit('pimatic-connection-error', errorMessage);
            }
          }
        }
      }

      if (node.pimaticSocket == null) {
        node.pimaticSocket = io(_.getConnectorURL(config), {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 3000,
          timeout: 20000,
          forceNew: true
        });
        node.pimaticDebug('first subscriber - starting web socket');

        node.pimaticSocket.on('connect', socketConnectedHandler);
        node.pimaticSocket.on('error', socketErrorHandler);
        node.pimaticSocket.on('connect_error', socketErrorHandler);
        node.pimaticSocket.on('variableAdded', addVariableHandler);
        node.pimaticSocket.on('variableChanged', addVariableHandler);
        node.pimaticSocket.on('variableRemoved', removeVariableHandler);

        node.pimaticSocket.on('variableValueChanged', function(varEvent) {
          var variable = {
            name: varEvent.variableName,
            value: varEvent.variableValue
          };
          //node.pimaticDebug('variableValueChanged event: ' + variable.name);
          if (node.pimaticVariables.hasOwnProperty(variable.name)) {
            // augment type info as variableValueChanged event does not provide for it
            variable = Object.assign({}, node.pimaticVariables[variable.name], variable);
          }
          else {
            variable = Object.assign(variable, {
              type: 'unknown',
              unit: '',
              readonly: true
            });
          }
          node.pimaticVariables[variable.name] = variable;

          if (node.pimaticSubscribedVariables.hasOwnProperty(variable.name)) {
            var subscribers = node.pimaticSubscribedVariables[variable.name];
            for (var x = 0; x < subscribers.length; ++x) {
              subscribers[x].emit('pimatic-variable-value-changed', variable);
            }
          }
        });

        node.pimaticSocket.on('variables', function(variables) {
          node.pimaticReady = true;
          node.pimaticDebug('variables event received variables: ' + variables.length);
          for (var x = 0; x < variables.length; ++x) {
            addVariableHandler(variables[x]);
          }
          // check subscriptions for unknown variables
          for (var key in node.pimaticSubscribedVariables) {
            if (node.pimaticSubscribedVariables.hasOwnProperty(key)) {
              if (! node.pimaticVariables.hasOwnProperty(key)) {
                var subscribers = node.pimaticSubscribedVariables[key];
                for (var x = 0; x < subscribers.length; ++x) {
                  subscribers[x].emit('pimatic-variable-not-found', key);
                }
              }
            }
          }
        });
      }
    }

    node.registerVariable = function (variableName, subscriber) {
      startWebSocket();

      if (node.pimaticSubscribedVariables.hasOwnProperty(variableName)) {
        node.pimaticSubscribedVariables[variableName].push(subscriber)
      }
      else {
        node.pimaticSubscribedVariables[variableName] = [subscriber];
      }

      if (node.pimaticReady) {
        if (node.pimaticVariables.hasOwnProperty(variableName)) {
          var variable = node.pimaticVariables[variableName];
          subscriber.emit('pimatic-variable-value-changed', variable);
        }
        else {
          // variable not found
          subscriber.emit('pimatic-variable-not-found', variableName)
        }
      }
    };

    node.invokeAction = function(action, params) {
      var id = uuidv4();

      return new Promise(function (resolve, reject) {

        if (node.pimaticSocket == null) {
          node.error(util.format("invokeAction (%s) failed: %s", action, 'socket not ready'));
          return reject('socket not ready')
        }

        var callResultHandler = function (callResult) {
          if (callResult.id == id) {
            node.pimaticSocket.removeListener('error', socketErrorHandler);
            node.pimaticSocket.removeListener('connect_error', socketErrorHandler);
            node.pimaticSocket.removeListener('callResult', callResultHandler);
            if (callResult.success) {
              resolve(callResult.result)
            }
            else {
              if (callResult.error == null) {
                callResult.error = 'unknown error (check pimatic server log)'
              }
              node.error(JSON.stringify(callResult));
              node.error(util.format("invokeAction (%s) failed: %s", action, '' + callResult.error));
              reject(callResult.error)
            }
          }
        };

        var socketErrorHandler = function (errorMessage) {
          node.pimaticSocket.removeListener('callResult', callResultHandler);
          if (errorMessage.hasOwnProperty('message')) {
            errorMessage = 'connection error: ' + errorMessage.message
          }
          else {
            errorMessage = 'connection error: ' + errorMessage;
          }
          node.error(util.format("invokeAction (%s) failed: %s", action, errorMessage));
          reject(errorMessage);
        };

        node.pimaticSocket.emit('call', {
          id: id,
          action: action,
          params: params
        });

        node.pimaticSocket.on('callResult', callResultHandler);
        node.pimaticSocket.once('error', socketErrorHandler);
        node.pimaticSocket.once('connect_error', socketErrorHandler);
      });
    };

    node.setVariableValue = function(name, value, unit) {
      var params = {
        name: name,
        valueOrExpression: value,
        type: 'value',
        unit: unit
      };
      return node.invokeAction('updateVariable', params).then(function(callResult) {
        return Promise.resolve(callResult.variable)
      })
    };

    node.getVariableValue = function(name) {
      var params = {
        name: name
      };
      return node.invokeAction('getVariableByName', params).then(function(callResult) {
        return Promise.resolve(callResult.variable)
      })
    };

    node.executeDeviceAction = function(deviceId, actionName, actionParams) {
      actionParams = actionParams || {};
      var params = Object.assign({
        deviceId: deviceId,
        actionName: actionName
      }, actionParams);
      return node.invokeAction('callDeviceAction', params)
    };

    node.deregisterVariable = function (variableName, subscriber) {
      if (node.pimaticSubscribedVariables.hasOwnProperty(variableName)) {
        var subscribers = node.pimaticSubscribedVariables[variableName];
        var x = subscribers.length;
        while (x--) {
          if (subscribers[x] == subscriber) {
            node.pimaticDebug('Delete subscriber for variable: ' + variableName);
            subscribers.splice(x, 1);
          }
        }
        if (subscribers.length === 0) {
          node.pimaticDebug('No more subscribers for variable: ' + variableName);
          delete node.pimaticSubscribedVariables[variableName]
        }
        if (! _.hasProperties(node.pimaticSubscribedVariables)) {
          node.pimaticDebug('no subscribers - stopping web socket');
          stopWebSocket();
        }
      }
    };

    node.on('close', function(done) {
      node.pimaticDebug('closing pimaticControllerNode');
      stopWebSocket();
      node.status({});
      node.pimaticDebug('closed pimaticControllerNode');
      done();
    });
  }

  //
  // Pimatic Get Variable
  //

  function pimaticGetVariableNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.pimaticDebug = _.debugInit(node);

    if (_.hasStringValue(config.variable, true) &&
      _.hasStringValue(config.controller, true)) {

      config.variable = config.variable.replace(/^[\s\$]+|\s+$/gm,'');
      node.name = config.name || '(' + config.variable + ')';
      var pimaticController = RED.nodes.getNode(config.controller);
      node.pimaticDebug(JSON.stringify(config));

      node.on('pimatic-variable-value-changed', function(varEvent) {
        node.status({fill: 'green', shape: 'ring', text: 'ok'});

        if (varEvent.name == config.variable) {
          node.pimaticDebug('pimatic-variable-value-changed for ' + config.variable)
          var context = node.context();
          if (context.get('value') != varEvent.name || !config.filter) {
            context.set('value', varEvent.value);
            var msg = Object.assign({
              payload: varEvent.value
            }, varEvent);
            delete msg.value;
            node.send(msg);
          }
        }
      });

      node.on('input', function(msg) {
        node.pimaticDebug("input event");

        if (pimaticController.pimaticVariables.hasOwnProperty(config.variable)) {

          node.pimaticDebug("getVariable");
          pimaticController.getVariableValue(config.variable)
            .then(function(variable) {
              pimaticController.pimaticVariables[config.variable] = variable;
              var context = node.context();
              context.set('value', variable.variableValue);

              var msg = Object.assign({}, variable, {
                payload: variable.value,
                time: Date.now()
              });
              delete msg.value;
              node.send(msg);
            })
            .catch(function(error) {
              node.error(util.format('getVariable (%s) failed: %s', config.variable, '' + error));
              node.status({fill: 'red', shape: 'ring', text: '' + error});
            });
        }
        else {
          node.emit('pimatic-variable-not-found', config.variable);
        }
      });

      node.on('pimatic-variable-not-found', function(variableName) {
        node.error('variable not found: ' + variableName);
        node.status({fill: 'red', shape: 'ring', text: 'variable not found'});
      });

      node.on('pimatic-connection-error', function(errorMessage) {
        node.error(errorMessage);
        node.status({fill: 'red', shape: 'ring', text: '' + errorMessage});
      });

      node.on('close', function(done) {
        node.pimaticDebug('closing pimaticGetVariableNode');
        pimaticController.deregisterVariable(config.variable, node);
        node.removeAllListeners('input');
        node.removeAllListeners('pimatic-variable-value-changed');
        node.removeAllListeners('pimatic-variable-not-found');
        node.removeAllListeners('pimatic-connection-error');
        node.status({});
        node.pimaticDebug('closed pimaticGetVariableNode');
        done();
      });

      pimaticController.registerVariable(config.variable, node);
    }
    else {
      node.error('invalid node configuration');
      node.status({fill: 'red', shape: 'ring', text: 'invalid node configuration'});
    }
  }

  //
  // Pimatic Set Variable
  //

  function pimaticSetVariableNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.pimaticDebug = _.debugInit(node);

    if (_.hasStringValue(config.variable, true) &&
      _.hasStringValue(config.controller, true)) {

      config.variable = config.variable.replace(/^[\s\$]+|\s+$/gm,'');
      node.name = config.name || '(' + config.variable + ')';
      var pimaticController = RED.nodes.getNode(config.controller);
      node.pimaticDebug(JSON.stringify(config));

      node.on('pimatic-variable-value-changed', function(varEvent) {
        if (varEvent.name == config.variable) {
          node.pimaticDebug('pimatic-variable-value-changed for ' + config.variable);

          if (varEvent.readonly) {
            node.status({fill: 'red', shape: 'ring', text: 'variable is readonly'});
          }
          else {
            node.status({fill: 'green', shape: 'ring', text: 'ok'});
          }
        }
      });

      node.on('input', function(msg) {
        node.pimaticDebug("input");

        if (pimaticController.pimaticVariables.hasOwnProperty(config.variable)) {
          if (! pimaticController.pimaticVariables[config.variable].readonly) {
            node.pimaticDebug("setVariable");
            pimaticController.setVariableValue(config.variable, config.value || msg.payload, config.unit)
              .then(function(variable) {
                pimaticController.pimaticVariables[config.variable] = variable;
                var context = node.context();
                context.set('value', variable.variableValue);

                var msg = Object.assign({}, variable, {
                  payload: variable.value,
                  time: Date.now()
                });
                delete msg.value;
                node.send(msg);
              })
              .catch(function(error) {
                node.error(util.format('setVariable (%s) failed: %s', config.variable, '' + error))
                node.status({fill: 'red', shape: 'ring', text: '' + error});
              });
          }
          else {
            node.error('variable is readonly');
            node.status({fill: 'red', shape: 'ring', text: 'variable is readonly'});
          }
        }
        else {
          node.emit('pimatic-variable-not-found', config.variable);
        }
      });

      node.on('pimatic-variable-not-found', function(variableName) {
        node.error('variable not found: ' + variableName);
        node.status({fill: 'red', shape: 'ring', text: 'variable not found'});
      });

      node.on('pimatic-connection-error', function(errorMessage) {
        node.error(errorMessage);
        node.status({fill: 'red', shape: 'ring', text: '' + errorMessage});
      });

      node.on('close', function(done) {
        node.pimaticDebug('closing pimaticGetVariableNode');
        pimaticController.deregisterVariable(config.variable, node);
        node.removeAllListeners('input');
        node.removeAllListeners('pimatic-variable-value-changed');
        node.removeAllListeners('pimatic-variable-not-found');
        node.removeAllListeners('pimatic-connection-error');
        node.status({});
        node.pimaticDebug('closed pimaticGetVariableNode');
        done();
      });

      pimaticController.registerVariable(config.variable, node);
    }
    else {
      node.error('invalid node configuration');
      node.status({fill: 'red', shape: 'ring', text: 'invalid node configuration'});
    }
  }

  //
  // Pimatic Device Action Node
  //

  function pimaticDeviceActionNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.pimaticDebug = _.debugInit(node);

    if (_.hasStringValue(config.deviceId, true) &&
      _.hasStringValue(config.action, true) &&
      _.hasStringValue(config.controller, true)) {

      node.name = config.name || util.format('(%s.%s)', config.deviceId, config.action);
      var pimaticController = RED.nodes.getNode(config.controller);
      node.pimaticDebug(JSON.stringify(config));

      node.on('input', function(msg) {
        node.pimaticDebug("input");
        node.pimaticDebug("callAction");
        var params = {};
        var name;

        if (_.hasStringValue(config.parameterName, true)) {
          name = config.parameterName;
        }
        else if (_.hasStringValue(msg.parameterName, true)){
          name = msg.parameterName;
        }

        if (name != null) {
          params[name] = msg.parameterValue || msg.payload;
        }

        pimaticController.executeDeviceAction(config.deviceId, config.action, params)
          .then(function(callResult) {
            node.pimaticDebug("callAction result: " + JSON.stringify(callResult));
            var result = (callResult.result != null) ? callResult.result : '';
            var context = node.context();
            context.set('value', result);

            var msg = {
              payload: result,
              success: true,
              deviceId: config.deviceId,
              action: config.action,
              time: Date.now()
            };
            node.send(msg);
            node.status({fill: 'green', shape: 'ring', text: 'ok'});
          })
          .catch(function(error) {
            node.error(util.format('deviceAction (%s.%s) failed: %s', config.deviceId, config.action, '' + error));
            node.status({fill: 'red', shape: 'ring', text: '' + error});
            // var msg = {
            //   payload: '',
            //   error: error,
            //   success: false,
            //   deviceId: config.deviceId,
            //   action: config.action,
            //   time: Date.now()
            // };
            // node.send(msg);
          });
      });

      node.on('pimatic-connection-error', function(errorMessage) {
        node.error(errorMessage);
        node.status({fill: 'red', shape: 'ring', text: '' + errorMessage});
      });

      node.on('pimatic-connected', function() {
        node.status({fill: 'green', shape: 'ring', text: 'ok'});
      });

      node.on('close', function(done) {
        node.pimaticDebug('closing pimaticGetVariableNode');
        pimaticController.deregisterVariable('#action', node);
        node.removeAllListeners('input');
        node.removeAllListeners('pimatic-variable-value-changed');
        node.removeAllListeners('pimatic-variable-not-found');
        node.removeAllListeners('pimatic-connection-error');
        node.status({});
        node.pimaticDebug('closed pimaticGetVariableNode');
        done();
      });

      pimaticController.registerVariable('#action', node);
    }
    else {
      node.error('invalid node configuration');
      node.status({fill: 'red', shape: 'ring', text: 'invalid node configuration'});
    }
  }


  //
  // Register Node Types
  //
  RED.nodes.registerType('controller', pimaticControllerNode);
  RED.nodes.registerType('get variable', pimaticGetVariableNode);
  RED.nodes.registerType('set variable', pimaticSetVariableNode);
  RED.nodes.registerType('device action', pimaticDeviceActionNode);
  RED.log.info(util.format('%s@%s started', packageFile.name, packageFile.version));
};