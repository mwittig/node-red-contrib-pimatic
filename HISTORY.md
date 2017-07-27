# Release History

* 20170727, V1.1.1
    * Revised documentation
* 20170724, V1.1.0
    * Feature: Added "rule action" node type
    * Feature: Added (backwards-compatible) "Msg on Error" option for "device action" node type
    * Feature: Added (backwards-compatible) "output discriminator" for "get variable" node type 
    * Improved orderly shutdown, taking into account node-red shuts nodes down in arbitrary order
    * Revised help texts
* 20170716, V1.0.2
    * Strip leading dollar sign and leading & trailing white space from variable name
    * Improved state handling of subscription during initialization. "variable not found" does no 
    longer overlay socket errors and "variable not found" is no longer triggered during web socket 
    initialization.
* 20170715, V1.0.1
    * Changed category name to 'pimatic home' for better co-existence with pimatic-node-red
    * Minor changes of data help texts
* 20170714, V1.0.0
    * Initial Version