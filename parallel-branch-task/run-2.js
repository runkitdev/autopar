const { Δ,  is, data, any, number, string, union, boolean, object } = require("@algebraic/type");
const { List, Map, OrderedSet, Set } = require("@algebraic/collections");
const Task = require("./task");
const Independent = require("./independent");
const KeyPath = require("@algebraic/ast/key-path");
const until = require("@climb/until");
const update = require("@cause/cause/update");
const DenseIntSet = require("@algebraic/dense-int-set");


const Thenable = object;

const ContentAddress    = string;
const zeroed = T => [T, T()];


const toSuccess = value => Task.Success({ value });
const toFailure = error => Task.Failure({ errors: List(Any)([error]) });

const Isolate = data `Isolate` (
    entrypoint          =>  any,

    memoizations        =>  zeroed(Map(ContentAddress, any)),

    settled             =>  Function,

    EIDs            =>  [Map(string, number), Map(string, number)()],
    nextEID         =>  [number, 1],

    free            =>  [OrderedSet(number), OrderedSet(number)()],
    occupied        =>  [Map(number, Thenable), Map(number, Thenable)()],
    ([hasVacancy])  =>  [boolean, free => free.size > 0] );

global.Isolate = Isolate;

module.exports = function run(entrypoint, concurrency = 1)
{
    return new Promise(function (resolve, reject)
    {
        const range = Array.from({ length: concurrency }, (_, index) => index);
        const free = OrderedSet(number)(range);
        const settled = (cast, slot, EID) => value =>
            isolate = Isolate.settle(isolate, cast(value), slot, EID);

        let isolate = Isolate({ entrypoint, free, settled });

        const [uIsolate, uEntrypoint] =
            Task.Continuation.start(isolate, entrypoint, 0);

        isolate = Δ(uIsolate, { entrypoint: uEntrypoint });

        console.log(isolate);
        console.log(uEntrypoint);
    });
}

// invocation *intrinsically* unmemoizable
// requested umemoizable
// memoizable

// Probably fail if already exists?
Isolate.assignExecutionID = function (isolate, invocation, memoizable)
{
    const { nextRID } = isolate;
    const contentAddress = !!memoizable && getContentAddressOf(invocation);

    if (contentAddress === false)
        return [Δ(isolate, { nextRID: nextRID + 1 }), nextRID];

    if (isolate.RIDs.has(contentAddress))
        return [isolate, isolate.RIDs.get(contentAddress)];

    const uRIDs = Δ(RIDs, { RIDs: isolate.RIDs.set(contentAddress, nextRID) });
    const uNextRID = nextRID + 1;
    const uIsolate = Δ(isolate, { nextRID: uNextRID, RIDs: uRIDs });

    return [uIsolate, nextRID];
}

const Settled = data `Settled` (
    byEID   => zeroed(Map(number, Task.Completed)),
    EIDs    => Array );

Isolate.settle = function (isolate, result, slot, forEID)
{
    // First off, make sure we free up this slot.
    const uFree = isolate.free.add(slot);
    const uOccupied = isolate.occupied.remove(slot);

    // If this was a memoizable execution, update the memoized result.
    const contentAddress = isolate.EIDs.get(forEID, false);
    const uMemoizations = contentAddress ?
        isolate.memoizations.set(contentAddress, result) :
        isolate.memoizations;

    const uIsolate = Δ(isolate,
        { free:uFree, occupied: uOccupied, memoizations: uMemoizations });

    const byEID = Map(number, Task.Completed)([[forEID, result]]);
    const EIDs = DenseIntSet.just(forEID);
    const settled = Settled({ byEID, EIDs });

    const [uuIsolate, uEntrypoint] =
        Task.Continuation.settle(uIsolate, isolate.entrypoint, settled);
console.log("ALL DONE: " + Δ(uuIsolate, { entrypoint: uEntrypoint }));
    return Δ(uuIsolate, { entrypoint: uEntrypoint });
}

Isolate.activate = function (isolate, forContentAddress)
{
    const EID = isolate.nextEID;

    const uNextEID = EID + 1;
    const uEIDs = forContentAddress !== false ?
        isolate.EIDs.set(EID, forContentAddress) :
        isolate.EIDs;

    const uMemoizations = forContentAddress !== false ?
        isolate.memoizations.set(forContentAddress, Task.Running({ EID })) :
        isolate.memoizations;

    const uIsolate = Δ(isolate,
        { EIDs: uEIDs, nextEID: uNextEID, memoizations: uMemoizations });

    return [uIsolate, EID];
}

Isolate.allot = function (isolate, thenable, EID)
{
    const slot = isolate.free.first();
    const uFree = isolate.free.remove(slot);
    const uOccupied = isolate.occupied.set(slot, thenable);

    // We Promise wrap because we can't be sure that then() won't do something
    // synchronously.
    const wrapped = Promise.resolve(thenable);
    const succeeded = isolate.settled(toSuccess, slot, EID);
    const failed = isolate.settled(toFailure, slot, EID);

    wrapped.then(succeeded, failed);

    return Δ(isolate, { free: uFree, occupied: uOccupied });
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
