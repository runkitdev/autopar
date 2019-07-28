const { isArray, from: ArrayFrom } = Array;

const Task = require("@cause/task");
const Dependent = require("@cause/task/dependent");

const { parallelize, operator, precomputed } = require("./parallelize");
const success = value => Task.Success({ value });

module.exports.success = success;

module.exports.parallel = function parallel(f)
{
    return Task.taskReturning(f);
}

const depend = (function ()
{
    const toTask = function toTask ([invocation, args])
    {
        const isMemberCall = isArray(invocation);
        const thisArg = isMemberCall ? invocation[0] : void(0);
        const f = isMemberCall ? thisArg[invocation[1]] : invocation;

        return taskApply(f, thisArg, args);
    }

    return function depend(callee, ...invocations)
    {
        const taskCallee = Task.Success({ value: callee });
        const args = invocations.map(toTask);

        return Dependent.fromCall({ callee: taskCallee, args });
    }
})();

module.exports.depend = depend;

function taskApply(f, thisArg, args)
{
    return  Task.isTaskReturning(f) ?
            f.apply(thisArg, args) :
            Task.fromResolvedCall(thisArg, f, args);
}

module.exports.apply = parallelize.apply;

module.exports.operators =
{
    "?:": operator `?:` (
        (test, consequent, alternate) =>
            test ? consequent() : alternate(),

        (test, branchingConsequent, alternate) =>
            test ? branchingConsequent() : success(alternate()),

        (test, consequent, branchingAlternate) =>
            test ? success(consequent()) : branchingAlternate(),

        (test, branchingConsequent, branchingAlternate) =>
            test ? branchingConsequent() : branchingAlternate() ),

    "||": operator `||` (
        (fLeft, fRight) => fLeft() || fRight(),

        (branchingLeft, fRight) =>
            depend(left => success(left || fRight()), branchingLeft()),

        (fLeft, branchingRight) =>
            (left => left ? success(left) : branchingRight())(fLeft()),

        (branchingLeft, branchingRight) =>
            depend(left => left ? success(left) : branchingRight(),
                branchingLeft()) ),

    "&&": operator `&&` (
        (fLeft, fRight) => fLeft() && fRight(),

        (branchingLeft, fRight) =>
            depend(left => success(left && fRight()), branchingLeft()),

        (fLeft, branchingRight) =>
            (left => left ? branchingRight() : success(left))(fLeft()),

        (branchingLeft, branchingRight) =>
            depend(left => left ? branchingRight() : success(left),
                branchingLeft()) )
}

precomputed (Array.prototype.map, [0], function (f, thisArg)
{
    // f.apply(null || undefined) just uses the default this, so don't bother
    // with the indrection in that case.
    const fApplied = (...args) => taskApply(f, thisArg, args);

    // We use Array.from (instead of `this.map`) in case `this` is some weird
    // subclass. In that case, `this.map` would also be that subclass and
    // `depend()` expects an array.
    const tasks = ArrayFrom(this, fApplied);

    // Dependent will call us with the resolved tasks, so now do a "mock" map
    // to return the those elements.
    const callee = success((...args) =>
        success(this.map((_, index) => args[index])));

    return Dependent.fromCall({ callee, args: tasks });
});

/*
module.exports = δ;

function parallelize(f, ds)
{
    return cache(f, ds, fromStandard);
};

parallel.success = success;

parallel.depend = function (lifted, callee, args)
{
    const lifted = false;
    const calleeTask = success(callee);

    return Dependent.wrap({ lifted, callee, arguments: args });
}

parallel.apply = function (object, property, ds, args)
{
    return δ(object[property], ds).apply(object, args);
}

function fromStandard(f, ds, knownSync = false)
{
    if (ds.length > 0)
        throw TypeError(`Can not take δ of ${f.name} on [${ds.join(", ")}]`);

    return knownSync ?
        (...args) => success(f(...args)) :
        fromAsync((...args) => Promise.resolve(f(...args)));
}

const δmap = (map, convertBack) => cache(map, [0], () => function (f)
{
    const dependencies = map.call(this, f);
    const callee = (...args) => convertBack(args);

    return δ.depend(true, success(callee), ...dependencies);
});

δmap(Array.prototype.map, Array.from);

const { List, Set, OrderedSet, Seq, Stack } = require("@algebraic/collections");

[List, Set, OrderedSet, Seq, Stack]
    .map(type => [type, Object.getPrototypeOf(type(Object)())])
    .map(([type, prototype]) => δmap(prototype.map, type(Object)));
*/
