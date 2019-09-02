const { Δ,  is, data, any, number, string, union, boolean, object } = require("@algebraic/type");
const { List, Map, OrderedSet, Set } = require("@algebraic/collections");
const Task = require("./task");
const Independent = require("./independent");
const KeyPath = require("@algebraic/ast/key-path");
const until = require("@climb/until");
const update = require("@cause/cause/update");
const DenseIntSet = require("@algebraic/dense-int-set");
const EIDMap = require("./eid-map");


const Thenable = object;

const ContentAddress    = string;
const zeroed = T => [T, T()];


const toSuccess = value => Task.Success({ value });
const toFailure = error => Task.Failure({ errors: List(any)([error]) });

const Isolate = data `Isolate` (
    settle              =>  Function,
    entrypoint          =>  any,
    memoizations        =>  zeroed(Map(ContentAddress, any)),

    EIDs            =>  [Map(string, number), Map(string, number)()],
    nextEID         =>  [number, 1],

    free            =>  [OrderedSet(number), OrderedSet(number)()],
    occupied        =>  [Map(number, Thenable), Map(number, Thenable)()],
    ([hasVacancy])  =>  [boolean, free => free.size > 0] );

global.Isolate = Isolate;

const Continuation = Task.Continuation;

module.exports = function run(entrypoint, concurrency = 2)
{
    return new Promise(function (resolve, reject)
    {
        const range = Array.from({ length: concurrency }, (_, index) => index);
        const free = OrderedSet(number)(range);
        const settle = (cast, slot, EID) => function (value)
        {
            isolate = Isolate.settle(isolate, cast(value), slot, EID);
            bridge(resolve, reject, isolate.entrypoint);
        }

        const sIsolate = Isolate({ resolve, reject, entrypoint, free, settle });
        const [uIsolate, uEntrypoint] =
            Task.Continuation.start(sIsolate, entrypoint, 0);

        if (!bridge(resolve, reject, uEntrypoint))
            isolate = Δ(uIsolate, { entrypoint: uEntrypoint });
    });
}

function bridge(resolve, reject, entrypoint)
{
    if (is (Task.Success, entrypoint))
        return (resolve(entrypoint.value), true);

    if (is (Task.Failure, entrypoint))
        return (reject(entrypoint.errors.toArray()), true);

    return false;
}

// invocation *intrinsically* unmemoizable
// requested umemoizable
// memoizable

const Completed = data `Completed` (
    byEID   => zeroed(Map(number, Task.Completed)),
    EIDs    => [Array, DenseIntSet.Empty] );

global.Completed = Completed;

Completed.Empty = Completed();
Completed.add = function (result, EID, completed)
{
    const uByEID = completed.byEID.set(EID, result);
    const uEIDs = DenseIntSet.add(EID, completed.EIDs);

    return Completed({ byEID: uByEID, EIDs: uEIDs });
}

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

    const completed = EIDMap.of(forEID, result);
    const [[uCompleted, uuIsolate], uEntrypoint] =
        Task.Continuation.settle([completed, uIsolate], isolate.entrypoint);

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
    const succeeded = isolate.settle(toSuccess, slot, EID);
    const failed = isolate.settle(toFailure, slot, EID);

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
