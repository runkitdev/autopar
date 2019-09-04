const fromEntries = require("@climb/from-entries");
const { is, string, type } = require("@algebraic/type");
const { Set } = require("@algebraic/collections");

const Node = require("@algebraic/ast/node");
const parse = require("@algebraic/ast/parse");
const valueToExpression = require("@algebraic/ast/value-to-expression");

exports.kTryCatch = parse.expression("δ.tryCatch");

const tCall = (callee, ...args) =>
    Node.CallExpression({ callee, arguments: args });

exports.call = tCall;

const kBranch = Node.IdentifierExpression({ name: "branch" });
const tBranch = fExpression => tCall(kBranch, fExpression);

exports.tBranch = tBranch;
exports.branch = tBranch;

const kBranching = Node.IdentifierExpression({ name: "branching" });
const tBranching = fExpression => tCall(kBranching, fExpression);

exports.branching = tBranching;
exports.tBranching = tBranching;

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

const tShorthandPattern = names =>
    Node.ObjectPattern({ properties: names
        .map(name => Node.IdentifierPattern({ name }))
        .map(value => Node.ObjectPropertyPatternShorthand({ value })) });

exports.tShorthandPattern = tShorthandPattern;

const toArray = iterable =>
    Array.isArray(iterable) ? iterable : iterable.toArray();
const tShorthandObject = names =>
    Node.ObjectExpression({ properties:
        toArray(names)
            .map(name => Node.IdentifierExpression({ name }))
            .map(value => Node.ObjectPropertyShorthand({ value })) });

exports.tShorthandObject = tShorthandObject;

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
