const { List } = require("@algebraic/collections");

const map = require("@algebraic/ast/map");
const parse = require("@algebraic/ast/parse");
const Node = require("@algebraic/ast/node");
const KeyPath = require("@algebraic/ast/key-path");
const NoKeyPaths = List(KeyPath)();

const freeVariables = (name, node) =>
    node.freeVariables.get(name, NoKeyPaths);
const branches = node =>
    freeVariables("branch", node).size > 0 ||
    freeVariables("branching", node).size > 0;

const { tArrowFunctionWrap, tBranching, tOperators } = require("./templates");


module.exports = map(
{
    ConditionalExpression(expression)
    {
        const { test, consequent, alternate } = expression;

        if (!branches(consequent) && !branches(alternate))
            return expression;

        return Node.CallExpression(
        {
            callee: tOperators["?:"],
            arguments: [test, ...toBranchingArguments(consequent, alternate)]
        });
    },

    LogicalExpression(expression)
    {
        const { left, right, operator } = expression;

        if (!branches(right))
            return expression;

        return Node.CallExpression(
        {
            callee: tOperators[operator],
            arguments: toBranchingArguments(left, right)
        });
    }
});

function toBranchingArguments(...args)
{
    const fromFunction = require("./differentiate");

    return args.map(argument => branches(argument) ?
        tBranching(fromFunction(tArrowFunctionWrap(argument))) :
        tArrowFunctionWrap(argument));
}

