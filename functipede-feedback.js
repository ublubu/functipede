(function() {
    var passThrough = function passThrough() {
        var boundOutPort = null;
        var outFunc = function(outPort) {
            boundOutPort = outPort;
        };
        var inFunc = function() {
            return function(data) {
                if (boundOutPort) {
                    boundOutPort(data);
                }
            };
        };
        return {
            in: Functipede.flow.wrap(inFunc, 1, 0),
            out: Functipede.flow.wrap(outFunc, 0, 1)
        };
    };

    Namespace('Functipede').Namespace('feedback' {
        passThrough: passThrough
    });
})();
