require("./require-internal");

const { isArray, from: ArrayFrom } = Array;

const { any, number } = require("@algebraic/type");
const { List } = require("@algebraic/collections");
const Task = require("@parallel-branch/task");

const Scope = require("@parallel-branch/task/scope");
const Statement = require("@parallel-branch/task/statement");

const Dependent = require("@parallel-branch/task/dependent");
const { None } = require("@algebraic/type/optional");
const DenseIntSet = require("@algebraic/dense-int-set");

const { parallelize, operator, precomputed } = require("./parallelize");
const success = value => Task.Success({ name:"mm", value });
const aggregate = failures => Task.Failure.Aggregate({ name:"d", failures });

module.exports = function (...args)
{
	return require("./parallel")(...args);
}

module.exports.success = success;

module.exports.parallel = function parallel(f)
{
    return Task.taskReturning(f);
}

module.exports.define = function (entrypoints, ...serialized)
{
	const statements = serialized.map(Statement.deserialize);

	return Task.Definition({ entrypoints, statements });
}

module.exports.call = function (definition, thisArg, initialBindings)
{
	const scope = Scope.from(thisArg, initialBindings);

	return Task.Called({ definition, scope });
}

const depend = (function ()
{
    const toTask = function toTask (inputs)
    {
        const [invocation, args] = inputs;
        const isMemberCall = isArray(invocation);
        const thisArg = isMemberCall ? invocation[0] : void(0);
        const f = isMemberCall ? thisArg[invocation[1]] : invocation;
//console.log("f:", f, "this:", thisArg, "args:", args);
        return taskApply(f, thisArg, args);
    }

    return function depend(callee, ...invocations)
    {
        return Dependent.fromCall(
            Object.assign((succeeded, results) => succeeded ?
                callee(...results.map(task => task.value)) :
                aggregate(results), { callee: callee.name }),
            invocations.map(toTask), None);
    }
})();

module.exports.depend = depend;

function taskApply(f, thisArg, args)
{
    return  Task.isTaskReturning(f) ?
            f.apply(thisArg, args) :
            Task.fromResolvedCall(thisArg, f, args);
}

module.exports.tryCatch = (function ()
{
	const differentiate = require("./differentiate");
	const parse = require("@algebraic/ast/parse");
	const generate = node => require("@babel/generator").default(node).code;

	const tryCatch = function tryCatch(block, handler)
	{
		const [succeeded, value] = branch(wrapped(block()));

		return succeeded ? value : branch(handler(value));
	};
	const transformed = differentiate(parse.expression(tryCatch + ""));
	const generateTryCatch = new Function("δ", `return ${generate(transformed)}`);

	return generateTryCatch(module.exports);
})();

/*
module.exports.try = function (result, recover)
{
	if (is (Task.Failure, result))
		return branch recover(result.errors);

	return result.value;
}

module.exports.guard = Task.taskReturning(function guard(attempt, recover)
{
    return Dependent.fromCall(
        (succeeded, results) =>
            succeeded ? results[0] : recover(results),
        [attempt()], None);
});*/

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
            depend(left => success(left || fRight()), [branchingLeft, []]),

        (fLeft, branchingRight) =>
            (left => left ? success(left) : branchingRight())(fLeft()),

        (branchingLeft, branchingRight) =>
            depend(left => left ? success(left) : branchingRight(),
                [branchingLeft, []]) ),

    "&&": operator `&&` (
        (fLeft, fRight) => fLeft() && fRight(),

        (branchingLeft, fRight) =>
            depend(left => success(left && fRight()), [branchingLeft, []]),

        (fLeft, branchingRight) =>
            (left => left ? branchingRight() : success(left))(fLeft()),

        (branchingLeft, branchingRight) =>
            depend(left => left ? branchingRight() : success(left),
                [branchingLeft, []]) )
}

require("./map");

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
