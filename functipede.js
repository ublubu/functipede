"using strict";

var Functipede = {};

(function() {
	// wraps a function so that each of its arguments maps to either an in port or an out port
	// i.e. each 'in' argument passes through its own single-argument in port
	var wrap = function wrap(func, ins, outs) {
		var flow = function() {
			var flowResolver = function(outPorts) {
				var argv = [], argc = 0;

				if (!ins) {
					func.apply(null, outPorts);
					return [];
				}

				return _.times(ins, function(i) {
					return function(arg) {
						argv[i] = arg;
						argc++;
						if (argc === ins) {
							func.apply(null, argv.concat(outPorts));
						}
					};
				});
			};

			return resolveFlow(arguments, outs, flowResolver);
		};

		flow.src = func;
		return getFilledFlow(flow, ins, outs);
	};

	// wraps a function so that all of its 'in' arguments pass through a single in port
	var wrapS = function wrapS(func, outs) {
		var flow = function() {
			var flowResolver = function(outPorts) {
				return [function() {
					func.apply(null, _.toArray(arguments).concat(outPorts));
				}];
			};

			return resolveFlow(arguments, outs, flowResolver);
		};

		flow.src = func;
		return getFilledFlow(flow, 1, outs);
	};

	var wrapSerial = function wrapSerial(func) {
		var flow = function() {
			var flowResolver = function(outPorts) {
				var outPort = outPorts[0];
				return [function() {
					outPort(func.apply(null, arguments));
				}];
			};

			return resolveFlow(arguments, 1, flowResolver);
		};

		flow.src = func;
		return getFilledFlow(flow, 1, 1);
	};

	var resolveFlow = function resolveFlow(outPortArgs, expectedOuts, flowResolver) {
		var outPorts = _.toArray(outPortArgs);
		if (outPorts.length !== expectedOuts) {
			throw new Error('wrong number of output ports (expected ' + expectedOuts +
				'; got ' + outPorts.length + ')');
		}

		return flowResolver(outPorts);
	};

	// adds convenience values that 'flows' are expected to have
	//     in order to be functipedable
	var getFilledFlow = function getFilledFlow(flow, ins, outs) {
		var newFields = {
			ins: ins,
			outs: outs,
			prepend: _.partial(prepend, flow),
			append: _.partial(append, flow),
			chain: _.partial(chain, flow)
		};
		return _.assign(_.clone(flow), newFields);
	};

	// the successors' out ports are inserted to replace the out port they chain from
	//     rather than appended after the predecessor's unbound out ports
	var chain = function chain(predecessor) {
		var successors = _.rest(_.toArray(arguments));
		if (successors.length != predecessor.outs) {
			throw new Error('Need ' + predecessor.outs + 'successors. Received ' + successors.length + '.');
		}

		var result = _.reduce(successors, function(accum, successor, index) {
			if (!successor) {
				// use a dummy flow to 'pop' the predecessor out port from the front of the
				//     out port list and push it at the end.
				successor = passThrough;
			}

			if (successor.ins !== 1) {
				throw new Error('Can\'t chain ' + index + '-th successor ' +
					' with ' + successor.ins + ' in ports. (allowed: 1)');
			}

			var binding = {};
			binding[accum.outPortBindIndex] = 0;
			accum.flow = append(accum.flow, successor, binding);

			return accum;
		}, {
			outPortBindIndex: 0,
			flow: predecessor,
		});

		return result.flow;
	};

	var prepend = function prepend(successor, predecessor, inOutBinding) {
		var outInBinding = _.reduce(inOutBinding, function(accum, outIndex, inIndex) {
			accum[outIndex] = inIndex;
			return accum;
		}, {});

		return append(predecessor, successor, outInBinding);
	};

	// the predecessor and successor are flows
	// the outInBinding is a mapping from predecessor out port to successor in port
	var append = function append(predecessor, successor, outInBinding) {
		// get the reverse of the bindings dictionary
		var inOutBinding = _.reduce(outInBinding, function(accum, inIndex, outIndex) {
			accum[inIndex] = outIndex;
			return accum;
		}, {});

		// count the bound/unbound ports
		var bindingCount = _.size(inOutBinding);
		var unboundPredecessorOutPortCount = predecessor.outs - bindingCount;
		var unboundSuccessorInPortCount = successor.ins - bindingCount;

		// true for bound successor inputs, false for unbound
		var inputBindingState = _.times(predecessor.ins, function(inIndex) {
			return inOutBinding.hasOwnProperty(inIndex);
		});

		var composite = function composite() {
			var externalOutPortBinds = _.toArray(arguments);

			// the successor out ports are appended after the unbound predecessor out ports
			var successorOutPortBinds = _.rest(externalOutPortBinds, unboundPredecessorOutPortCount);
			var remainingOutPortBinds = _.first(externalOutPortBinds, unboundPredecessorOutPortCount);

			// grab the in ports from the successor
			var successorInPorts = successor.apply(null, successorOutPortBinds);

			// assemble the full list of out port binds for predecessor
			var predecessorOutPortBinds = [];
			// insert the bound successor in ports in the right positions
			_.each(inOutBinding, function(outIndex, inIndex) {
				predecessorOutPortBinds[outIndex] = successorInPorts[inIndex];
			});
			// fill in the gaps with the remaining external out port binds
			_.reduce(remainingOutPortBinds, function(insertIndex, bind) {
				while (predecessorOutPortBinds[insertIndex] !== undefined) {
					insertIndex++;
				}

				predecessorOutPortBinds[insertIndex] = bind;
				return insertIndex;
			}, 0);

			var unboundSuccessorInPorts = _.remove(successorInPorts, function(port) {
				return !_.contains(predecessorOutPortBinds, port);
			});

			// grab the in ports from the predecessor
			var predecessorInPorts = predecessor.apply(null, predecessorOutPortBinds);

			// the successor in ports are appended to the predecessor in ports
			return predecessorInPorts.concat(unboundSuccessorInPorts);
		};

		return getFilledFlow(
			composite,
			predecessor.ins + unboundSuccessorInPortCount,
			unboundPredecessorOutPortCount + successor.outs);
	};

	var passThrough = wrapS(function() {
		var argv = _.toArray(arguments);
		var outArgs = _.initial(argv);
		var out = _.last(argv);
		out.apply(null, outArgs);
	}, 1);

	Namespace('Functipede').Namespace('flow', {
		wrap: wrap,
		wrapS: wrapS,
		wrapSerial: wrapSerial,
		append: append,
		chain: chain,
		passThrough: passThrough,
		getFilledFlow: getFilledFlow
	});
})();

