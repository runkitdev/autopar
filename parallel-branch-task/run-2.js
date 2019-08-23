const { Δ,  is, data, any, number, string, union, boolean, object } = require("@algebraic/type");
const { List, Map, OrderedSet, Set } = require("@algebraic/collections");
const Task = require("./task");
const Independent = require("./independent");
const KeyPath = require("@algebraic/ast/key-path");
const until = require("@climb/until");
const update = require("@cause/cause/update");


const Thenable = object;

const Isolate = data `Isolate` (
    entrypoint      =>  any,
    memoizations    =>  [Map(string, any), Map(string, any)()],
    succeeded       =>  Function,
    failed          =>  Function,

    active          =>  [Set(string), Set(string)()],

    free            =>  [OrderedSet(number), OrderedSet(number)()],
    occupied        =>  [Map(number, Thenable), Map(number, Thenable)()],
    ([hasVacancy])  =>  [boolean, free => free.size > 0]
    /*,
    open        =>  List(Task),
    running     =>  Map(string, Task),
    memoized    =>  Map(string, Task),
    finish      =>  Function,
    settle      =>  Function*/ );


module.exports = function run(entrypoint, concurrency = 1)
{
    return new Promise(function (resolve, reject)
    {
        const range = Array.from({ length: concurrency }, (_, index) => index);
        const free = OrderedSet(number)(range);

        const settled = cast => UUID =>
            value => console.log("AND NOW " +(isolate = Isolate.settle(isolate, cast(value), UUID)));
        const succeeded = settled(value => Task.Success({ value }));
        const failed = settled(error => Task.Failure.from(error));

        let isolate = Isolate({ entrypoint, free, succeeded, failed });

        const [uIsolate, uEntrypoint] =
            Task.Continuation.start(isolate, entrypoint, "ROOT");

        isolate = Δ(uIsolate, { entrypoint: uEntrypoint });

        console.log(isolate);
    });
}

Isolate.settle = function (isolate, result, forContentAddress)
{
    const uMemoizations = isolate.memoizations.set(forContentAddress, result);
    const uIsolate = Δ(isolate, { memoizations: uMemoizations });

    return uIsolate;
}

Isolate.allot = function (isolate, thenable, forUUID)
{
    const slot = isolate.free.first();
    const uFree = isolate.free.remove(slot);
    const uOccupied = isolate.occupied.set(slot, thenable);
    const uIsolate = Δ(isolate, { free: uFree, occupied: uOccupied });

    // We Promise wrap because we can't be sure that then() won't do something
    // synchronously.
    Promise
        .resolve(thenable)
        .then(isolate.succeeded(forUUID), isolate.failed(forUUID));

    return uIsolate;
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
