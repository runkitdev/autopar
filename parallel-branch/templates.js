const fromEntries = require("@climb/from-entries");
const { is, string, type } = require("@algebraic/type");
const { Set } = require("@algebraic/collections");

const Node = require("@algebraic/ast/node");
const parse = require("@algebraic/ast/parse");
const valueToExpression = require("@algebraic/ast/value-to-expression");

const kBranch = Node.IdentifierExpression({ name: "branch" });

exports.tBranch = fExpression => Node.CallExpression
    ({ callee: kBranch, arguments: [fExpression] });

const kBranching = Node.IdentifierExpression({ name: "branching" });

exports.tBranching = fExpression => Node.CallExpression
    ({ callee: kBranching, arguments: [fExpression] });

exports.tOperators = fromEntries(["?:", "||", "&&"]
    .map(name => [name, parse.expression(`δ.operators["${name}"]`)]));

exports.tGuard = parse.expression("δ.guard");

const kNodes = parse.expression("δ.nodes");

exports.tNodes = nodes =>
    tConst("nodes", Node.CallExpression({ callee: kNodes, arguments: nodes }));

const tConst = (name, init) =>
    Node.BlockVariableDeclaration(
    {
        kind: "const",
        declarators: [Node.VariableDeclarator
            ({ id: Node.IdentifierPattern({ name }), init })]
    });

exports.tConst = tConst;

const tShorthandObject = names =>
    Node.ObjectPattern({ properties: names
        .map(name => Node.IdentifierPattern({ name }))
        .map(value => Node.ObjectPropertyPatternShorthand({ value })) });

const kStart = parse.expression("δ.start");
const kLocalNodes = parse.expression("nodes");

exports.tStartFunction = function (functionNode, ready)
{
    const initialScope = tShorthandObject(functionNode
        .params
        .reduce((bindingNames, parameter) =>
            bindingNames.concat(parameter.bindingNames.keySeq()),
            Set(string)())
        .toArray());
    const args = [kLocalNodes, initialScope, ready];
    const start = Node.CallExpression({ callee: kStart, arguments: args });
    const returnStatement = Node.ReturnStatement({ argument: start });
    const body = Node.BlockStatement({ body: [returnStatement] });
    const FunctionNode =
        type.of(functionNode) === Node.ArrowFunctionExpression ?
        Node.ArrowFunctionExpression :
        Node.FunctionExpression;

    return FunctionNode({ ...functionNode, body });
}

const kGraph = parse.expression("δ.start");

exports.tGraph = (ready, nodes) =>
    Node.CallExpression({ callee: kGraph, arguments: [ready, ...nodes] });

exports.tArrowFunctionWrap = expression =>
    Node.ArrowFunctionExpression({ body: expression });

const kApply = parse.expression("δ.apply");
const toPropertyExpression = property =>
    is (Node.PropertyName, property) ?
        Node.StringLiteral({ ...property, value: property.name }) :
        property;

exports.tApply = function (callee, ds, args)
{
    const signature = is (Node.MemberExpression, callee) ?
        [callee.object, toPropertyExpression(callee.property)] :
        [callee];
    const argExpressions = [signature, ds, args].map(valueToExpression);

    return Node.CallExpression({ callee: kApply, arguments: argExpressions });
}
