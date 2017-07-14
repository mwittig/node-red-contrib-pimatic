# node-red-contrib-pimatic

[Node-Red](https://nodered.org/) Node Types for [Pimatic](https://pimatic.org/) connectivity. 

# Overview

Available nodes types are:

* `Device Action` calls a pimatic device action. Optionally, a parameter name and 
  value can be provided to be passed along with the invocation.
* `Get Variable` gets the value of the specified pimatic variable and sends it to the 
   output channel when the value has changed or when some input has been received.
* `Set Variable` sets the received `msg.payload` or a given value as the new value for
   the configured pimatic `variable`.
* `Controller` is a supporting node type not shown in the palette. It manages the web socket 
  connection to a pimatic server. As part of the configuration for instances of the 
  aforementioned node types it is possible to select or create an controller. Thus, it is possible to interact 
  with multiple pimatic servers within a flow.
  
# History

See [Release History](https://github.com/mwittig/node-red-contrib-pimatic/blob/master/HISTORY.md).

# Credits
 
 This project has been inspired by Jos Hendriks' work on 
 [pimatic-node-red](https://github.com/joshendriks/pimatic-node-red), a pimatic plugin to provide an embedded node-red
 instance as part of pimatic.
 
 The pimatic.png icon has been created based on the content of the
 [pimatic artworks project](https://github.com/pimatic/pimatic-artworks) published under Creative Commons license.

# License 

Copyright (c) 2017, Marcus Wittig and contributors.
All rights reserved.

License: [Apache-2.0](https://github.com/mwittig/node-red-contrib-pimatic/blob/master/LICENSE).

