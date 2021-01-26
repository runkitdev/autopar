const { IntrinsicGenerator } = require("@algebraic/ast/to-source");
const { Apply, Branch, Branching } = require("parallel-branch/intrinsics");

const isIntrinsicCallTo = (intrinsic, node) =>
    node.type === "CallExpression" &&
    node.callee.type === "IntrinsicReference" &&
    node.callee.intrinsic === intrinsic;

const toIntrinsicReference = intrinsic =>
    ({ type: "IntrinsicReference", intrinsic });

class BranchGenerator extends IntrinsicGenerator
{
    CallExpression (node, parent, ...rest)
    {
        const fallback = () => super.CallExpression(node, parent, ...rest);

        if (!isIntrinsicCallTo(Branch, node) ||
            node.arguments.length !== 1)
            return fallback();

        const argument = node.arguments[0];

        if (argument.type !== "CallExpression" ||
            !isIntrinsicCallTo(Apply, argument.callee))
            return fallback();

        const δapplyCallExpression = argument.callee;    
        const [receiverExpression, dsExpression] =
            δapplyCallExpression.arguments;

        const [object, property] = receiverExpression.elements;
        const ds = new Set(dsExpression
            .elements
            .map(literal => literal.value));

        return this.print(
        {
            type: node.optional ?
                "OptionalCallExpression" :
                "CallExpression",
            callee: object,
            arguments: argument
                .arguments
                .map((argument, index) => !ds.has(index) ?
                    argument:
                    {
                        type: "CallExpression",
                        callee: toIntrinsicReference(Branching),
                        arguments: [argument]   
                    })
        }, parent, ...rest);
    }
}

module.exports = (ast, ...rest) =>
    new BranchGenerator(ast, ...rest).generate().code;

module.exports.BranchGenerator = BranchGenerator;

