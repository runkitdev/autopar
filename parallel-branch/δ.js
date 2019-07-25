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

module.exports.depend = (function ()
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

        return Dependent.fromCall({ callee: taskCallee, arguments: args });
    }
})();

function taskApply(f, thisArg, args)
{
    return  Task.isTaskReturning(f) ?
            f.apply(thisArg, args) :
            Task.fromResolvedCall(thisArg, f, args);
}

module.exports.apply = parallelize.apply;

module.exports.operators =
{
    ternary: operator `ternary` (
        (test, consequent, alternate) =>
            test ? consequent() : alternate(),

        (test, branchingConsequent, alternate) =>
            test ? branchingConsequent() : success(alternate()),

        (test, consequent, branchingAlternate) =>
            test ? success(consequent()) : branchingAlternate(),

        (test, branchingConsequent, branchingAlternate) =>
            test ? branchingConsequent() : branchingAlternate() )
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

    return Dependent.fromCall({ callee, arguments: tasks });
});

console.log(module.exports.operators.ternary);

/*

 (
    ([1,2]) =>
    )


(t, c, a) => t ? c() : a();

module.exports.operators =
{
    ...operator `?:` (

        ((test, consequent, alternate) =>
            test ? consequent() : alternate()),
        [[1], (test, δconsequent, alternate) =>
            test ? δconsequent() : success(alternate())],
        [[2], (test, consequent, δalternate) =>
            test ? success(consequent()) : δalternate()],
        [[1,2], (test, δconsequent, δalternate) =>
            test ? δconsequent() : δalternate()])
}

console.log(module.exports.operators["?:"]);

function operator([name])
{
    return function (f, ...precached)
    {
        const operator = fNamed(name, f);

        precached.map(([ds, df]) => cache(operator, ds, () => df));

        return { [name]: operator };
    }
}




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

const oprators =

const operators = Object.fromEntries(Object.entries(
{
    "+": (lhs, rhs) => lhs + rhs,
    "-": (lhs, rhs) => lhs - rhs,
    "*": (lhs, rhs) => lhs * rhs,
    "/": (lhs, rhs) => lhs / rhs,
    "%": (lhs, rhs) => lhs / rhs,
    "**": (lhs, rhs) => lhs ** rhs,
    "unary -": value => -value,
    "unary +": value => +value,

    "&": (lhs, rhs) => lhs & rhs,
    "|": (lhs, rhs) => lhs | rhs,
    "^": (lhs, rhs) => lhs ^ rhs,
    "<<": (lhs, rhs) => lhs << rhs,
    ">>": (lhs, rhs) => lhs >> rhs,
    ">>>": (lhs, rhs) => lhs >> rhs,
    "~": value => ~value,

    "==": (lhs, rhs) => lhs == rhs,
    "===": (lhs, rhs) => lhs === rhs,
    "!=": (lhs, rhs) => lhs != rhs,
    "!==": (lhs, rhs) => lhs !== rhs,
    ">": (lhs, rhs) => lhs > rhs,
    ">=": (lhs, rhs) => lhs >= rhs,
    "<": (lhs, rhs) => lhs < rhs,
    "<=": (lhs, rhs) => lhs <= rhs,

    "!": value => !value,

    "typeof": value => typeof value,
    "in": (lhs, rhs) => lhs in rhs,
    "instanceof": (lhs, rhs) => lhs instanceof rhs,

    ".": (lhs, rhs) => (value =>
        typeof value === "function" ?
            value.bind(lhs) : value)(lhs[rhs])

}).map(([operator, f]) =>
    [operator, (cache(fNamed(operator, f), [],
        (f, ds) => fromStandard(f, ds, true)), f)]));

operators["?:"] = fNamed("?:",
    (test, consequent, alternate) =>
        test ? consequent() : alternate());

cache(operators["?:"], [1], () =>
    (test, δconsequent, alternate) =>
        test ? δconsequent() : success(alternate()));
cache(operators["?:"], [2], () =>
    (test, consequent, δalternate) =>
        test ? success(consequent()) : δalternate());
cache(operators["?:"], [1,2], () =>
    (test, δconsequent, δalternate) =>
        test ? δconsequent() : δalternate());

operators["||"] = fNamed("||", () => (lhs, rhs) => lhs() || rhs());
cache(operators["||"], [0], () => (δlhs, rhs) =>
    δ.depend(false, lhsValue => success(lhsValue || rhs()), δlhs()));
cache(operators["||"], [1], () => (lhs, δrhs) =>
    (lhsValue => lhsValue ? success(lhsValue) : δrhs())(lhs()));
cache(operators["||"], [0, 1], () => (δlhs, δrhs) =>
    δ.depend(false, lhsValue =>
        lhsValue ? success(lhsValue) : δrhs(), δlhs()));

operators["&&"] = fNamed("&&", () => (lhs, rhs) => lhs() && rhs());
cache(operators["&&"], [0], () => (δlhs, rhs) =>
    δ.depend(false, lhsValue => success(lhsValue && rhs()), δlhs()));
cache(operators["&&"], [1], () => (lhs, δrhs) =>
    (lhsValue => !lhsValue ? success(lhsValue) : δrhs())(lhs()));
cache(operators["&&"], [0, 1], () => (δlhs, δrhs) =>
    δ.depend(false, lhsValue =>
        !lhsValue ? success(lhsValue) : δrhs(), δlhs()));

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

δ.operators = operators;
*/
/*
console.log(δ(operators["?:"], [1])+"");
console.log(δ(operators["?:"], [1]));
console.log(δ(operators["?:"], [2]));
console.log(δ(operators["?:"], [1, 2]));

console.log(δ(operators["||"], [0])+"");
console.log(δ(operators["||"], [0]));
console.log(δ(operators["||"], [1]));
console.log(δ(operators["||"], [0, 1]));

console.log(δ(operators["&&"], [0])+"");
console.log(δ(operators["&&"], [0]));
console.log(δ(operators["&&"], [1]));
console.log(δ(operators["&&"], [0, 1]));

//console.log(δ(operators["+"], [1, 2]));
console.log(δ(operators["&&"], [1])+"");
module.exports.operators = operators;*/
