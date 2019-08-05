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

const { tArrowFunctionWrap, tBranching, tOperators, tGuard } = require("./templates");


module.exports = map(
{
    TryStatement(statement)
    {
        const fromFunction = require("./differentiate");
        const { block, handler } = statement;
        const fBlock = tArrowFunctionWrap(block);
        const fHandler = handler && Node.ArrowFunctionExpression(
        {
            params: handler.param && [handler.param],
            body: handler.body
        });
        const expression = Node.CallExpression(
        {
            callee: tGuard,
            arguments: [fromFunction(fBlock), fromFunction(fHandler)]
        });

        return Node.ExpressionStatement({ expression });
    },

    ConditionalExpression(expression)
    {
        const { test, consequent, alternate } = expression;

        if (!branches(consequent) && !branches(alternate))
            return expression;

        return Node.CallExpression(
        {
            callee: tOperators["?:"],
            arguments: [test,
                toMaybeBranching(consequent),
                toMaybeBranching(alternate)]
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
            arguments: [toMaybeBranching(left), toMaybeBranching(right)]
        });
    }
});

function toMaybeBranching(argument)
{
    const fromFunction = require("./differentiate");

    return  branches(argument) ?
            tBranching(fromFunction(tArrowFunctionWrap(argument))) :
            tArrowFunctionWrap(argument);
}

