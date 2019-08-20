const { is, data, any, number, string, union } = require("@algebraic/type");
const { List, Map, Set } = require("@algebraic/collections");
const Task = require("./task");
const Independent = require("./independent");
const KeyPath = require("@algebraic/ast/key-path");
const until = require("@climb/until");
const update = require("@cause/cause/update");


const Isolate = data `Isolate` (
    entrypoint  =>  any,
    concurrency =>  number,
    running     =>  [Map(string, Promise), Map(string, Promise)()],/*,
    open        =>  List(Task),
    running     =>  Map(string, Task),
    memoized    =>  Map(string, Task),
    finish      =>  Function,
    settle      =>  Function*/ );


module.exports = function run(entrypoint, concurrency = 1)
{
    return new Promise(function (resolve, reject)
    {
        let isolate = Isolate({ entrypoint, concurrency });
        
        console.log(Task.Continuation.update(entrypoint, isolate));
/*        const finish = task =>
            is(Task.Success, task) ?
                resolve(task.value) : reject(task);
        const settle = (succeeded, forContentAddress) => value =>
            isolate = update(isolate,
                PromiseSettled.from(succeeded, forContentAddress, value));

        let isolate = Isolate({ concurrency: 1, task, settle, finish });
console.log(isolate);
        isolate = allot(isolate);
console.log(isolate);*/
    });
}
/*
    
    if (ready.length <= 0)
        return [graph, isolate];

    const [uGraph, uIsolate, dependents] = ready
        .reduce(run, [graph, isolate, DenseIntSet.Empty]);
    const uCompleted = uGraph.completed;
    const uReady = DenseIntSet
        .toArray(dependents)
        .filter(index => DenseIntSet
            .isSubsetOf(uCompleted, nodes.get(index).dependencies));

    return reduce(uGraph, uReady, uIsolate);*/
//}