(function() {
	var testFunc = function testFunc(a, b, outa, outb) {
		outa(a);
		outb(b);
	};

	var print = function print(arg) {
		console.log(arg);
	};

	var printa = function printa(arg) {
		print(arg);
	};

	var printb = function printb(arg) {
		print(arg);
	};

	var printc = function printc(arg) {
		print(arg);
	};

	var testFunc2 = function testFunc2(a, b, outa, outb) {
		outa('1:' + a);
		outb('2:' + b);
	};

	var testFunc3 = function testFunc3(a, out) {
		out(a + '\'n\'derp');
	};

	var testFunc4 = function testFunc2(a, b, outa, outb) {
		outa('3:' + a);
		outb('4:' + b);
	};

	var wrapped = Functipede.flow.wrap(testFunc, 2, 2);
	var wrappedS = Functipede.flow.wrapS(testFunc, 2);
	var inputs = wrapped(print, print);
	var inputS = wrappedS(print, print)[0];
	inputs[0]('hello');
	inputs[1]('world');
	inputS('hello', 'world');

	var wrapped2 = Functipede.flow.wrap(testFunc2, 2, 2);
	var wrapped3 = Functipede.flow.wrap(testFunc3, 1, 1);
	var wrapped4 = Functipede.flow.wrap(testFunc4, 2, 2);

	var chain23 = Functipede.flow.append(wrapped2, wrapped3, { 1:0 });
	var inputs23 = chain23(print, print);
	inputs23[0]('diddly');
	inputs23[1]('bewp');

	var chain22 = Functipede.flow.append(wrapped2, wrapped2, { 0:1, 1:0 });
	var inputs22 = chain22(print, print);
	inputs22[0]('uno');
	inputs22[1]('dos');

	var anotherChain22 = wrapped2.append(wrapped2, { 0:1, 1:0 });
	var anotherInputs22 = anotherChain22(print, print);
	anotherInputs22[0]('uno');
	anotherInputs22[1]('dos');

	var chain13 = Functipede.flow.chain(wrappedS, null, wrapped3);
	var input13 = chain13(print, print)[0];
	input13('heep', 'beep');

	var anotherChain13 = wrappedS.chain(null, wrapped3).chain(null, wrapped3).chain(null, wrapped3);
	var anotherInput13 = anotherChain13(print, print)[0];
	anotherInput13('cheep', 'peep');

	var testFlowFunc = function testFlowFunc(callback) {
		return _.times(3, function(index) {
			return function() {
				return callback('echoing ' + index);
			};
		});
	};

	var flow = Functipede.flow.getFilledFlow(testFlowFunc, 3, 1);
	var flowInputs = flow(print);
	flowInputs[0]();
	flowInputs[1]();
	flowInputs[2]();

	var flow124 = wrapped2.append(wrapped4, {1:0});
	var flow124Inputs = flow124(printa, printb, printc);
	flow124Inputs[0]('first');
	flow124Inputs[1]('second');
	flow124Inputs[2]('fourth');

	var testFuncSerial = function testFuncSerial(a) {
		return 'huehuehue(' + a + ')';
	};

	var flowSerial = Functipede.flow.wrapSerial(testFuncSerial);
	var flowSerialInput = flowSerial(print)[0];
	flowSerialInput('HUAHUAHUAHUAHUA');
})();
