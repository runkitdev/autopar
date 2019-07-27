const { List } = require("@algebraic/collections");

const map = require("@algebraic/ast/map");
const parse = require("@algebraic/ast/parse");
const Node = require("@algebraic/ast/node");
const KeyPath = require("@algebraic/ast/key-path");
const NoKeyPaths = List(KeyPath)();

const freeVariables = (name, node) => node.freeVariables.get(name, NoKeyPaths);
const branches = node =>
    freeVariables("branch", node).size > 0 ||
    freeVariables("branching", node).size > 0;

const tOperators = Object.fromEntries(["?:", "||", "&&"]
    .map(name => [name, parse.expression(`δ.operators["${name}"]`)]));

const template = require("@algebraic/ast/template");
const tBranching = template(expression => branching(expression));
const functionWrap = body => Node.ArrowFunctionExpression({ body: Node.BlockStatement({ body:[Node.ReturnStatement({ argument: body })] }) });

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
        tBranching(fromFunction(functionWrap(argument))) :
        functionWrap(argument));
}
