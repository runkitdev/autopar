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

function ternary(test, consequent, alternate)
{
    return test ? consequent() : alternate();
}

precomputed(ternary, [1], ternary);
precomputed(ternary, [2], ternary);
precomputed(ternary, [1, 2], ternary);

module.exports.operators =
{
    "?:": ternary,
    "||": function (lhs, rhs)
    {
        const left = lhs();

        return left ? left : rhs();
    },
    "&&": function (lhs, rhs)
    {
        const left = lhs();

        return !left ? left : rhs();
    }
}

require("./map-iterable");
