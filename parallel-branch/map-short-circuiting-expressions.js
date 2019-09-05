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

const t = require("./templates");
const { tArrowFunctionWrap, tBranch, tBranching, tOperators } = require("./templates");


module.exports = map(
{
    TryStatement(statement)
    {
        const fromFunction = require("./transform");
        const { block, handler } = statement;
        const fBlock = tArrowFunctionWrap(block);
        const fHandler = handler && Node.ArrowFunctionExpression(
        {
            params: handler.param && [handler.param],
            body: handler.body
        });
        const expression = Node.CallExpression(
        {
            callee: t.kTryCatch,
            arguments: [fromFunction(fBlock), fromFunction(fHandler)]
        });

        return Node.ReturnStatement({ argument: tBranch(expression) });
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
    const fromFunction = require("./transform");

    return  branches(argument) ?
            tBranching(fromFunction(tArrowFunctionWrap(argument))) :
            tArrowFunctionWrap(argument);
}

