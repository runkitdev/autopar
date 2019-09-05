const Task = require("@parallel-branch/task");
const Scope = require("@parallel-branch/task/scope");
const Statement = require("@parallel-branch/task/statement");
const transform = require("./transform");

const { parallelize, operator, precomputed } = require("./parallelize");

const δ = function δ(f, bs)
{
	return parallelize(δ, f, bs);
}

module.exports = δ;

module.exports.define = function (name, entrypoints, ...serialized)
{
	const statements = serialized.map(Statement.deserialize);

	return Task.Definition({ name, entrypoints, statements });
}

module.exports.call = function (definition, thisArg, initialBindings)
{
	const scope = Scope.from(thisArg, initialBindings);

	return Task.Called({ definition, scope });
}

module.exports.apply = (signature, bs, args) =>
{
    if (signature.length === 1)
        return δ(signature[0], bs)(...args);

    const [object, property] = signature;

    return δ(object[property], bs).apply(object, args);
}

module.exports.tryCatch = transform.function(function (block, handler)
{
	const [succeeded, value] = branch(wrapped(block()));

	return succeeded ? value : branch(handler(value));
});

module.exports.operators =
{
    "?:": operator `?:` (
        (test, consequent, alternate) =>
            test ? consequent() : alternate(),

        (test, branchingConsequent, alternate) =>
            test ? branchingConsequent() : alternate(),

        (test, consequent, branchingAlternate) =>
            test ? consequent() : branchingAlternate(),

        (test, branchingConsequent, branchingAlternate) =>
            test ? branchingConsequent() : branchingAlternate() ),

    "||": operator `||` (
        (fLeft, fRight) => fLeft() || fRight(),

//        (branchingLeft, fRight) =>
//            depend(left => success(left || fRight()), [branchingLeft, []]),

        (fLeft, branchingRight) => fLeft() || branchingRight(),

//        (branchingLeft, branchingRight) =>
//            depend(left => left ? success(left) : branchingRight(),
//                [branchingLeft, []]) ),
	),

    "&&": operator `&&` (
        (fLeft, fRight) => fLeft() && fRight(),

//        (branchingLeft, fRight) =>
//            depend(left => success(left && fRight()), [branchingLeft, []]),

        (fLeft, branchingRight) => fLeft() && branchingRight(),

//        (branchingLeft, branchingRight) => { console.log("HERE 2"); return branchingLeft() && branchingRight() })
	)
}

require("./map-iterable");
