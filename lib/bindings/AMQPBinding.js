/*
 * Copyright 2017 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of iotagent-ul
 *
 * iotagent-ul is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-ul is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-ul.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[iot_support@tid.es]
 */

'use strict';

var config = require('../configService'),
    constants = require('../constants'),
    utils = require('../iotaUtils'),
    ulParser = require('../ulParser'),
    amqp = require('amqplib/callback_api'),
    commons = require('./../commonBindings'),
    async = require('async'),
    context = {
        op: 'IOTAUL.AMQP.Binding'
    },
    amqpConn,
    amqpChannel;

/**
 * Generate a function that executes the given command in the device.
 *
 * @param {String} apiKey           APIKey of the device's service or default APIKey.
 * @param {Object} device           Object containing all the information about a device.
 * @param {Object} attribute        Attribute in NGSI format.
 * @return {Function}               Command execution function ready to be called with async.series.
 */
function generateCommandExecution(apiKey, device, attribute) {
    var cmdName = attribute.name,
        cmdAttributes = attribute.value,
        payload;

    payload = ulParser.createCommandPayload(device, cmdName, cmdAttributes);

    config.getLogger().debug(context, 'Sending command execution to device [%s] with apikey [%s] and payload [%s] ',
        apiKey, device.id, payload);

    return function commandExecutor(callback) {
        amqpChannel.assertExchange(config.getConfig().amqp.exchange, 'topic', config.getConfig().amqp.options);
        amqpChannel.publish(
            config.getConfig().amqp.exchange, '.' + apiKey + '.' + device.id + '.cmd', new Buffer(payload));
        callback();
    };
}

/**
 * Handles a command execution request coming from the Context Broker. This handler should:
 *  - Identify the device affected by the command.
 *  - Send the command to the appropriate MQTT topic.
 *  - Update the command status in the Context Broker.
 *
 * @param {Object} device           Device data stored in the IOTA.
 * @param {String} attributes       Command attributes (in NGSIv1 format).
 */
function commandHandler(device, attributes, callback) {
    config.getLogger().debug(context, 'Handling AQMP command for device [%s]', device.id);

    utils.getEffectiveApiKey(device.service, device.subservice, function(error, apiKey) {
        async.series(attributes.map(generateCommandExecution.bind(null, apiKey, device)), callback);
    });
}

function queueListener(msg) {
    commons.messageHandler(msg.fields.routingKey.replace(/\./g, '/'), msg.content.toString());
}

/**
 * Starts the IoT Agent with the passed configuration. This method also starts the listeners for all the transport
 * binding plugins.
 */
function start(callback) {
    var exchange,
        queue;

    if (config.getConfig() && config.getConfig().amqp && config.getConfig().amqp.exchange) {
        exchange = config.getConfig().amqp.exchange;
    } else {
        exchange = constants.AMQP_DEFAULT_EXCHANGE;
    }

    if (config.getConfig() && config.getConfig().amqp && config.getConfig().amqp.queue) {
        queue = config.getConfig().amqp.queue;
    } else {
        queue = constants.AMQP_DEFAULT_QUEUE;
    }

    config.getLogger().info(context, 'Starting AQMP binding');

    function createConnection(callback) {
        amqp.connect('amqp://localhost', callback);
    }

    function createChannel(conn, callback) {
        amqpConn = conn;
        conn.createChannel(callback);
    }

    function assertExchange(ch, callback) {
        amqpChannel = ch;
        amqpChannel.assertExchange(exchange, 'topic', {});
        callback();
    }

    function assertQueue(callback) {
        amqpChannel.assertQueue(queue, {exclusive: false}, callback);
        amqpChannel.assertQueue(queue + '_commands', {exclusive: false}, callback);
    }

    function createListener(queueObj, callback) {

        amqpChannel.bindQueue(queue, exchange, '.*.*.attrs.#');
        amqpChannel.consume(queue, queueListener, {noAck: true});

        amqpChannel.bindQueue(queue + '_commands', exchange, '.*.*.cmdexe');
        amqpChannel.consume(queue + '_commands', queueListener, {noAck: true});

        callback();
    }

    async.waterfall([
        createConnection,
        createChannel,
        assertExchange,
        assertQueue,
        createListener
    ], function(error) {
        callback();
    });
}

/**
 * Stops the IoT Agent and all the transport plugins.
 */
function stop(callback) {
    config.getLogger().info('Stopping AMQP Binding');

    callback();
}


exports.commandHandler = commandHandler;
exports.start = start;
exports.stop = stop;
exports.protocol = 'AMQP';
