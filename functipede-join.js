(function() {
    var createJoin = function createJoin(policy, ports) {
        return Functipede.flow.getFilledFlow(function(callback) {
            var queues = _.times(ports, function() {
                return [];
            });

            return _.times(ports, function(i) {
                return function() {
                    var argv = _.toArray(arguments);
                    var result = policy(argv, i, queues);
                    queues = result.queues;
                    if (result.argv) {
                        callback(result.argv);
                    }
                };
            });
        }, ports, 1);
    };

    // don't bother queueing. push data as soon as it appears.
    var any = function any(argv, index, queues) {
        queues[index].push(argv);
        var result = flushAll(queues);
        result.argv = _.flatten(result.argv, true);
        return result;
    };

    var getQueueingPolicy = function getQueueingPolicy(getResults) {
        return function(argv, index, queues) {
            queues[index].push(argv);
            if (_.some(queues, function(queue) {
                return queue.length <= 0;
            })) {
                return returnUntouched(queues);
            }

            return getResults(queues);
        };
    }

    // all at once, push one item from each queue
    var each = getQueueingPolicy(flushOneOfEach);

    // once no queues are empty, flush everything
    var all = getQueueingPolicy(flushAll);

    var flushOneOfEach = function flushOneOfEach(queues) {
        return {
            queues: _.map(queues, function(queue) {
                return _.rest(queue);
            }),
            argv: _.map(queues, function(queue) {
                return _.first(queue);
            })
        };
    };

    var flushAll = function flushAll(queues) {
        return {
            queues: _.times(queues.length, function() {
                return [];
            }),
            argv: queues
        };
    };

    var returnUntouched = function returnUntouched(queues) {
        return {
            queues: queues,
            argv: null
        };
    };

    var trigger = function trigger(argv, index, queues) {
        queues[index].push(argv);
        if (index === 0) {
            var result = flushAll(queues);
            if (result.argv) {
                result.argv[0] = result.argv[0][0];
            }

            return result;
        }

        return returnUntouched(queues);
    };

    var policy = {
        any: any,
        each: each,
        all: all,
        trigger: trigger
    };

    var allJoin = function allJoin(ports) {
        return createJoin(all, ports);
    };

    var eachJoin = function eachJoin(ports) {
        return createJoin(each, ports);
    };

    var anyJoin = function anyJoin(ports) {
        return createJoin(any, ports);
    };

    var triggerJoin = function triggerJoin(ports) {
        return createJoin(trigger, ports);
    };

    Namespace('Functipede').Namespace('join', {
        createJoin: createJoin,
        policy: policy,
        all: allJoin,
        each: eachJoin,
        any: anyJoin,
        trigger: triggerJoin
    });
})();

(function() {
    var print = function print(arg) {
        console.log(arg);
    };

    var testAnyJoin = Functipede.join.any(3);
    var testAnyInputs = testAnyJoin(print);
    testAnyInputs[0]('zero');
    testAnyInputs[1]('one');
    testAnyInputs[2]('two');

    var testTriggerJoin = Functipede.join.trigger(3);
    var testTriggerInputs = testTriggerJoin(print);
    testTriggerInputs[1]('one');
    testTriggerInputs[0]('zero');
    testTriggerInputs[2]('two');

    var testFunc = function testFunc(outa, outb, outc) {
        outa('1');
        outb('2');
        outc('3');
    };

    var testFunc1 = function testFunc1(out) {
        out('1:1');
    };

    var testFunc2 = function testFunc2(outa, outb) {
        outa('2:1');
        outb('2:2');
    };

    var wrapped = Functipede.flow.wrap(testFunc, 0, 3);
    var testFuncAnyJoin = testAnyJoin.prepend(wrapped, {0:0, 1:1, 2:2});
    var testFuncAnyInputs = testFuncAnyJoin(print);
    var wrapped1 = Functipede.flow.wrap(testFunc1, 0, 1);
    var wrapped2 = Functipede.flow.wrap(testFunc2, 0, 2);
})();
