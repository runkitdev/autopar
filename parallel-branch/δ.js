const Task = require("@parallel-branch/task");
const Scope = require("@parallel-branch/task/scope");
const Statement = require("@parallel-branch/task/statement");

const { parallelize, operator, precomputed } = require("./parallelize");


module.exports = function (...args)
{
	return parallelize(...args);
}

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

module.exports.apply = parallelize.apply;

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
