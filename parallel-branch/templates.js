const fromEntries = require("@climb/from-entries");
const { is } = require("@algebraic/type");

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
