const { data, union, is, any, string } = require("@algebraic/type");
const Cause = require("@cause/cause");
const update = require("@cause/cause/update");
const inspect = Symbol.for("nodejs.util.inspect.custom");
const Task = require("./task");
const { KeyPathsByName } = require("@algebraic/ast/key-path");


const Independent = union `Task.Independent` (
    data `Waiting` (
        callee              =>  Function,
        contentAddress      =>  [string, `same`],
        ([waitingLeaves])   =>  KeyPathsByName
                                    .compute (take => `contentAddress`),
        ([runningLeaves])   =>  data.always (KeyPathsByName.None)  ),

    data `Running` (
        contentAddress      =>  [string, `same`],
        ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
        ([runningLeaves])   =>  KeyPathsByName.compute (
                                    take => `contentAddress`) ) );

Independent.Waiting.update = update
    .on(Independent.Running, (initial, running) =>
    [
        Independent.Running({ ...initial, running }),
        [Independent.Running({ ...initial, running })]
    ])
    .on(Task.Failure, (waiting, event) =>
        [event, [event]]);

Independent.Running.update = update
    .on(Task.Success, (initial, event) =>
        [event, [event]])
    .on(Task.Failure, (waiting, event) =>
        [event, [event]]);

Independent.fromResolvedCall = function (self, fUnknown, args = [])
{
    if (typeof fUnknown !== "function")
        return Task.Failure.Direct({ value:
            Error("Passed non-function to fromResolvedCall") });

    return Independent.Waiting({ callee: fUnknown });
}

module.exports = Independent;
