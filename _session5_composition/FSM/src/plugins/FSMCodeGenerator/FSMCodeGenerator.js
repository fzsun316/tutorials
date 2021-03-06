/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 1.7.0 from webgme on Mon May 02 2016 11:07:21 GMT-0500 (Central Daylight Time).
 * A plugin that inherits from the PluginBase. To see source code documentation about available
 * properties and methods visit <host>/docs/source/PluginBase.html.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'text!./Templates/index.html',
    'common/util/ejs',
    'text!./Templates/programjs.ejs'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase,
    indexHtmlContent,
    ejs,
    programJsTemplate) {
    'use strict';


    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of FSMCodeGenerator.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin FSMCodeGenerator.
     * @constructor
     */
    var FSMCodeGenerator = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
        this.pathToNode = {};
    };

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    FSMCodeGenerator.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    FSMCodeGenerator.prototype = Object.create(PluginBase.prototype);
    FSMCodeGenerator.prototype.constructor = FSMCodeGenerator;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    FSMCodeGenerator.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            artifact,
            nodeObject;


        //// Using the logger.
        //self.logger.debug('This is a debug message.');
        //self.logger.info('This is an info message.');
        //self.logger.warn('This is a warning message.');
        //self.logger.error('This is an error message.');
        //
        //// Using the coreAPI to make changes.
        //
        //nodeObject = self.activeNode;
        //
        //self.core.setAttribute(nodeObject, 'name', 'My new obj');
        //self.core.setRegistry(nodeObject, 'position', {x: 70, y: 70});

        self.extractDataModel()
            .then(function (dataModel) {
                var dataModelStr = JSON.stringify(dataModel, null, 4);
                self.dataModel = dataModel;

                self.logger.info('Extracted dataModel', dataModelStr);

                return self.blobClient.putFile('dataModel.json', dataModelStr);
            })
            .then(function (jsonFileHash) {
                var programJS;
                self.logger.info('dataModel.json available with blobHash', jsonFileHash);
                // Add link from result to this file.
                self.result.addArtifact(jsonFileHash);

                // Create a complex artifact, with links to multiple files.
                artifact = self.blobClient.createArtifact('simulator');

                programJS = ejs.render(programJsTemplate, self.dataModel).replace(new RegExp('&quot;', 'g'), '"');
                self.logger.info('program.js', programJS);

                return artifact.addFilesAsSoftLinks({
                    'program.js': programJS,
                    'index.html': indexHtmlContent
                });
            })
            .then(function (/*hashes*/) {
                return artifact.save();
            })
            .then(function (simulatorHash) {
                self.result.addArtifact(simulatorHash);

                self.core.setAttribute(self.activeNode, 'simulator', simulatorHash);
                self.core.setAttribute(self.activeNode, 'simulatorOrigin', self.commitHash);

                return self.save('Added simulator to model');
            })
            .then(function () {

                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch(function (err) {
                // Success is false at invocation.
                callback(err, self.result);
            });
    };

    /**
     *
     * @param {function(Error, object)} [callback] - If not defined promise a will be returned.
     */
    FSMCodeGenerator.prototype.extractDataModel = function (callback) {
        var self = this,
            dataModel = {
                stateMachine: {
                    name: '',
                    initialState: null, // Path/id of initial state
                    finalStates: [],    // Paths/ids of final end states
                    states: []
                }
            };

        dataModel.stateMachine.name = self.core.getAttribute(self.activeNode, 'name');

        // In order to avoid multiple iterative asynchronous 'load' calls we pre-load all the nodes in the state-machine
        // and builds up a local hash-map from their paths to the node.
        return this.core.loadSubTree(self.activeNode)
            .then(function (nodes) {
                var i,
                    childNode,
                    childName,
                    childrenPaths;

                for (i = 0; i < nodes.length; i += 1) {
                    // For each node in the subtree we get the path and use it for the index of the hash-map, where
                    // values are the actual node.
                    self.pathToNode[self.core.getPath(nodes[i])] = nodes[i];
                }

                childrenPaths = self.core.getChildrenPaths(self.activeNode);

                for (i = 0; i < childrenPaths.length; i += 1) {
                    childNode = self.pathToNode[childrenPaths[i]];
                    // Log the name of the child (it's an attribute so we use getAttribute).
                    childName = self.core.getAttribute(childNode, 'name');
                    self.logger.info('At childNode', childName);
                    // Milestone 1 end
                    // By knowledge of the language we know we are interested in StateBases and Transitions.
                    // self.META contains all the meta-nodes indexed by their name and the PluginBase defines
                    // a method, self.isMetaTypeOf, to check if a node is of a certain meta type.
                    if (self.isMetaTypeOf(childNode, self.META['StateBase']) === true) {
                        if (self.isMetaTypeOf(childNode, self.META['Initial']) === true) {
                            dataModel.stateMachine.initialState = self.core.getPath(childNode);
                        } else if (self.isMetaTypeOf(childNode, self.META['End']) === true) {
                            dataModel.stateMachine.finalStates.push(self.core.getPath(childNode));
                        }

                        dataModel.stateMachine.states.push(self.getStateData(childNode));
                    } else if (self.isMetaTypeOf(childNode, self.META['Transition']) === true) {
                        // No need to handle - getStateData will get the transitions.
                    } else {
                        self.logger.debug('Child was not of type StateBase or Transition, skipping', childName);
                    }
                }

                return dataModel;
            })
            .nodeify(callback);
    };

    FSMCodeGenerator.prototype.getStateData = function (stateNode) {
        var self = this,
            stateData = {
                id: '',
                name: '',
                transitions: []
            },
            i,
            transNode,
            transPaths;

        stateData.name = self.core.getAttribute(stateNode, 'name');
        stateData.id = self.core.getPath(stateNode);

        // StateNode <--src:TransitionNode:dst--> AnotherState
        // Q: Which are the outgoing transitions from a state node?
        // Q: [Rephrased] Which are the transitions that have the state node as a target for its 'src' pointer?

        transPaths = self.core.getCollectionPaths(stateNode, 'src');

        for (i = 0; i < transPaths.length; i += 1) {
            transNode = self.pathToNode[transPaths[i]];
            self.logger.info(stateData.name, 'has outgoing transition', transPaths[i]);
            stateData.transitions.push(self.getTransitionData(transNode));
        }

        return stateData;
    };

    FSMCodeGenerator.prototype.getTransitionData = function (transitionNode) {
        var self = this,
            transitionData = {
                targetId: '',
                targetName: '',
                event: ''
            },
            targetNode;

        transitionData.event = self.core.getAttribute(transitionNode, 'event');

        // StateNode <--src:TransitionNode:dst--> AnotherState
        // Q: What is the target for the 'dst' pointer of TransitionNode?
        transitionData.targetId = self.core.getPointerPath(transitionNode, 'dst');

        targetNode = self.pathToNode[transitionData.targetId];

        transitionData.targetName = self.core.getAttribute(targetNode, 'name');

        return transitionData;
    };

    return FSMCodeGenerator;
});