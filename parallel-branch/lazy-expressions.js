const { List } = require("@algebraic/collections");

const map = require("@algebraic/ast/map");
const Node = require("@algebraic/ast/node");
const KeyPath = require("@algebraic/ast/key-path");
const NoKeyPaths = List(KeyPath)();

const freeVariables = (name, node) => node.freeVariables.get(name, NoKeyPaths);
const branches = node =>
    freeVariables("branch", node).size > 0 ||
    freeVariables("branching", node).size > 0;

const template = require("@algebraic/ast/template");
const tOperator = template(name => δ.operators[name]);
const tBranching = template(expression => branching(expression));
const functionWrap = body => Node.ArrowFunctionExpression({ body: Node.BlockStatement({ body:[Node.ReturnStatement({ argument: body })] }) });

module.exports = map(
{
    LogicalExpression(expression)
    {
        const { left, right, operator } = expression;

        if (!branches(right))
            return expression;

        const fromFunction = require("./differentiate");

        const fLeft = functionWrap(left);
        const leftBranches = branches(left);

        const fRight = functionWrap(right);
        const branchingRight = tBranching(fromFunction(fRight));

        return Node.CallExpression(
        {
            callee: tOperator(operator),
            arguments: [
                leftBranches ? tBranching(fromFuncion(fLeft)) : fLeft,
                branchingRight]
        });
    }
});
