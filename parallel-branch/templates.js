const fromEntries = require("@climb/from-entries");
const Node = require("@algebraic/ast/node");
const parse = require("@algebraic/ast/parse");

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